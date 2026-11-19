// KABATEC Consulting — paiement en ligne de l'abonnement (SasPay).
// Actions (POST JSON) :
//   info   → { enabled, price, months }                  (le bouton ne s'affiche que si enabled)
//   create → { shopId }  → { url, ref }                  (crée la page de paiement SasPay)
//   status → { ref }     → { paid, until? }              (vérifie le paiement chez SasPay)
//   saleInfo   → { shopId } → { enabled }                (ce commerce peut-il encaisser des ventes en ligne ?)
//   createSale → { shopId, amount, label } → { url, ref } (lien de paiement d'une vente en boutique)
import crypto from "node:crypto";
import { cfg, db, saspay, settle, validCode, saleShops, REGISTRY_KEY } from "./_saspay.js";

const TEST_SHOP_CODE = "TEST-MTE-DEV";
const DEMO_PREFIX = "DEMO-";
const hits = new Map(); // limite d'essais par adresse IP et par type d'action
function tooMany(key, max) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const c = cfg();
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const enabled = !!(c.sk && c.whSecret && c.email && c.price && c.URL_ && c.KEY);

  const baseOk = !!(c.sk && c.email && c.URL_ && c.KEY);
  if (body.action === "saleInfo") {
    const sid = String(body.shopId || "");
    return res.status(200).json({ enabled: baseOk && validCode(sid) && saleShops().includes(sid) });
  }
  if (body.action === "info") return res.status(200).json({ enabled, price: enabled ? c.price : 0, months: c.months });
  const isSaleAction = body.action === "createSale" || body.action === "status";
  if (!(isSaleAction ? baseOk : enabled)) return res.status(503).json({ error: "Paiement en ligne non configuré." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  // Création de paiement : peu d'essais. Vérification (« status ») : plus large, car l'application la répète toutes les 3-4 s.
  if (tooMany(ip + ":" + (body.action === "status" ? "s" : "c"), body.action === "status" ? 400 : 20)) return res.status(429).json({ error: "Trop d'essais. Réessaie dans quelques minutes." });
  const { rest, must } = db(c);

  try {
    if (body.action === "create") {
      const shopId = String(body.shopId || "");
      if (!validCode(shopId) || shopId === TEST_SHOP_CODE || shopId.startsWith(DEMO_PREFIX)) return res.status(400).json({ error: "Commerce invalide." });
      const r = await must(await rest(`kv_store?key=eq.${encodeURIComponent(REGISTRY_KEY)}&select=value`));
      const rows = await r.json();
      const shop = (Array.isArray(rows[0]?.value) ? rows[0].value : []).find((s) => s.code === shopId);
      if (!shop) return res.status(404).json({ error: "Commerce introuvable." });

      const ref = crypto.randomBytes(16).toString("hex");
      const session = await saspay(c, "/checkout-sessions/", {
        method: "POST",
        body: JSON.stringify({
          amount: c.price.toFixed(2),
          currency: "XOF",
          description: `Abonnement ${c.months} mois — ${shopId}`,
          customer_email: c.email,
          customer_name: `Commerce ${shopId}`,
          country: "TG",
          return_url: `${c.appUrl}/?pay=${ref}`,
          metadata: { shopId, ref, purpose: "subscription" },
        }),
      });
      if (!session.ok || !session.data?.checkout_url || !session.data?.id) return res.status(502).json({ error: "SasPay n'a pas pu créer le paiement. Réessaie plus tard." });
      await must(await rest("saspay_pending", { method: "POST", body: JSON.stringify({ ref, session_id: String(session.data.id), shop_id: shopId, months: c.months, amount: c.price, currency: "XOF" }) }));
      return res.status(200).json({ url: session.data.checkout_url, ref });
    }

    if (body.action === "createSale") {
      const shopId = String(body.shopId || "");
      const amount = Math.round(Number(body.amount));
      if (!validCode(shopId) || !saleShops().includes(shopId)) return res.status(403).json({ error: "Ce commerce n'est pas autorisé à encaisser en ligne." });
      if (!(amount >= 100 && amount <= 2000000)) return res.status(400).json({ error: "Montant invalide (entre 100 et 2 000 000 FCFA)." });
      const label = String(body.label || "Vente").replace(/[\r\n]/g, " ").slice(0, 80);
      const ref = crypto.randomBytes(16).toString("hex");
      const session = await saspay(c, "/checkout-sessions/", {
        method: "POST",
        body: JSON.stringify({
          amount: amount.toFixed(2),
          currency: "XOF",
          description: `${label} — ${shopId}`,
          customer_email: c.email,
          customer_name: `Client ${shopId}`,
          country: "TG",
          return_url: `${c.appUrl}/`,
          metadata: { shopId, ref, purpose: "sale" },
        }),
      });
      if (!session.ok || !session.data?.checkout_url || !session.data?.id) return res.status(502).json({ error: "SasPay n'a pas pu créer le paiement. Réessaie plus tard." });
      await must(await rest("saspay_pending", { method: "POST", body: JSON.stringify({ ref, session_id: String(session.data.id), shop_id: shopId, months: 0, amount, currency: "XOF", kind: "sale", label }) }));
      return res.status(200).json({ url: session.data.checkout_url, ref });
    }

    if (body.action === "status") {
      const ref = String(body.ref || "");
      if (!/^[a-f0-9]{32}$/.test(ref)) return res.status(400).json({ error: "Référence invalide." });
      const r = await must(await rest(`saspay_pending?ref=eq.${ref}&select=*`));
      const rows = await r.json();
      if (!rows[0]) return res.status(404).json({ error: "Paiement introuvable." });
      const out = await settle(c, rows[0]);
      return res.status(200).json(out);
    }
    return res.status(400).json({ error: "Action inconnue." });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur : " + (e.message || "inconnue") });
  }
}
