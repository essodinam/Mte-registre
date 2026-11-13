// KABATEC Consulting — rapport quotidien envoyé sur Telegram (tâche planifiée Vercel).
// Aucun secret dans ce fichier : tout vient des variables d'environnement Vercel
// (SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, VITE_SUPABASE_URL).
export default async function handler(req, res) {
  try {
    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
    const KEY = process.env.SUPABASE_SERVICE_KEY;
    const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT = process.env.TELEGRAM_CHAT_ID;
    const INACTIVITY_DAYS = parseInt(process.env.INACTIVITY_DAYS || "3", 10);
    if (!SUPABASE_URL || !KEY || !TOKEN || !CHAT) return res.status(500).json({ error: "Variables d'environnement manquantes" });

    const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
    const last = await (await fetch(`${SUPABASE_URL}/rest/v1/kv_store?select=updated_at&order=updated_at.desc&limit=1`, { headers })).json();
    const lastActivity = last?.[0]?.updated_at ? new Date(last[0].updated_at) : null;
    const now = new Date();
    const daysSince = lastActivity ? (now - lastActivity) / 86400000 : null;

    const rows = await (await fetch(`${SUPABASE_URL}/rest/v1/kv_store?key=like.sales:*&select=key,value`, { headers })).json();
    const today = now.toISOString().slice(0, 10);
    const lines = [];
    let grand = 0;
    for (const row of rows || []) {
      const shop = row.key.replace("sales:", "");
      const sales = Array.isArray(row.value) ? row.value : [];
      let n = 0, sum = 0;
      for (const s of sales) {
        const d = s?.date;
        const day = typeof d === "number" ? new Date(d).toISOString().slice(0, 10) : String(d || s?.createdAt || "").slice(0, 10);
        if (day === today) { n += 1; sum += Number(s?.total ?? 0); }
      }
      if (sales.length) { grand += sum; lines.push(`• Commerce ${shop} : ${n} vente(s), ${sum.toLocaleString("fr-FR")} FCFA`); }
    }

    let msg = `📒 *KABATEC Consulting — Rapport du ${now.toLocaleDateString("fr-FR")}*\n\n`;
    msg += lines.length ? `${lines.join("\n")}\n\n💰 Total général du jour : *${grand.toLocaleString("fr-FR")} FCFA*` : "Aucune vente enregistrée aujourd'hui.";
    if (daysSince !== null && daysSince >= INACTIVITY_DAYS) msg += `\n\n⚠️ *Alerte inactivité* : aucune activité depuis ${Math.floor(daysSince)} jour(s). Le projet risque de se mettre en pause.`;
    else if (lastActivity === null) msg += `\n\n⚠️ Aucune activité n'a encore été enregistrée sur la base.`;

    const tg = await (await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text: msg, parse_mode: "Markdown" }),
    })).json();
    return res.status(200).json({ ok: true, telegram: tg.ok === true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
