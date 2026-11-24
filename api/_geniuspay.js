// MTE Registre — paiement GeniusPay (Côte d'Ivoire, Sénégal, Bénin…). Complète SasPay (Togo).
// Variables d'environnement (Vercel) :
//   GENIUSPAY_PUBLIC_KEY      clé publique  (pk_sandbox_… pour tester, pk_live_… en vrai)
//   GENIUSPAY_SECRET_KEY      clé secrète   (sk_sandbox_… / sk_live_…)
//   GENIUSPAY_WEBHOOK_SECRET  secret du webhook (whsec_…), affiché une seule fois à la création du webhook
// Dans la table saspay_pending, un paiement GeniusPay se reconnaît à son identifiant qui commence par « gp: ».
const BASE = "https://geniuspay.ci/api/v1/merchant";
export const GP_PREFIX = "gp:";
export const isGenius = (pending) => String(pending.session_id || "").startsWith(GP_PREFIX);

export const gcfg = () => ({
  pk: process.env.GENIUSPAY_PUBLIC_KEY || "",
  sk: process.env.GENIUSPAY_SECRET_KEY || "",
  whSecret: process.env.GENIUSPAY_WEBHOOK_SECRET || "",
});
export const geniusEnabled = () => { const g = gcfg(); return !!(g.pk && g.sk); };

async function gcall(path, opts = {}) {
  const g = gcfg();
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { "X-API-Key": g.pk, "X-API-Secret": g.sk, "Content-Type": "application/json", ...(opts.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, data: j && j.data !== undefined ? j.data : j };
}

// Crée un paiement ; retourne { ok, url, sessionId }
export async function geniusCreate({ amount, description, customer, successUrl, errorUrl, metadata }) {
  const r = await gcall("/payments", {
    method: "POST",
    body: JSON.stringify({ amount, currency: "XOF", description, customer, success_url: successUrl, error_url: errorUrl, metadata }),
  });
  const d = r.data || {};
  const url = d.checkout_url || d.payment_url;
  if (!r.ok || !url || !d.reference) return { ok: false };
  return { ok: true, url, sessionId: GP_PREFIX + String(d.reference) };
}

// Vérifie chez GeniusPay qu'un paiement est réellement terminé, avec le bon montant.
export async function geniusCheck(pending) {
  const ref = String(pending.session_id).slice(GP_PREFIX.length);
  const r = await gcall(`/payments/${encodeURIComponent(ref)}`);
  if (!r.ok || !r.data) return { paid: false };
  const st = String(r.data.status || "").toLowerCase();
  if (st !== "completed") return { paid: false, status: st || null };
  if (Number(r.data.amount) !== Number(pending.amount)) return { paid: false, status: "montant_different" };
  if (r.data.currency && String(r.data.currency).toUpperCase() !== String(pending.currency).toUpperCase()) return { paid: false, status: "montant_different" };
  return { paid: true };
}
