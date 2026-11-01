// WURI CENTER — serveur d'administration (fonction Vercel protégée).
// Les opérations sensibles passent ici : la clé secrète Supabase reste sur le
// serveur (variable SUPABASE_SERVICE_KEY) et ne descend jamais dans l'application.
//
// Variables d'environnement (Vercel → Settings → Environment Variables) :
//   SUPABASE_SERVICE_KEY  (obligatoire)
// Empreinte / visage (WebAuthn) : les téléphones enregistrés sont stockés dans la
// table protégée admin_credentials (inaccessible depuis l'application).
//   VITE_SUPABASE_URL ou SUPABASE_URL (obligatoire)
//   DEV_ACCESS_HASH, OWNER_ACCESS_HASH (obligatoires : empreintes SHA-256 de
//   "wuri-access:" + code ; elles ne sont écrites nulle part dans le code)
import crypto from "node:crypto";

const REGISTRY_KEY = "shops_registry";
const TEST_SHOP_CODE = "TEST-MTE-DEV";
const DEMO_PREFIX = "DEMO-";
const BUCKET = "product-photos";
const EXPORT_KEYS = ["products", "sales", "businessType", "shopName", "sellers", "cashiers", "clients", "hours", "shifts", "expenses"];

const sha = (code) => crypto.createHash("sha256").update("wuri-access:" + code).digest("hex");
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Limite d'essais par adresse IP (en mémoire : suffisant contre les essais en rafale).
const fails = new Map();
const MAX_FAILS = 5, LOCK_MS = 15 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function locked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (f.until && f.until > Date.now()) return true;
  if (f.until && f.until <= Date.now()) fails.delete(ip);
  return false;
}
function recordFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) { f.until = Date.now() + LOCK_MS; f.n = 0; }
  fails.set(ip, f);
}

const validCode = (c) => /^[A-Za-z0-9-]{1,64}$/.test(c || "");

/* ---------- Empreinte (WebAuthn) : défis et sessions signés, sans stockage ---------- */
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(String(s || ""), "base64url");
const hmac = (secret, data) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
const CHALLENGE_TTL = 2 * 60 * 1000;
const SESSION_TTL = 30 * 60 * 1000;

