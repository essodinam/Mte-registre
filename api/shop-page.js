// MTE Registre — page publique d'un commerce (vitrine : produits, prix, chaîne WhatsApp, commande WhatsApp).
//   GET  /s/<slug>            → page HTML (réécrite par vercel.json vers /api/shop-page?slug=<slug>)
//   POST {action:"status",    shopId}                       → { published, slug }
//   POST {action:"publish",   shopId, slug?, snapshot}      → { slug, url }
//   POST {action:"unpublish", shopId}                       → { published:false }
// Sécurité : seul un instantané nettoyé (sans stock exact, sans coûts, sans code du commerce) est stocké
// sous la clé `pub:<slug>`. Le code du commerce n'apparaît JAMAIS dans l'adresse ni dans la page.
import { cfg, db, validCode, REGISTRY_KEY } from "./_saspay.js";

const hits = new Map();
function tooMany(key, max) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
const txt = (s, n) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, n);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;
const CHANNEL_RE = /^https:\/\/(www\.)?whatsapp\.com\/channel\/[\w-]{10,}\/?$/;
const httpsUrl = (u) => { const v = String(u || "").trim().slice(0, 400); return /^https:\/\/[^\s"'<>]+$/.test(v) ? v : ""; };
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

export const slugify = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function cleanSnapshot(s) {
  s = s && typeof s === "object" ? s : {};
  const loc = s.location && num(s.location.lat) != null && num(s.location.lng) != null ? { lat: num(s.location.lat), lng: num(s.location.lng) } : null;
  const products = (Array.isArray(s.products) ? s.products : []).slice(0, 300).map((p) => ({
    name: txt(p?.name, 80),
    category: txt(p?.category, 30),
    price: Math.max(0, Math.round(num(p?.price) || 0)),
    photo: httpsUrl(p?.photo),
    available: !!p?.available,
    unit: txt(p?.unit, 10),
  })).filter((p) => p.name && p.price > 0);
  const phone = txt(s.phone, 20).replace(/[^\d]/g, "");
  return {
    name: txt(s.name, 60) || "Mon commerce",
    logo: httpsUrl(s.logo),
    channel: CHANNEL_RE.test(String(s.channel || "").trim()) ? String(s.channel).trim() : "",
    phone: /^\d{8,15}$/.test(phone) ? phone : "",
    hours: s.hours && /^\d{2}:\d{2}$/.test(s.hours.open || "") && /^\d{2}:\d{2}$/.test(s.hours.close || "") ? { open: s.hours.open, close: s.hours.close } : null,
    location: loc,
    products,
  };
}

async function readKeys(rest, must, keys) {
  const r = await must(await rest(`kv_store?key=in.(${keys.map((k) => `"${k.replace(/"/g, "")}"`).map(encodeURIComponent).join(",")})&select=key,value`));
  const rows = await r.json();
  return Object.fromEntries(rows.map((x) => [x.key, x.value]));
}
const put = (rest, key, value) => rest("kv_store", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }) });

