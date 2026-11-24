// MTE Registre — réception des confirmations GeniusPay (webhook).
// Signature : HMAC-SHA256 de « timestamp.corps » avec le secret whsec_… ; tolérance 5 minutes.
// Le contenu du message n'est jamais cru : chaque paiement en attente est re-vérifié chez GeniusPay.
import crypto from "node:crypto";
import { cfg, db, settle } from "./_saspay.js";
import { gcfg, isGenius } from "./_geniuspay.js";

const readRaw = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on("data", (d) => chunks.push(d));
  req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  req.on("error", reject);
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const g = gcfg(), c = cfg();
  if (!g.whSecret || !g.sk || !c.URL_ || !c.KEY) return res.status(503).json({ error: "Non configuré" });
  let raw = "";
  try { raw = await readRaw(req); } catch (e) { return res.status(400).json({ error: "Corps illisible" }); }
  if (!raw && req.body) raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  const ts = String(req.headers["x-webhook-timestamp"] || "");
  const sig = String(req.headers["x-webhook-signature"] || "").replace(/^sha256=/, "");
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  const expected = crypto.createHmac("sha256", g.whSecret).update(`${ts}.${raw}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (!ts || !(age <= 300) || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(403).json({ error: "Signature invalide" });

  let event = String(req.headers["x-webhook-event"] || "");
  try { event = String(JSON.parse(raw).event || event); } catch (e) {}
  if (event !== "payment.success") return res.status(200).json({ ok: true, ignored: true });

  try {
    const { rest, must } = db(c);
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const r = await must(await rest(`saspay_pending?applied_at=is.null&created_at=gte.${encodeURIComponent(since)}&select=*&order=created_at.desc&limit=50`));
    for (const p of await r.json()) { if (isGenius(p)) { try { await settle(c, p); } catch (e) {} } }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
