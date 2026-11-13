// KABATEC Consulting — outils communs pour les paiements SasPay (abonnement).
// Ce fichier (préfixe « _ ») n'est PAS une adresse publique : il est seulement importé.
//
// Variables d'environnement (Vercel → Settings → Environment Variables) :
//   SASPAY_SECRET_KEY        clé secrète SasPay (sk_test_… pour les essais, sk_live_… en vrai)
//   SASPAY_WEBHOOK_SECRET    secret de signature du webhook (celui saisi dans SasPay)
//   SASPAY_CONTACT_EMAIL     e-mail exigé par SasPay pour chaque paiement (le tien)
//   SUBSCRIPTION_PRICE_XOF   prix d'un mois d'abonnement, ex. 5000
//   APP_URL                  (facultatif) https://mte-registre.vercel.app
//   SUPABASE_SERVICE_KEY, VITE_SUPABASE_URL ou SUPABASE_URL (déjà en place)

export const REGISTRY_KEY = "shops_registry";
export const validCode = (c) => /^[A-Za-z0-9-]{1,64}$/.test(c || "");
const SASPAY_BASE = "https://api.saspay.me/api/v1";

export function cfg() {
  const URL_ = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const price = Number(process.env.SUBSCRIPTION_PRICE_XOF);
  return {
    URL_, KEY,
    sk: process.env.SASPAY_SECRET_KEY || "",
    whSecret: process.env.SASPAY_WEBHOOK_SECRET || "",
    email: process.env.SASPAY_CONTACT_EMAIL || "",
    price: Number.isFinite(price) && price > 0 ? Math.round(price) : 0,
    appUrl: (process.env.APP_URL || "https://mte-registre.vercel.app").replace(/\/$/, ""),
    months: 1,
  };
}

export function db(c) {
  const H = { apikey: c.KEY, Authorization: `Bearer ${c.KEY}` };
  const rest = (path, opts = {}) => fetch(`${c.URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, "Content-Type": "application/json", ...(opts.headers || {}) } });
  const must = async (r) => { if (!r.ok) throw new Error(`Base de données : ${r.status}`); return r; };
  return { rest, must };
}

export async function saspay(c, path, opts = {}) {
  const r = await fetch(`${SASPAY_BASE}${path}`, { ...opts, headers: { Authorization: `Bearer ${c.sk}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
  let j = null;
  try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, body: j, data: j && j.data !== undefined ? j.data : j };
}

// Prolonge l'abonnement du commerce de `months` mois (à partir d'aujourd'hui, ou de la fin actuelle si elle est future).
export async function extendSubscription(c, shopId, months) {
  const { rest, must } = db(c);
  const r = await must(await rest(`kv_store?key=eq.${encodeURIComponent(REGISTRY_KEY)}&select=value`));
  const rows = await r.json();
  const reg = rows[0] ? rows[0].value : null;
  const list = Array.isArray(reg) ? reg : [];
  let until = null;
  const next = list.map((s) => {
    if (s.code !== shopId) return s;
    const base = s.subscriptionUntil && new Date(s.subscriptionUntil) > new Date() ? new Date(s.subscriptionUntil) : new Date();
    base.setMonth(base.getMonth() + months);
    until = base.toISOString();
    return { ...s, subscriptionUntil: until };
  });
  if (!until) throw new Error("Commerce introuvable dans le registre.");
  await must(await rest("kv_store", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: REGISTRY_KEY, value: next, updated_at: new Date().toISOString() }) }));
  return until;
}

// Vérifie auprès de SasPay qu'une session est vraiment payée, puis prolonge l'abonnement UNE seule fois.
// Retourne { paid, until? }.
export async function settle(c, pending) {
  if (pending.applied_at) return { paid: true };
  const st = await saspay(c, `/checkout-sessions/${encodeURIComponent(pending.session_id)}/status/`);
  if (!st.ok || !st.data) return { paid: false };
  const ok = String(st.data.transaction_status || "").toUpperCase() === "SUCCESS" && String(st.data.status || "").toUpperCase() === "PAID";
  if (!ok) return { paid: false, status: st.data.status || null };
  // Contrôle du montant et de la devise réellement payés.
  const det = await saspay(c, `/checkout-sessions/${encodeURIComponent(pending.session_id)}/`);
  if (!det.ok || !det.data) return { paid: false };
  if (Number(det.data.amount) !== Number(pending.amount) || String(det.data.currency || "").toUpperCase() !== String(pending.currency).toUpperCase()) {
    return { paid: false, status: "montant_different" };
  }
  // « Réservation » atomique : un seul appel peut marquer la ligne, donc un seul peut prolonger.
  const { rest, must } = db(c);
  const claim = await must(await rest(`saspay_pending?ref=eq.${encodeURIComponent(pending.ref)}&applied_at=is.null`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ applied_at: new Date().toISOString() }) }));
  const claimed = await claim.json();
  if (!claimed.length) return { paid: true };
  try {
    const until = await extendSubscription(c, pending.shop_id, pending.months);
    return { paid: true, until };
  } catch (e) {
    // Échec : on libère la ligne pour pouvoir réessayer.
    await rest(`saspay_pending?ref=eq.${encodeURIComponent(pending.ref)}`, { method: "PATCH", body: JSON.stringify({ applied_at: null }) });
    throw e;
  }
}
