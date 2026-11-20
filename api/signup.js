// KABATEC Consulting — inscription en ligne d'un nouveau commerçant (profil + abonnement payé par SasPay).
// Actions (POST JSON) :
//   plans  → { enabled, price, options:[mois…] }
//   start  → { profile, months } → { url, ref }   (enregistre le profil « en attente » et crée le paiement)
//   status → { ref } → { paid, shopCode? }        (le code du commerce n'est donné qu'une fois le paiement confirmé)
// Le commerce n'est créé qu'APRÈS un paiement réellement confirmé par SasPay (voir _saspay.js : activateSignup).
import crypto from "node:crypto";
import { cfg, db, saspay, settle, REGISTRY_KEY, telegram } from "./_saspay.js";

const OPTIONS = [1, 3, 6, 12];
const TYPES = ["quincaillerie", "bar", "boutique", "menuiserie"];
const hits = new Map();
function tooMany(key, max) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
const clean = (s, n) => String(s || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const genCode = () => {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I : plus facile à recopier
  const part = () => Array.from(crypto.randomBytes(4), (b) => A[b % A.length]).join("");
  return `${part()}-${part()}`;
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const c = cfg();
  const enabled = !!(c.sk && c.whSecret && c.email && c.price && c.URL_ && c.KEY);
  if (body.action === "plans") return res.status(200).json({ enabled, price: enabled ? c.price : 0, options: OPTIONS });
  if (!enabled) return res.status(503).json({ error: "L'inscription en ligne n'est pas disponible pour le moment." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  if (tooMany(ip + ":" + (body.action === "status" ? "s" : "c"), body.action === "status" ? 400 : 8)) return res.status(429).json({ error: "Trop d'essais. Réessaie dans quelques minutes." });
  const { rest, must } = db(c);

  try {
    if (body.action === "start") {
      if (body.website) return res.status(400).json({ error: "Demande invalide." }); // champ piège pour les robots
      const p = body.profile || {};
      const months = Math.floor(Number(body.months));
      if (!OPTIONS.includes(months)) return res.status(400).json({ error: "Durée d'abonnement invalide." });
      const first = clean(p.firstName, 40), last = clean(p.lastName, 40);
      const age = Math.floor(Number(p.age));
      const phone = clean(p.phone, 20).replace(/[^\d+]/g, "");
      const email = clean(p.email, 80).toLowerCase();
      const city = clean(p.city, 60);
      const business = clean(p.businessName, 60);
      const btype = TYPES.includes(p.businessType) ? p.businessType : null;
      if (first.length < 2 || last.length < 2) return res.status(400).json({ error: "Indique ton prénom et ton nom." });
      if (!(age >= 18 && age <= 120)) return res.status(400).json({ error: "L'inscription est réservée aux personnes de 18 ans et plus." });
      if (!/^\+?\d{8,15}$/.test(phone)) return res.status(400).json({ error: "Numéro de téléphone invalide." });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: "Adresse e-mail invalide." });
      if (business.length < 2) return res.status(400).json({ error: "Indique le nom de ton commerce." });
      if (body.consent !== true) return res.status(400).json({ error: "Tu dois accepter l'enregistrement de tes informations pour continuer." });

      // Code unique, choisi par le serveur (jamais par le navigateur).
      let code = "";
      for (let i = 0; i < 5 && !code; i++) {
        const cand = genCode();
        const ex = await (await must(await rest(`user_profiles?shop_id=eq.${cand}&select=shop_id`))).json();
        const reg = await (await must(await rest(`kv_store?key=eq.${encodeURIComponent(REGISTRY_KEY)}&select=value`))).json();
        const taken = ex.length > 0 || (Array.isArray(reg[0]?.value) && reg[0].value.some((s) => s.code === cand));
        if (!taken) code = cand;
      }
      if (!code) return res.status(500).json({ error: "Réessaie dans un instant." });

      const amount = c.price * months;
      const ref = crypto.randomBytes(16).toString("hex");
      const session = await saspay(c, "/checkout-sessions/", {
        method: "POST",
        body: JSON.stringify({
          amount: amount.toFixed(2), currency: "XOF",
          description: `Inscription KABATEC — ${months} mois — ${business}`,
          customer_email: email || c.email, customer_name: `${first} ${last}`, country: "TG",
          return_url: `${c.appUrl}/?signup=${ref}`,
          metadata: { shopId: code, ref, purpose: "signup" },
        }),
      });
      if (!session.ok || !session.data?.checkout_url || !session.data?.id) return res.status(502).json({ error: "Le paiement n'a pas pu être créé. Réessaie plus tard." });
      await must(await rest("user_profiles", { method: "POST", body: JSON.stringify({ shop_id: code, ref, first_name: first, last_name: last, age, phone, email: email || null, city: city || null, business_name: business, months }) }));
      await must(await rest("saspay_pending", { method: "POST", body: JSON.stringify({ ref, session_id: String(session.data.id), shop_id: code, months, amount, currency: "XOF", kind: "signup", label: (btype ? `bt:${btype}|` : "") + `Inscription ${business}`.slice(0, 100) }) }));
      return res.status(200).json({ url: session.data.checkout_url, ref });
    }

    if (body.action === "status") {
      const ref = String(body.ref || "");
      if (!/^[a-f0-9]{32}$/.test(ref)) return res.status(400).json({ error: "Référence invalide." });
      const rows = await (await must(await rest(`saspay_pending?ref=eq.${ref}&kind=eq.signup&select=*`))).json();
      if (!rows[0]) return res.status(404).json({ error: "Inscription introuvable." });
      const out = await settle(c, rows[0]);
      return res.status(200).json(out.paid ? { paid: true, shopCode: rows[0].shop_id } : { paid: false });
    }
    return res.status(400).json({ error: "Action inconnue." });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur." });
  }
}
