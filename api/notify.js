// KABATEC Consulting — alertes de service envoyées sur Telegram au gérant.
// Variables Vercel : TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (déjà utilisées par le rapport quotidien)
// et ALERT_SHOPS = codes des commerces autorisés à envoyer des alertes, séparés par des virgules.
// Sans ALERT_SHOPS, aucune alerte n'est envoyée (les alertes arrivent sur TON Telegram :
// on ne les active donc que pour tes propres commerces).
const hits = new Map();
function tooMany(key, max) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
const txt = (s, n) => String(s || "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const fcfa = (n) => Number(n).toLocaleString("fr-FR") + " FCFA";
const roleLabel = (r) => (r === "gerant" ? "Gérant" : r === "caissier" ? "Caissier" : "Vendeur");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT = process.env.TELEGRAM_CHAT_ID;
  const allowed = (process.env.ALERT_SHOPS || "").split(",").map((x) => x.trim()).filter(Boolean);
  const shop = txt(body.shopId, 40);
  if (!TOKEN || !CHAT || !shop || !allowed.includes(shop)) return res.status(204).end();
  if (tooMany(shop, 80)) return res.status(429).json({ error: "Trop d'alertes" });

  const name = txt(body.name, 40) || "?";
  const who = `${name} (${roleLabel(body.role)})`;
  const where = txt(body.shopName, 40) || shop;
  const time = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lome" });
  const dist = num(body.distance);
  const d = dist == null ? "" : dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
  let text = "";
  switch (body.type) {
    case "start":
      text = `✅ ${where} — ${who} a pris son service à ${time}.${body.flag === "hors_zone" ? ` ⚠️ Hors zone (${d}).` : body.flag === "non_verifiee" ? " Position non vérifiée." : ""}${num(body.openingCash) != null ? `\nFond de caisse : ${fcfa(num(body.openingCash))}` : ""}`;
      break;
    case "end": {
      const diff = num(body.cashDiff);
      text = `🏁 ${where} — ${who} a terminé son service à ${time}.`;
      if (diff != null) text += diff === 0 ? "\n💵 Caisse juste." : `\n${diff < 0 ? "🔴 MANQUANT" : "🟠 EXCÉDENT"} en caisse : ${fcfa(Math.abs(diff))} (attendu ${fcfa(num(body.expectedCash) ?? 0)}, compté ${fcfa(num(body.countedCash) ?? 0)}).`;
      break;
    }
    case "refused":
      text = `🚫 ${where} — ${who} a essayé de prendre son service à ${time} mais a été REFUSÉ : ${body.reason === "gps" ? "position introuvable" : `hors zone${d ? ` (${d} du commerce)` : ""}`}.`;
      break;
    case "auto_close":
      text = `⏰ ${where} — le service de ${who} n'a pas été terminé. Clôturé automatiquement à ${txt(body.closeTime, 5) || "l'heure de fermeture"}. La caisse n'a pas été comptée.`;
      break;
    default:
      return res.status(400).json({ error: "Type inconnu" });
  }

  try {
    const photo = typeof body.photo === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.photo) && body.photo.length < 90000 ? body.photo : null;
    let r;
    if (photo && (body.type === "start" || body.type === "refused")) {
      const form = new FormData();
      form.append("chat_id", CHAT);
      form.append("caption", text.slice(0, 1000));
      form.append("photo", new Blob([Buffer.from(photo.split(",")[1], "base64")], { type: "image/jpeg" }), "selfie.jpg");
      r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendPhoto`, { method: "POST", body: form });
    } else {
      r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: CHAT, text }) });
    }
    return res.status(200).json({ ok: r.ok });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
