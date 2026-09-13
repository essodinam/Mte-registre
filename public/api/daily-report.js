// /api/daily-report.js
// Fonction Vercel Serverless — envoie un rapport quotidien sur Telegram
// et alerte si aucune activité n'a été détectée depuis plusieurs jours.
//
// Variables d'environnement à configurer sur Vercel (Project Settings > Environment Variables) :
//   SUPABASE_URL             -> https://gullqhuzirhcreqdhujm.supabase.co
//   SUPABASE_SERVICE_KEY     -> la clé "service_role" (Supabase > Project Settings > API)
//   TELEGRAM_BOT_TOKEN       -> 8989852975:AAGU271Ate77KeK41-DRApiqtN2WYaKRPbg
//   TELEGRAM_CHAT_ID         -> 8886851296
//   INACTIVITY_DAYS          -> (optionnel) nombre de jours avant alerte, défaut 3

export default async function handler(req, res) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    const INACTIVITY_DAYS = parseInt(process.env.INACTIVITY_DAYS || "3", 10);

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({ error: "Variables d'environnement manquantes" });
    }

    const headers = {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    };

    // 1) Dernière activité toutes clés confondues
    const lastActivityRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kv_store?select=updated_at&order=updated_at.desc&limit=1`,
      { headers }
    );
    const lastActivityRows = await lastActivityRes.json();
    const lastActivity = lastActivityRows?.[0]?.updated_at
      ? new Date(lastActivityRows[0].updated_at)
      : null;

    const now = new Date();
    const daysSinceActivity = lastActivity
      ? (now - lastActivity) / (1000 * 60 * 60 * 24)
      : null;

    // 2) Toutes les clés "sales:xxx" (une par commerce)
    const salesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/kv_store?key=like.sales:*&select=key,value`,
      { headers }
    );
    const salesRows = await salesRes.json();

    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    let lines = [];
    let totalGeneral = 0;
    let anyShop = false;

    for (const row of salesRows || []) {
      const shopId = row.key.replace("sales:", "");
      const sales = Array.isArray(row.value) ? row.value : [];

      let totalDuJour = 0;
      let nbVentes = 0;

      for (const sale of sales) {
        const dateStr =
          sale?.date || sale?.timestamp || sale?.createdAt || sale?.created_at || null;
        if (dateStr && String(dateStr).slice(0, 10) === todayStr) {
          nbVentes += 1;
          totalDuJour += Number(sale?.total ?? sale?.montant ?? sale?.amount ?? 0);
        }
      }

      if (sales.length > 0) {
        anyShop = true;
        totalGeneral += totalDuJour;
        lines.push(`• Commerce ${shopId} : ${nbVentes} vente(s), ${totalDuJour.toLocaleString("fr-FR")} FCFA`);
      }
    }

    // 3) Construction du message
    let message = `📒 *MTE Registre — Rapport du ${now.toLocaleDateString("fr-FR")}*\n\n`;

    if (anyShop) {
      message += lines.join("\n");
      message += `\n\n💰 Total général du jour : *${totalGeneral.toLocaleString("fr-FR")} FCFA*`;
    } else {
      message += "Aucune vente enregistrée aujourd'hui.";
    }

    if (daysSinceActivity !== null && daysSinceActivity >= INACTIVITY_DAYS) {
      message += `\n\n⚠️ *Alerte inactivité* : aucune activité détectée sur Supabase depuis ${Math.floor(
        daysSinceActivity
      )} jour(s). Le projet risque de se mettre en pause automatiquement.`;
    } else if (lastActivity === null) {
      message += `\n\n⚠️ Aucune activité n'a encore été enregistrée sur la base.`;
    }

    // 4) Envoi Telegram
    const tgRes = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      }
    );
    const tgData = await tgRes.json();

    return res.status(200).json({ ok: true, telegram: tgData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