function page(slug, d) {
  const title = `${d.name} — produits et prix`;
  const url = `https://mte-registre.vercel.app/s/${slug}`;
  const prods = d.products.map((p, i) => `<article class="p" data-i="${i}" data-c="${esc(p.category)}">
${p.photo ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" width="300" height="300">` : `<div class="ph" aria-hidden="true">📦</div>`}
<div class="pb"><h3>${esc(p.name)}</h3><div class="pr">${p.price.toLocaleString("fr-FR")} FCFA${p.unit && p.unit !== "u" ? ` / ${esc(p.unit)}` : ""}</div>
${p.available ? (d.phone ? `<div class="qty" data-i="${i}"><button type="button" class="m" aria-label="Retirer un ${esc(p.name)}">−</button><span class="n">0</span><button type="button" class="a" aria-label="Ajouter un ${esc(p.name)}">+</button></div>` : `<div class="ok">Disponible</div>`) : `<div class="ko">Indisponible</div>`}</div></article>`).join("");
  const cats = [...new Set(d.products.map((p) => p.category).filter(Boolean))];
  const maps = d.location ? `https://www.google.com/maps/search/?api=1&query=${d.location.lat},${d.location.lng}` : "";
  const data = JSON.stringify({ phone: d.phone, name: d.name, p: d.products.map((p) => ({ n: p.name, pr: p.price })) }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(`Découvrez les produits de ${d.name} et commandez sur WhatsApp.`)}">
<link rel="canonical" href="${esc(url)}"><meta property="og:title" content="${esc(title)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(url)}">${d.logo ? `<meta property="og:image" content="${esc(d.logo)}">` : ""}
<style>
:root{--bg:#F0ECE3;--ink:#1B1F1C;--mut:#6B6558;--line:#DCD5C6;--gold:#7A5C22;--green:#15803D}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.45;padding-bottom:84px}
header{text-align:center;padding:24px 16px 8px}.logo{width:84px;height:84px;border-radius:20px;object-fit:cover;background:#fff;border:1px solid var(--line)}
h1{font-size:22px;margin:10px 0 2px}.sub{color:var(--mut);font-size:14px;margin:2px 0}
.act{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:10px 16px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--ink);text-decoration:none;font-size:15px}
.btn.g{color:var(--green);border-color:#16A34A66}
.chips{display:flex;gap:8px;overflow-x:auto;padding:4px 16px 8px}.chip{flex:none;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:#fff;font-size:14px;color:var(--ink)}.chip[aria-pressed=true]{background:var(--ink);color:var(--bg)}
main{max-width:760px;margin:0 auto;padding:0 12px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@media(min-width:560px){.grid{grid-template-columns:repeat(3,1fr)}}
.p{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}.p img,.ph{width:100%;aspect-ratio:1/1;object-fit:cover;background:#F7F4EC;display:flex;align-items:center;justify-content:center;font-size:34px}
.pb{padding:10px;display:flex;flex-direction:column;gap:6px;flex:1}h3{font-size:14px;margin:0;font-weight:600}.pr{font-weight:700;color:var(--gold);font-size:15px}.ok{color:var(--green);font-size:13px}.ko{color:var(--mut);font-size:13px}
.qty{display:flex;align-items:center;justify-content:space-between;margin-top:auto}.qty button{width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:#fff;font-size:20px;color:var(--ink)}.qty .n{min-width:24px;text-align:center;font-weight:600}
#bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);padding:10px 12px;display:none;gap:10px;align-items:center;justify-content:space-between}
#bar.on{display:flex}#bar b{font-size:16px}#send{min-height:48px;padding:0 18px;border:0;border-radius:10px;background:var(--green);color:#fff;font-size:15px;font-weight:600}
footer{text-align:center;color:var(--mut);font-size:12px;padding:20px 16px}footer a{color:var(--mut)}.empty{text-align:center;color:var(--mut);padding:30px 0}
.hide{display:none!important}
</style></head><body>
<header>${d.logo ? `<img class="logo" src="${esc(d.logo)}" alt="Logo ${esc(d.name)}" width="84" height="84">` : ""}<h1>${esc(d.name)}</h1>
${d.hours ? `<p class="sub">Ouvert de ${esc(d.hours.open)} à ${esc(d.hours.close)}</p>` : ""}</header>
<div class="act">${d.channel ? `<a class="btn g" href="${esc(d.channel)}" target="_blank" rel="noopener">📢 Suivre notre chaîne WhatsApp</a>` : ""}${d.phone ? `<a class="btn g" href="https://wa.me/${esc(d.phone)}" target="_blank" rel="noopener">💬 Nous écrire</a>` : ""}${maps ? `<a class="btn" href="${esc(maps)}" target="_blank" rel="noopener">📍 Nous trouver</a>` : ""}</div>
<main>${cats.length > 1 ? `<div class="chips" role="group" aria-label="Catégories"><button class="chip" type="button" aria-pressed="true" data-c="">Tout</button>${cats.map((c) => `<button class="chip" type="button" aria-pressed="false" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : ""}
${d.products.length ? `<div class="grid" id="grid">${prods}</div>` : `<p class="empty">Les produits arrivent bientôt.</p>`}</main>
<div id="bar"><span><b id="tot">0 FCFA</b><br><small id="cnt"></small></span><button id="send" type="button">Commander sur WhatsApp</button></div>
<footer>Page créée avec <a href="https://mte-registre.vercel.app">MTE Registre</a></footer>
<script>
var D=${data},q={};
function fmt(n){return n.toString().replace(/\\B(?=(\\d{3})+(?!\\d))/g," ")}
function upd(){var t=0,c=0;for(var i in q){t+=q[i]*D.p[i].pr;c+=q[i]}
document.getElementById("tot").textContent=fmt(t)+" FCFA";document.getElementById("cnt").textContent=c+" article"+(c>1?"s":"");
document.getElementById("bar").className=c?"on":""}
document.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;
if(b.classList.contains("chip")){var cs=document.querySelectorAll(".chip");for(var k=0;k<cs.length;k++)cs[k].setAttribute("aria-pressed",cs[k]===b);
var ps=document.querySelectorAll(".p");for(var j=0;j<ps.length;j++)ps[j].classList.toggle("hide",!!b.dataset.c&&ps[j].dataset.c!==b.dataset.c);return}
var w=b.closest(".qty");if(w){var i=w.dataset.i,n=(q[i]||0)+(b.classList.contains("a")?1:-1);if(n<0)n=0;if(n>99)n=99;if(n)q[i]=n;else delete q[i];w.querySelector(".n").textContent=n;upd();return}
if(b.id==="send"){var l=["Bonjour "+D.name+", je souhaite commander :"],t=0;for(var x in q){l.push("• "+q[x]+" × "+D.p[x].n+" — "+fmt(q[x]*D.p[x].pr)+" FCFA");t+=q[x]*D.p[x].pr}
l.push("","Total : "+fmt(t)+" FCFA");window.open("https://wa.me/"+D.phone+"?text="+encodeURIComponent(l.join("\\n")),"_blank")}});
</script></body></html>`;
}

function notFound(res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=30");
  return res.status(404).send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page introuvable</title></head><body style="font-family:system-ui;text-align:center;padding:60px 16px;background:#F0ECE3;color:#1B1F1C"><h1>Cette page n'existe pas</h1><p>Le lien est peut-être incorrect, ou le commerce a retiré sa page.</p><p><a href="https://mte-registre.vercel.app">MTE Registre</a></p></body></html>`);
}

export default async function handler(req, res) {
  const c = cfg();
  if (!(c.URL_ && c.KEY)) return res.status(503).json({ error: "Service indisponible." });
  const { rest, must } = db(c);

  try {
    if (req.method === "GET") {
      const slug = String(req.query?.slug || "").toLowerCase();
      if (!SLUG_RE.test(slug)) return notFound(res);
      const v = (await readKeys(rest, must, [`pub:${slug}`]))[`pub:${slug}`];
      if (!v || !v.data) return notFound(res);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).send(page(slug, v.data));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });
    res.setHeader("Cache-Control", "no-store");
    const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : req.body || {};
    const shop = String(body.shopId || "");
    if (!validCode(shop)) return res.status(400).json({ error: "Commerce invalide." });
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
    if (tooMany(ip, 60) || tooMany(shop, 60)) return res.status(429).json({ error: "Trop de demandes. Réessaie dans quelques minutes." });

    const mapKey = `pubslug:${shop}`;
    const got = await readKeys(rest, must, [REGISTRY_KEY, mapKey]);
    const entry = (Array.isArray(got[REGISTRY_KEY]) ? got[REGISTRY_KEY] : []).find((s) => s.code === shop);
    if (!entry) return res.status(403).json({ error: "Commerce inconnu." });
    const current = typeof got[mapKey]?.slug === "string" ? got[mapKey].slug : "";

    if (body.action === "status") return res.status(200).json({ published: !!current, slug: current || null });

    if (body.action === "unpublish") {
      if (current) {
        await must(await rest(`kv_store?key=eq.${encodeURIComponent(`pub:${current}`)}`, { method: "DELETE" }));
        await must(await rest(`kv_store?key=eq.${encodeURIComponent(mapKey)}`, { method: "DELETE" }));
      }
      return res.status(200).json({ published: false });
    }

    if (body.action === "publish") {
      if (entry.subscriptionUntil && new Date(entry.subscriptionUntil) < new Date()) return res.status(402).json({ error: "Abonnement expiré : renouvelle-le pour publier ta page." });
      const slug = slugify(body.slug || current || body.snapshot?.name || "");
      if (!SLUG_RE.test(slug)) return res.status(400).json({ error: "Nom de page invalide : 3 à 40 lettres, chiffres ou tirets." });
      if (["admin", "api", "s", "www", "app", "mte", "registre"].includes(slug)) return res.status(400).json({ error: "Ce nom de page est réservé." });
      const other = (await readKeys(rest, must, [`pub:${slug}`]))[`pub:${slug}`];
      if (other && other.code !== shop) return res.status(409).json({ error: "Ce nom de page est déjà pris : choisis-en un autre." });
      const data = cleanSnapshot(body.snapshot);
      await must(await put(rest, `pub:${slug}`, { code: shop, data, updatedAt: new Date().toISOString() }));
      await must(await put(rest, mapKey, { slug }));
      if (current && current !== slug) await rest(`kv_store?key=eq.${encodeURIComponent(`pub:${current}`)}`, { method: "DELETE" });
      return res.status(200).json({ slug, url: `https://mte-registre.vercel.app/s/${slug}` });
    }
    return res.status(400).json({ error: "Action inconnue." });
  } catch (e) {
    console.error("shop-page", e?.message);
    return res.status(500).json({ error: "Erreur du serveur." });
  }
}
