// Moïse Tech & Énergie — boutique en ligne du site vitrine (paiement SasPay).
// Actions (POST JSON) :
//   catalog → { items:[{id,name,price}], deliveryFee }
//   order   → { items:[{id,qty}], customer:{name,phone,address,mode} } → { url, ref, total }
//   status  → { ref } → { paid }
import { verifyCaptcha, CAPTCHA_ERROR } from "./_recaptcha.js";
import crypto from "node:crypto";
import { cfg, db, saspay, settle } from "./_saspay.js";
import { CATALOG, DELIVERY_FEE, SHOP_ID } from "./_mte-catalog.js";

const hits = new Map();
function tooMany(key, max) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
const clean = (s, n) => String(s || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);

function cors(req, res) {
  const allowed = (process.env.MTE_SITE_ORIGINS || "").split(",").map((x) => x.trim().replace(/\/$/, "")).filter(Boolean);
  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (!allowed.length) res.setHeader("Access-Control-Allow-Origin", "*");
  else if (allowed.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  cors(req, res);
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};

  if (body.action === "catalog") return res.status(200).json({ items: CATALOG, deliveryFee: DELIVERY_FEE });

  const c = cfg();
  if (!(c.sk && c.email && c.URL_ && c.KEY)) return res.status(503).json({ error: "Paiement en ligne indisponible pour le moment." });
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  if (tooMany(ip + ":" + (body.action === "status" ? "s" : "o"), body.action === "status" ? 400 : 15)) return res.status(429).json({ error: "Trop d'essais. Réessaie dans quelques minutes." });
  const { rest, must } = db(c);

  try {
    if (body.action === "order") {
      if (!(await verifyCaptcha(body.captcha, "order")).ok) return res.status(403).json({ error: CAPTCHA_ERROR });
      const lines = [];
      for (const it of Array.isArray(body.items) ? body.items.slice(0, 20) : []) {
        const p = CATALOG.find((x) => x.id === it.id);
        const qty = Math.floor(Number(it.qty));
        if (!p || !(qty >= 1 && qty <= 20)) return res.status(400).json({ error: "Article ou quantité invalide." });
        const ex = lines.find((l) => l.id === p.id);
        if (ex) ex.qty += qty; else lines.push({ id: p.id, name: p.name, price: p.price, qty });
      }
      if (!lines.length || lines.some((l) => l.qty > 20)) return res.status(400).json({ error: "Panier vide ou quantité trop grande." });
      const cu = body.customer || {};
      const name = clean(cu.name, 60);
      const phone = clean(cu.phone, 20).replace(/[^\d+]/g, "");
      const mode = cu.mode === "livraison" ? "livraison" : "retrait";
      const address = clean(cu.address, 160);
      if (name.length < 2) return res.status(400).json({ error: "Indique ton nom." });
      if (!/^\+?\d{8,15}$/.test(phone)) return res.status(400).json({ error: "Numéro de téléphone invalide." });
      if (mode === "livraison" && address.length < 5) return res.status(400).json({ error: "Indique l'adresse de livraison." });

      const fee = mode === "livraison" ? DELIVERY_FEE : 0;
      const total = lines.reduce((s, l) => s + l.price * l.qty, 0) + fee;
      if (!(total >= 100 && total <= 2000000)) return res.status(400).json({ error: "Montant invalide." });
      const summary = lines.map((l) => `${l.qty}x ${l.name}`).join(", ").slice(0, 70);
      const ref = crypto.randomBytes(16).toString("hex");
      const session = await saspay(c, "/checkout-sessions/", {
        method: "POST",
        body: JSON.stringify({
          amount: total.toFixed(2), currency: "XOF",
          description: `Commande MTE — ${summary}`,
          customer_email: c.email, customer_name: name, country: "TG",
          return_url: (process.env.MTE_SITE_URL || "https://essodinam.github.io/Moise-tech-Energie/"), // adresse fixe côté serveur : jamais celle envoyée par le navigateur
          metadata: { shopId: SHOP_ID, ref, purpose: "web_order" },
        }),
      });
      if (!session.ok || !session.data?.checkout_url || !session.data?.id) return res.status(502).json({ error: "Le paiement n'a pas pu être créé. Réessaie plus tard." });
      // Détail complet de la commande, consultable plus tard dans la base (clé mte_order_<ref>).
      await must(await rest("kv_store", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: `mte_order_${ref}`, value: { ref, lines, fee, total, customer: { name, phone, mode, address }, createdAt: new Date().toISOString() }, updated_at: new Date().toISOString() }) }));
      await must(await rest("saspay_pending", { method: "POST", body: JSON.stringify({ ref, session_id: String(session.data.id), shop_id: SHOP_ID, months: 0, amount: total, currency: "XOF", kind: "sale", label: `Commande web ${name} ${phone}`.slice(0, 120) }) }));
      return res.status(200).json({ url: session.data.checkout_url, ref, total });
    }

    if (body.action === "status") {
      const ref = String(body.ref || "");
      if (!/^[a-f0-9]{32}$/.test(ref)) return res.status(400).json({ error: "Référence invalide." });
      const r = await must(await rest(`saspay_pending?ref=eq.${ref}&shop_id=eq.${SHOP_ID}&select=*`));
      const rows = await r.json();
      if (!rows[0]) return res.status(404).json({ error: "Paiement introuvable." });
      const out = await settle(c, rows[0]);
      return res.status(200).json({ paid: !!out.paid });
    }
    return res.status(400).json({ error: "Action inconnue." });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur." });
  }
}
