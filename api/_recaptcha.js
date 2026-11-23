// Vérification Google reCAPTCHA v3 côté serveur.
// Active seulement si la variable RECAPTCHA_SECRET est définie dans Vercel (sinon : on laisse passer).
// Si Google est injoignable alors que la protection est active, on refuse par prudence.
export async function verifyCaptcha(token, action, minScore = 0.5) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== "string" || token.length > 4096) return { ok: false };
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const j = await r.json();
    const ok = j.success === true && (!j.action || j.action === action) && Number(j.score) >= minScore;
    return { ok, score: j.score };
  } catch (e) {
    return { ok: false };
  }
}
export const CAPTCHA_ERROR = "Vérification anti-robot échouée. Recharge la page et réessaie.";