function makePack(secret, purpose) {
  const challenge = b64u(crypto.randomBytes(32));
  const exp = Date.now() + CHALLENGE_TTL;
  return { challenge, exp, purpose, sig: hmac(secret, `${challenge}.${exp}.${purpose}`) };
}
function packValid(secret, pack, purpose) {
  if (!pack || pack.purpose !== purpose || !(pack.exp > Date.now())) return false;
  return same(hmac(secret, `${pack.challenge}.${pack.exp}.${purpose}`), pack.sig || "");
}
function makeToken(secret, role) {
  const payload = b64u(JSON.stringify({ role, exp: Date.now() + SESSION_TTL }));
  return `${payload}.${hmac(secret, "session." + payload)}`;
}
function readToken(secret, token) {
  try {
    const [payload, sig] = String(token || "").split(".");
    if (!payload || !same(hmac(secret, "session." + payload), sig || "")) return null;
    const p = JSON.parse(fromB64u(payload).toString());
    return p.exp > Date.now() && (p.role === "dev" || p.role === "owner") ? p.role : null;
  } catch (e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const URL_ = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL_ || !KEY) return res.status(500).json({ error: "Serveur non configuré (SUPABASE_SERVICE_KEY manquante)." });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body || {};
  const { action, code, target } = body;
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();

  if (locked(ip)) return res.status(429).json({ error: "Trop d'essais. Réessaie dans 15 minutes." });

  const devHash = process.env.DEV_ACCESS_HASH;
  const ownerHash = process.env.OWNER_ACCESS_HASH;
  if (!devHash || !ownerHash) return res.status(500).json({ error: "Serveur non configuré (DEV_ACCESS_HASH / OWNER_ACCESS_HASH manquantes)." });

  const secret = crypto.createHash("sha256").update("wuri-bio:" + KEY).digest();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const rpId = host.split(":")[0];
  const origin = `https://${host}`;

  const PUBLIC_ACTIONS = ["bioOptions", "bioLogin"];
  let isDev = false, isOwner = false;
  if (!PUBLIC_ACTIONS.includes(action)) {
    if (body.token) {
      const r = readToken(secret, body.token);
      isDev = r === "dev";
      isOwner = r === "dev" || r === "owner";
    } else {
      const h = sha(String(code ?? ""));
      isDev = same(h, devHash);
      isOwner = isDev || same(h, ownerHash);
    }
    const allowed = action === "verifyOwner" || action === "bioRegisterOptions" || action === "bioRegister" ? isOwner : isDev;
    if (!allowed) {
      recordFail(ip);
      await sleep(500);
      return res.status(401).json({ error: body.token ? "Session expirée, reconnecte-toi." : "Code incorrect." });
    }
    fails.delete(ip);
  }

  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const rest = (path, opts = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, "Content-Type": "application/json", ...(opts.headers || {}) } });
  const must = async (r) => { if (!r.ok) throw new Error(`Base de données : ${r.status}`); return r; };

  const readKey = async (key) => {
    const r = await must(await rest(`kv_store?key=eq.${encodeURIComponent(key)}&select=value`));
    const rows = await r.json();
    return rows[0] ? rows[0].value : null;
  };
  const writeKey = async (key, value) =>
    must(await rest("kv_store", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) }));

  const deleteShop = async (c) => {
    if (!validCode(c)) throw new Error("Code de commerce invalide.");
    await must(await rest(`kv_store?key=like.${encodeURIComponent("*:" + c)}`, { method: "DELETE" }));
    try {
      const l = await fetch(`${URL_}/storage/v1/object/list/${BUCKET}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: c, limit: 1000 }) });
      const files = l.ok ? await l.json() : [];
      if (files.length) await fetch(`${URL_}/storage/v1/object/${BUCKET}`, { method: "DELETE", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: files.map((f) => `${c}/${f.name}`) }) });
    } catch (e) { /* le nettoyage des photos n'est pas bloquant */ }
  };

  const listDemos = async () => {
    const r = await must(await rest(`kv_store?select=key&key=like.${encodeURIComponent("*:" + DEMO_PREFIX + "*")}&limit=5000`));
    const out = new Set();
    for (const row of await r.json()) {
      const c = row.key.slice(row.key.lastIndexOf(":") + 1);
      if (c.startsWith(DEMO_PREFIX)) out.add(c);
    }
    return [...out];
  };

  try {
    switch (action) {
      case "verifyOwner":
        return res.status(200).json({ ok: true });

      case "list": {
        const reg = await readKey(REGISTRY_KEY);
        const shops = Array.isArray(reg) ? reg : [];
        const stats = {};
        await Promise.all(shops.map(async (s) => {
          try {
            const sales = await readKey(`sales:${s.code}`);
            const arr = Array.isArray(sales) ? sales : [];
            stats[s.code] = { total: arr.reduce((t, v) => t + (Number(v.total) || 0), 0), count: arr.length, lastActivity: arr.length ? Math.max(...arr.map((v) => Number(v.date) || 0)) : null };
          } catch (e) { stats[s.code] = { total: 0, count: 0, lastActivity: null }; }
        }));
        return res.status(200).json({ shops, stats });
      }

      case "setSubscription": {
        if (!validCode(target)) return res.status(400).json({ error: "Code de commerce invalide." });
        const until = body.until ? new Date(body.until).toISOString() : null;
        const reg = await readKey(REGISTRY_KEY);
        const next = (Array.isArray(reg) ? reg : []).map((s) => (s.code === target ? { ...s, subscriptionUntil: until } : s));
        await writeKey(REGISTRY_KEY, next);
        return res.status(200).json({ ok: true });
      }

      case "deleteShop": {
        if (!validCode(target)) return res.status(400).json({ error: "Code de commerce invalide." });
        await deleteShop(target);
        const reg = await readKey(REGISTRY_KEY);
        await writeKey(REGISTRY_KEY, (Array.isArray(reg) ? reg : []).filter((s) => s.code !== target));
        return res.status(200).json({ ok: true });
      }

      case "listDemos":
        return res.status(200).json({ codes: await listDemos() });

      case "cleanDemos": {
        const codes = await listDemos();
        for (const c of [...codes, TEST_SHOP_CODE]) await deleteShop(c);
        const reg = await readKey(REGISTRY_KEY);
        if (Array.isArray(reg)) await writeKey(REGISTRY_KEY, reg.filter((s) => !String(s.code).startsWith(DEMO_PREFIX) && s.code !== TEST_SHOP_CODE));
        return res.status(200).json({ ok: true, count: codes.length });
      }

      case "export": {
        if (!validCode(target)) return res.status(400).json({ error: "Code de commerce invalide." });
        const data = { code: target, exportedAt: new Date().toISOString() };
        for (const k of EXPORT_KEYS) data[k] = await readKey(`${k}:${target}`).catch(() => null);
        return res.status(200).json({ data });
      }

      case "bioRegisterOptions": {
        const role = body.role === "owner" ? "owner" : "dev";
        if (role === "dev" && !isDev) return res.status(401).json({ error: "Code développeur requis." });
        return res.status(200).json({ pack: makePack(secret, "reg:" + role) });
      }

      case "bioRegister": {
        const role = body.role === "owner" ? "owner" : "dev";
        if (role === "dev" && !isDev) return res.status(401).json({ error: "Code développeur requis." });
        if (!packValid(secret, body.pack, "reg:" + role)) return res.status(400).json({ error: "Défi expiré, réessaie." });
        const cd = safeJson(fromB64u(body.clientDataJSON).toString());
        if (cd.type !== "webauthn.create" || cd.challenge !== body.pack.challenge || cd.origin !== origin) return res.status(400).json({ error: "Enregistrement refusé (origine ou défi invalide)." });
        const id = String(body.credentialId || "");
        if (!/^[A-Za-z0-9_-]{16,512}$/.test(id)) return res.status(400).json({ error: "Identifiant invalide." });
        try { crypto.createPublicKey({ key: fromB64u(body.publicKey), format: "der", type: "spki" }); } catch (e) { return res.status(400).json({ error: "Clé invalide." }); }
        await must(await rest("admin_credentials", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id, role, public_key: String(body.publicKey), sign_count: 0 }) }));
        return res.status(200).json({ ok: true });
      }

      case "bioOptions": {
        const role = body.role === "owner" ? "owner" : "dev";
        return res.status(200).json({ pack: makePack(secret, "auth:" + role) });
      }

      case "bioLogin": {
        const role = body.role === "owner" ? "owner" : "dev";
        const bad = async () => { recordFail(ip); await sleep(500); return res.status(401).json({ error: "Empreinte refusée." }); };
        if (!packValid(secret, body.pack, "auth:" + role)) return res.status(400).json({ error: "Défi expiré, réessaie." });
        const id = String(body.credentialId || "");
        if (!/^[A-Za-z0-9_-]{16,512}$/.test(id)) return bad();
        const rows = await (await must(await rest(`admin_credentials?id=eq.${encodeURIComponent(id)}&role=eq.${role}&select=public_key,sign_count`))).json();
        if (!rows[0]) return bad();
        const cdRaw = fromB64u(body.clientDataJSON);
        const cd = safeJson(cdRaw.toString());
        if (cd.type !== "webauthn.get" || cd.challenge !== body.pack.challenge || cd.origin !== origin) return bad();
        const ad = fromB64u(body.authenticatorData);
        if (ad.length < 37) return bad();
        if (!ad.subarray(0, 32).equals(crypto.createHash("sha256").update(rpId).digest())) return bad();
        const flags = ad[32];
        if (!(flags & 0x01) || !(flags & 0x04)) return bad(); // présence + vérification (empreinte/visage) obligatoires
        const counter = ad.readUInt32BE(33);
        const prev = Number(rows[0].sign_count) || 0;
        if (counter !== 0 && prev !== 0 && counter <= prev) return bad();
        let okSig = false;
        try {
          const key = crypto.createPublicKey({ key: fromB64u(rows[0].public_key), format: "der", type: "spki" });
          okSig = crypto.verify("sha256", Buffer.concat([ad, crypto.createHash("sha256").update(cdRaw).digest()]), key, fromB64u(body.signature));
        } catch (e) {}
        if (!okSig) return bad();
        fails.delete(ip);
        if (counter > prev) await rest(`admin_credentials?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ sign_count: counter }) });
        return res.status(200).json({ token: makeToken(secret, role) });
      }

      case "bioRevoke": {
        const role = body.role === "owner" ? "owner" : "dev";
        await must(await rest(`admin_credentials?role=eq.${role}`, { method: "DELETE" }));
        return res.status(200).json({ ok: true });
      }

      default:
        return res.status(400).json({ error: "Action inconnue." });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erreur serveur" });
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
