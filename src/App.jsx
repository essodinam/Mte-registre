/**
 * Wuri
 * Application de gestion de stock et de ventes.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Minus, Trash2, Package, ShoppingCart, History, Settings, AlertTriangle, X, Check, Lock, LogOut, ClipboardList, WifiOff, RefreshCw, UserPlus, User, Clock, PenTool, Receipt, Wrench, Wine, ShoppingBag, Hammer, Users, Phone, Banknote, Smartphone, CreditCard, Globe, Loader2, ScanLine, Star, CalendarClock, Repeat, Sparkles, Send, ArrowLeft, BarChart3 } from "lucide-react";
import { storage } from "./storage.js";

/* ---------- Design tokens ----------
Encre  : #F0ECE3 (fond)
Surface: #FFFFFF
Laiton : #C08A3E (accent primaire, prix / actions)
Sauge  : #16A34A (accent secondaire, validations)
Parchemin: #1B1F1C (texte principal)
Rouille: #DC4C3C (alertes / stock bas)
Police unique : 'Carlito', sans-serif (titres, texte, chiffres)
Signature : le "registre" — chaque ligne ressemble à une ligne de grand livre,
avec reliure cousue sur le bord gauche.
------------------------------------ */

const BUSINESS_TYPES = {
  boutique: { label: "Boutique", icon: "🛍️", categories: ["Vêtements", "Accessoires", "Divers"] },
  bar: { label: "Bar / Restauration", icon: "🍷", categories: ["Boissons", "Plats", "Snacks"] },
  menuiserie: { label: "Menuiserie", icon: "🪵", categories: ["Bois", "Panneaux", "Quincaillerie bois", "Outils"] },
  quincaillerie: { label: "Quincaillerie", icon: "🔩", categories: ["Outillage", "Fixations", "Peinture", "Électricité", "Plomberie"] },
  service: { label: "Prestation de service", icon: "🛠️", isService: true, categories: ["Installation", "Maintenance", "Conseil", "Formation", "Réseau et caméras", "Électricité", "Déplacement"] },
};

/* ---------- Code d'accès pour créer un nouveau commerce ----------
   Personne ne peut créer son propre commerce sans ce code : c'est TOI (le gérant
   de Moïse Tech Énergie) qui le communique, une fois que tu as fait la démo et
   que le commerçant a confirmé vouloir s'abonner. Change cette valeur quand tu veux.
------------------------------------------------------------------- */

/* ---------- Espace développeur : voir tous les commerces créés ----------
   Code séparé du PIN gérant ci-dessus. Change-le aussi quand tu veux.
------------------------------------------------------------------- */
const SHOPS_REGISTRY_KEY = "shops_registry";
const TEST_SHOP_CODE = "TEST-MTE-DEV"; // commerce factice, réservé au développeur, jamais visible des clients
const DEMO_TTL_MS = 24 * 3600 * 1000; // une démo vit 24 h, puis ses données sont supprimées
const DEMO_PREFIX = "DEMO-"; // commerces de démonstration : jamais dans le registre public, jamais bloqués par l'abonnement

/* ---------- Version de l'application ----------
   Change cette valeur à chaque mise à jour que tu déploies (ex: "1.1", "1.2"...).
   Dès qu'un utilisateur rouvre l'app et que cette version ne correspond plus à
   celle qu'il avait la dernière fois, il est automatiquement déconnecté et
   renvoyé à l'écran de connexion — il voit alors la nouvelle version.
------------------------------------------------------------------- */
const APP_VERSION = "3.9.18";
// Titre affiché sur l'écran d'accueil (pour afficher le nom d'un autre commerce, change seulement ce texte).
const WELCOME_TITLE = "KABATEC Consulting";
const WELCOME_LETTER = "K"; // lettre du logo sur l'écran d'accueil

const fmt = (n) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const uid = () => Math.random().toString(36).slice(2, 10);
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - new Date()) / 86400000);
// Durée en "Xh Ymin", utilisée pour afficher le temps de service travaillé.
/* ---------- Codes : empreintes SHA-256 (les codes ne sont plus stockés en clair) ---------- */
async function sha256hex(str) {
  if (!(window.crypto && window.crypto.subtle)) throw new Error("no-subtle");
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Les opérations sensibles passent par le serveur protégé /api/admin (la clé secrète n'est jamais dans l'application).
async function adminCall(action, auth, extra = {}) {
  const credentials = auth && typeof auth === "object" ? { token: auth.token } : auth ? { code: auth } : {};
  let r;
  try {
    r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...credentials, ...extra }) });
  } catch (e) { throw Object.assign(new Error("Pas de connexion au serveur."), { status: 0 }); }
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (!data) throw Object.assign(new Error("Serveur d'administration introuvable : le dossier api n'est pas encore déployé."), { status: r.status });
  if (!r.ok) throw Object.assign(new Error(data.error || "Erreur serveur"), { status: r.status });
  return data;
}
// Code à 4 chiffres d'une personne : stocké sous la forme "h1:<empreinte>" (salé par commerce + personne).
async function hashPin(pin, salt) {
  try { return "h1:" + (await sha256hex(`wuri-pin:${salt}:${pin}`)); } catch (e) { return pin; }
}
async function pinMatches(entered, stored, salt) {
  if (stored == null || stored === "") return false;
  if (String(stored).startsWith("h1:")) return (await hashPin(entered, salt)) === stored;
  return String(entered) === String(stored); // ancien format (en clair) : remplacé par l'empreinte après une connexion réussie
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const DEFAULT_DEPOTS = ["Magasin principal"];

const waNumber = (phone) => {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = "228" + d; // numéro togolais sans indicatif
  return d;
};

const formatDuration = (ms) => {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
};

// Distance en mètres entre deux points GPS (formule de Haversine), utilisée pour
// vérifier qu'une prise de service se fait bien sur place et pas à distance.
const SHOP_RADIUS_METERS = 300;
const distanceMeters = (a, b) => {
  if (!a || !b) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
};
const getCurrentPosition = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) { reject(new Error("Géolocalisation non supportée")); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => reject(err),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
});

// ---------- Empreinte digitale (connexion rapide par appareil, via WebAuthn) ----------
// Le navigateur ne renvoie une "assertion" réussie que si le capteur biométrique
// (empreinte, Face ID) de CET appareil a confirmé l'identité. On n'a pas de serveur
// pour vérifier la signature cryptographique, mais c'est sans importance pour ce
// cas d'usage : sans le doigt/visage déjà enregistré sur ce téléphone précis, la
// promesse n'aboutit jamais. L'identifiant d'identifiant (credential) reste
// strictement local à l'appareil (stockage non partagé).
const BIOMETRIC_SUPPORTED =
  typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;

function b64encode(buf) {
  let str = "";
  new Uint8Array(buf).forEach((b) => { str += String.fromCharCode(b); });
  return btoa(str);
}
function b64decode(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function registerBiometric(userKey, userName) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "KABATEC Consulting" },
      user: { id: userId, name: userKey, displayName: userName || userKey },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!cred) throw new Error("Échec de l'enregistrement");
  return b64encode(cred.rawId);
}

async function verifyBiometric(credentialId) {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: b64decode(credentialId), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  return !!assertion;
}
/* ---------- Empreinte pour les accès développeur / propriétaire (vérifiée par le serveur) ---------- */
const b64u = (buf) => b64encode(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uBytes = (s) => b64decode(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
const adminBioLocal = (role) => { try { return localStorage.getItem(`wuri-adminbio:${role}`); } catch (e) { return null; } };
async function adminBioRegister(role, auth) {
  const { pack } = await adminCall("bioRegisterOptions", auth, { role });
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: b64uBytes(pack.challenge),
      rp: { name: "KABATEC Consulting", id: window.location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: `wuri-${role}`, displayName: role === "dev" ? "Développeur" : "Propriétaire" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000,
      attestation: "none",
    },
  });
  const pk = cred && cred.response.getPublicKey && cred.response.getPublicKey();
  if (!pk) throw new Error("Ce téléphone ne permet pas cette protection.");
  const credentialId = b64u(cred.rawId);
  await adminCall("bioRegister", auth, { role, pack, credentialId, clientDataJSON: b64u(cred.response.clientDataJSON), publicKey: b64u(pk) });
  try { localStorage.setItem(`wuri-adminbio:${role}`, credentialId); } catch (e) {}
}
async function adminBioLogin(role) {
  const id = adminBioLocal(role);
  if (!id) throw new Error("Empreinte non activée sur ce téléphone.");
  const { pack } = await adminCall("bioOptions", null, { role });
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: b64uBytes(pack.challenge),
      rpId: window.location.hostname,
      allowCredentials: [{ id: b64uBytes(id), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  if (!a) throw new Error("Empreinte annulée.");
  const r = await adminCall("bioLogin", null, {
    role, pack, credentialId: b64u(a.rawId),
    clientDataJSON: b64u(a.response.clientDataJSON), authenticatorData: b64u(a.response.authenticatorData), signature: b64u(a.response.signature),
  });
  return { token: r.token };
}
// Met un numéro togolais (ou autre) au format attendu par wa.me (indicatif sans +, sans espaces).
const waPhone = (phone) => {
  let p = (phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p.slice(1);
  if (p.startsWith("00")) return p.slice(2);
  if (p.startsWith("0")) return "228" + p.slice(1); // indicatif Togo par défaut
  if (p.startsWith("228")) return p;
  return p ? "228" + p : "";
};

// Numéros WhatsApp d'alerte du commerce (jusqu'à 3) : un bouton d'envoi par numéro.
// WhatsApp ne permet d'ouvrir qu'une conversation à la fois : chaque bouton ouvre le message déjà prêt pour ce numéro.
const cleanAlertPhones = (arr) => (Array.isArray(arr) ? arr : []).filter((p) => p && waPhone(p.phone)).slice(0, 3);
function WaAlertButtons({ phones, text, label, className, style }) {
  const list = cleanAlertPhones(phones);
  const go = (num) => window.open(`https://wa.me/${num ? waPhone(num) : ""}?text=${encodeURIComponent(text)}`, "_blank");
  if (list.length === 0) {
    return <button onClick={() => go("")} className={className} style={style}>{label}</button>;
  }
  return (
    <>
      {list.map((p, i) => (
        <button key={i} onClick={() => go(p.phone)} className={className} style={style}>
          {label} → {p.name ? p.name : "+" + waPhone(p.phone)}
        </button>
      ))}
    </>
  );
}

/* ---------- Format d'impression du ticket (58mm / 80mm / A4) ---------- */
function receiptPrintCss(format) {
  if (format === "80mm") return "@page { size: 80mm auto; margin: 2mm; } .mte-receipt { width: 76mm !important; max-width: 76mm !important; }";
  if (format === "a4") return "@page { size: auto; margin: 10mm; } .mte-receipt { width: 100% !important; max-width: 420px !important; }";
  return "@page { size: 58mm auto; margin: 2mm; } .mte-receipt { width: 54mm !important; max-width: 54mm !important; }";
}

/* ---------- Mode de paiement ----------
   Deux familles : les moyens "manuels" (juste notés sur la vente, l'argent est
   déjà remis en main propre au vendeur/caissier) et le paiement en ligne réel,
   via FedaPay, quand le commerce a renseigné sa clé publique dans Réglages.
------------------------------------------------------------------- */
const PAYMENT_METHODS = [
  { id: "especes", label: "Espèces", icon: Banknote },
  { id: "mobile_money", label: "Mobile Money", icon: Smartphone },
  { id: "carte", label: "Carte bancaire", icon: CreditCard },
  { id: "en_ligne", label: "Paiement en ligne", icon: Globe },
  { id: "credit", label: "Crédit (à payer plus tard)", icon: Receipt },
];
const paymentLabel = (id) => (PAYMENT_METHODS.find((m) => m.id === id) || PAYMENT_METHODS[0]).label;

/* ---------- Intégration FedaPay (paiement en ligne) ----------
   Charge le widget Checkout.js de FedaPay une seule fois, puis ouvre la
   fenêtre de paiement avec la clé publique propre à CE commerce.
------------------------------------------------------------------- */
function loadFedaPayScript(callback, onError) {
  if (typeof window === "undefined") return;
  if (window.FedaPay) { callback(); return; }
  const existing = document.getElementById("fedapay-checkout-js");
  if (existing) {
    existing.addEventListener("load", callback);
    existing.addEventListener("error", () => onError && onError());
    return;
  }
  const script = document.createElement("script");
  script.id = "fedapay-checkout-js";
  script.src = "https://cdn.fedapay.com/checkout.js?v=1.1.7";
  script.async = true;
  script.onload = callback;
  script.onerror = () => onError && onError();
  document.body.appendChild(script);
}

/* ---------- Logo Moïse Tech Énergie ---------- */
function Logo({ size = 40, letter = WELCOME_LETTER }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      <circle cx="120" cy="120" r="116" fill="#1B1F1C" />
      <text
        x="120" y="158"
        textAnchor="middle"
        fontFamily="Inter, 'Helvetica Neue', Arial, sans-serif"
        fontWeight="700"
        fontSize="132"
        fill="#F0ECE3"
      >
        {letter}
      </text>
      <rect x="92" y="176" width="56" height="5" rx="2" fill="#C08A3E" />
    </svg>
  );
}

/* ---------- Synchronisation résiliente (file d'attente hors-ligne) ---------- */
function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

function useShared(key, fallback, pendingRef, onSyncChange) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!key) { setValue(fallback); setLoaded(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get(key, true);
        if (!cancelled) setValue(res ? JSON.parse(res.value) : fallback);
      } catch (e) {
        if (!cancelled) setValue(fallback);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [key]);

  const tryPersist = useCallback(async (next) => {
    if (!key) return false;
    try {
      await storage.set(key, JSON.stringify(next), true);
      pendingRef.current.delete(key);
      onSyncChange();
      return true;
    } catch (e) {
      pendingRef.current.set(key, next);
      onSyncChange();
      return false;
    }
  }, [key, pendingRef, onSyncChange]);

  const persist = useCallback((updater) => {
    setValue((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      tryPersist(next);
      return next;
    });
  }, [tryPersist]);

  return [value, persist, loaded, tryPersist, key];
}

/* ---------- UI: registre ---------- */
function Ledger({ children }) {
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
      <div className="absolute left-0 top-0 bottom-0 w-2" style={{
        background: "repeating-linear-gradient(180deg, #C08A3E 0 6px, transparent 6px 14px)",
        opacity: 0.55,
      }} />
      <div className="pl-4">{children}</div>
    </div>
  );
}

function Row({ n, children }) {
  return (
    <div className="flex items-center gap-3 py-3 pr-3 border-b last:border-b-0" style={{ borderColor: "#DCD5C622" }}>
      <span className="text-xs w-6 text-right shrink-0" style={{ fontFamily: "'Carlito', sans-serif", color: "#16A34A" }}>
        {String(n).padStart(2, "0")}
      </span>
      {children}
    </div>
  );
}

function SyncBadge({ online, pendingCount }) {
  if (online && pendingCount === 0) return null;
  return (
    <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-full" style={{
      background: online ? "#C08A3E1A" : "#DC4C3C1A",
      color: online ? "#C08A3E" : "#DC4C3C",
      border: `1px solid ${online ? "#C08A3E55" : "#DC4C3C55"}`,
    }}>
      {online ? <RefreshCw size={11} className="animate-spin" /> : <WifiOff size={11} />}
      {online ? "Synchronisation…" : "Hors ligne"}
    </div>
  );
}

/* ---------- PIN pad ---------- */
function PinPad({ title, subtitle, onSubmit, onCancel, error }) {
  const [pin, setPin] = useState("");
  const submit = (p) => { onSubmit(p); setPin(""); };
  const press = (d) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) submit(next);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-6 space-y-4 text-center" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <Lock size={22} style={{ color: "#1B1F1C" }} className="mx-auto" />
        <div>
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: "#6B6558" }}>{subtitle}</p>}
        </div>
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-3 h-3 rounded-full" style={{ background: i < pin.length ? "#C08A3E" : "#DCD5C6" }} />
          ))}
        </div>
        {error && <p className="text-xs" style={{ color: "#DC4C3C" }}>{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => (
            <button
              key={i}
              disabled={d === ""}
              onClick={() => (d === "⌫" ? setPin((p) => p.slice(0, -1)) : d && press(d))}
              className="py-3 rounded-lg text-sm"
              style={{ background: d === "" ? "transparent" : "#F0ECE3", color: "#1B1F1C", border: d === "" ? "none" : "1px solid #DCD5C6" }}
            >
              {d}
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-xs" style={{ color: "#6B6558" }}>Annuler</button>
      </div>
    </div>
  );
}

/* ---------- Portail mot de passe libre (ex : Espace gérant) ---------- */
function PasswordGate({ title, subtitle, onSubmit, onCancel, error, onBio }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-6 space-y-4 text-center" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <Lock size={22} style={{ color: "#1B1F1C" }} className="mx-auto" />
        <div>
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: "#6B6558" }}>{subtitle}</p>}
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value) onSubmit(value); }}
          autoFocus
          className="w-full px-4 py-3 rounded-lg text-center outline-none text-lg"
          style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
        />
        {error && <p className="text-xs" style={{ color: "#DC4C3C" }}>{error}</p>}
        <button
          disabled={!value}
          onClick={() => onSubmit(value)}
          className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: "#1B1F1C", color: "#F0ECE3" }}
        >
          Valider
        </button>
        {onBio && (
          <button onClick={onBio} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2" style={{ background: "#F0ECE3", color: "#1B1F1C", border: "1px solid #C08A3E" }}>
            <ScanLine size={16} style={{ color: "#C08A3E" }} /> Utiliser l'empreinte
          </button>
        )}
        <button onClick={onCancel} className="text-xs" style={{ color: "#6B6558" }}>Annuler</button>
      </div>
    </div>
  );
}
function SignaturePad({ name, onSign, onCancel, title = "Signature de prise de service", confirmLabel = "Signer et commencer" }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e) => {
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1B1F1C";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.stroke();
    setEmpty(false);
  };
  const end = () => { drawingRef.current = false; };
  const clear = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setEmpty(true);
  };
  const confirm = async () => {
    if (empty || confirming) return;
    setConfirming(true);
    try {
      await onSign(canvasRef.current.toDataURL("image/png"));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="text-center">
          <PenTool size={20} style={{ color: "#C08A3E" }} className="mx-auto" />
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg mt-1">{title}</h3>
          <p className="text-xs mt-1" style={{ color: "#6B6558" }}>{name} — {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <canvas
          ref={canvasRef}
          width={320}
          height={140}
          className="w-full rounded-lg touch-none"
          style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <div className="flex gap-2">
          <button onClick={clear} disabled={confirming} className="px-4 py-2.5 rounded-lg text-sm disabled:opacity-40" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>Effacer</button>
          <button
            disabled={empty || confirming}
            onClick={confirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: "#C08A3E", color: "#F0ECE3" }}
          >
            {confirming ? (<><Loader2 size={15} className="animate-spin" /> Vérification…</>) : confirmLabel}
          </button>
        </div>
        <button onClick={onCancel} className="w-full text-xs" style={{ color: "#6B6558" }}>Annuler</button>
      </div>
    </div>
  );
}

/* ---------- Vitrine des catégories de commerce (écran d'accueil) ---------- */
const IMG_MENUISERIE = "data:image/webp;base64,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";
const IMG_BOUTIQUE = "data:image/webp;base64,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";
const IMG_BAR = "data:image/webp;base64,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";
const IMG_QUINCAILLERIE = "data:image/webp;base64,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";

const CATEGORY_SHOWCASE = [
  { key: "quincaillerie", label: "Quincaillerie", image: IMG_QUINCAILLERIE },
  { key: "bar", label: "Bar / Restauration", image: IMG_BAR },
  { key: "boutique", label: "Boutique", image: IMG_BOUTIQUE },
  { key: "menuiserie", label: "Menuiserie", image: IMG_MENUISERIE },
];

function CategoryShowcase() {
  // Photos détourées (fond retiré), présentées dans des cercles.
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4 mb-1 justify-items-center">
      {CATEGORY_SHOWCASE.map(({ key, label, image }) => (
        <div key={key} className="w-full max-w-[150px] flex flex-col items-center">
          <div
            className="w-full aspect-square rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", boxShadow: "0 2px 8px #1B1F1C14" }}
          >
            <img src={image} alt={label} className="w-[78%] h-[78%] object-contain" />
          </div>
          <span className="mt-1.5 text-[11px] text-center leading-tight" style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Espace développeur : liste de tous les commerces ---------- */
/* ---------- Statut d'abonnement (suivi développeur) ---------- */
function getSubscriptionStatus(subscriptionUntil) {
  if (!subscriptionUntil) return { label: "Abonnement non défini", color: "#6B6558" };
  const days = Math.ceil((new Date(subscriptionUntil) - new Date()) / 86400000);
  if (days < 0) return { label: `En retard depuis ${Math.abs(days)}j`, color: "#DC4C3C" };
  if (days <= 7) return { label: `Expire dans ${days}j`, color: "#C08A3E" };
  return { label: `À jour · jusqu'au ${new Date(subscriptionUntil).toLocaleDateString("fr-FR")}`, color: "#16A34A" };
}

function DevPanel({ onOpenShop, onClose }) {
  const [gate, setGate] = useState(true);
  const [error, setError] = useState("");
  const [shops, setShops] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [editingCode, setEditingCode] = useState(null);
  const [editDateValue, setEditDateValue] = useState("");
  const [shopStats, setShopStats] = useState({}); // code -> { total, count, lastActivity }
  const [sortBy, setSortBy] = useState("recent"); // 'recent' | 'revenue'
  const [busyMsg, setBusyMsg] = useState("");
  const codeRef = useRef("");

  const deleteShop = async (s) => {
    const typed = window.prompt(`Suppression DÉFINITIVE du commerce ${s.code} : articles, ventes, personnel, photos... tout sera effacé.\n\nPense à faire « Export » avant.\nPour confirmer, tape le code du commerce :`);
    if (!typed || typed.trim().toUpperCase() !== String(s.code).toUpperCase()) { if (typed !== null) window.alert("Code différent : suppression annulée."); return; }
    setBusyMsg(`Suppression de ${s.code}…`);
    try {
      await adminCall("deleteShop", codeRef.current, { target: s.code });
      const next = shops.filter((x) => x.code !== s.code);
      setShops(next);
      setBusyMsg(`✓ ${s.code} supprimé.`);
    } catch (e) {
      setBusyMsg("Échec de la suppression : " + (e?.message || "erreur inconnue"));
    }
  };

  const cleanDemos = async () => {
    setBusyMsg("Recherche des démos…");
    try {
      const { codes } = await adminCall("listDemos", codeRef.current);
      if (!window.confirm(`Supprimer définitivement ${codes.length} démo(s) et les données du mode test ?`)) { setBusyMsg(""); return; }
      await adminCall("cleanDemos", codeRef.current);
      setShops((cur) => (cur ? cur.filter((x) => !String(x.code).startsWith(DEMO_PREFIX) && x.code !== TEST_SHOP_CODE) : cur));
      setBusyMsg(`✓ ${codes.length} démo(s) et le mode test nettoyés.`);
    } catch (e) {
      setBusyMsg("Échec du nettoyage : " + (e?.message || "erreur inconnue"));
    }
  };

  const [bioTick, setBioTick] = useState(0);
  const enter = async (auth) => {
    try {
      const data = await adminCall("list", auth);
      codeRef.current = auth;
      const list = [...(data.shops || [])];
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setShops(list);
      setShopStats(data.stats || {});
      setGate(false);
      setError("");
    } catch (e) {
      setError(e.status === 401 || e.status === 429 ? e.message : "Connexion impossible : " + e.message);
    }
  };
  const handlePin = (pin) => enter(pin);
  const handleBio = async () => {
    try { await enter(await adminBioLogin("dev")); }
    catch (e) { setError(e.message || "Empreinte refusée."); }
  };
  const enableBio = async () => {
    setBusyMsg("Place ton doigt sur le capteur…");
    try { await adminBioRegister("dev", codeRef.current); setBioTick((n) => n + 1); setBusyMsg("✓ Empreinte activée sur ce téléphone."); }
    catch (e) { setBusyMsg("Échec de l'activation : " + (e?.message || "annulé")); }
  };
  const revokeBio = async () => {
    if (!window.confirm("Retirer l'empreinte de TOUS les téléphones développeur ? Le code restera valable.")) return;
    try { await adminCall("bioRevoke", codeRef.current, { role: "dev" }); try { localStorage.removeItem("wuri-adminbio:dev"); } catch (e) {} setBioTick((n) => n + 1); setBusyMsg("✓ Empreintes développeur retirées."); }
    catch (e) { setBusyMsg("Échec : " + e.message); }
  };

  const saveSubscription = async (code, dateValue) => {
    const iso = dateValue ? new Date(dateValue).toISOString() : null;
    const next = shops.map((s) => (s.code === code ? { ...s, subscriptionUntil: iso } : s));
    setShops(next);
    setEditingCode(null);
    try {
      await adminCall("setSubscription", codeRef.current, { target: code, until: iso });
    } catch (e) { setBusyMsg("Échec de l'enregistrement : " + e.message); }
  };

  const extendOneMonth = (s) => {
    const base = s.subscriptionUntil && new Date(s.subscriptionUntil) > new Date() ? new Date(s.subscriptionUntil) : new Date();
    base.setMonth(base.getMonth() + 1);
    saveSubscription(s.code, base.toISOString().slice(0, 10));
  };

  const exportShopData = async (code) => {
    let data;
    try { ({ data } = await adminCall("export", codeRef.current, { target: code })); }
    catch (e) { setBusyMsg("Échec de l'export : " + e.message); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (gate) {
    return (
      <PasswordGate
        title="Code développeur"
        subtitle="Réservé au concepteur de l'application"
        onSubmit={handlePin}
        onBio={BIOMETRIC_SUPPORTED && adminBioLocal("dev") ? handleBio : null}
        onCancel={onClose}
        error={error}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#1B1F1Ccc" }}>
      <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-lg p-5 space-y-3" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">
            Commerces ({shops ? shops.length : 0})
          </h2>
          <button onClick={onClose} style={{ color: "#6B6558" }}><X size={20} /></button>
        </div>
        {shops && shops.length > 0 && (() => {
          const overdue = shops.filter((s) => s.subscriptionUntil && new Date(s.subscriptionUntil) < new Date()).length;
          const soon = shops.filter((s) => {
            if (!s.subscriptionUntil) return false;
            const days = Math.ceil((new Date(s.subscriptionUntil) - new Date()) / 86400000);
            return days >= 0 && days <= 7;
          }).length;
          if (overdue === 0 && soon === 0) return null;
          return (
            <div className="flex gap-2 text-[11px]">
              {overdue > 0 && (
                <span className="px-2 py-1 rounded-full" style={{ background: "#DC4C3C1A", color: "#DC4C3C" }}>
                  {overdue} en retard
                </span>
              )}
              {soon > 0 && (
                <span className="px-2 py-1 rounded-full" style={{ background: "#C08A3E1A", color: "#C08A3E" }}>
                  {soon} bientôt expiré{soon > 1 ? "s" : ""}
                </span>
              )}
            </div>
          );
        })()}
        <button
          onClick={() => onOpenShop(TEST_SHOP_CODE)}
          className="mx-auto flex flex-col items-center gap-1"
        >
          <span className="flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: "#16A34A" }}>
            <span className="text-2xl">🧪</span>
          </span>
          <span style={{ color: "#16A34A" }} className="text-xs">Mode test</span>
        </button>
        <button onClick={cleanDemos} className="mx-auto block text-[11px] px-3 py-1.5 rounded-full" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#6B6558" }}>
          🧹 Nettoyer les démos et le mode test
        </button>
        {BIOMETRIC_SUPPORTED && (
          <div className="flex gap-2 justify-center text-xs" data-tick={bioTick}>
            {!adminBioLocal("dev") && typeof codeRef.current === "string" && (
              <button onClick={enableBio} className="px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ border: "1px solid #C08A3E", color: "#1B1F1C" }}><ScanLine size={13} style={{ color: "#C08A3E" }} /> Activer l'empreinte ici</button>
            )}
            {typeof codeRef.current === "string" && (
              <button onClick={revokeBio} className="px-3 py-1.5 rounded-lg" style={{ border: "1px solid #DCD5C6", color: "#6B6558" }}>Retirer les empreintes</button>
            )}
          </div>
        )}
        {busyMsg && <p className="text-xs text-center" style={{ color: busyMsg.startsWith("Échec") ? "#DC4C3C" : "#16A34A" }}>{busyMsg}</p>}
        {loadError && <p className="text-xs" style={{ color: "#DC4C3C" }}>{loadError}</p>}
        {shops && shops.length === 0 && !loadError && (
          <p className="text-xs" style={{ color: "#6B6558" }}>Aucun commerce enregistré pour l'instant.</p>
        )}
        {shops && shops.length > 1 && (
          <div className="flex gap-2">
            {[["recent", "Plus récents"], ["revenue", "Chiffre d'affaires"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSortBy(id)}
                className="flex-1 py-1.5 rounded-md text-xs"
                style={{ background: sortBy === id ? "#C08A3E22" : "#F0ECE3", border: `1px solid ${sortBy === id ? "#C08A3E" : "#DCD5C6"}`, color: sortBy === id ? "#C08A3E" : "#6B6558" }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-2">
          {shops && [...shops].sort((a, b) => {
            if (sortBy === "revenue") return (shopStats[b.code]?.total || 0) - (shopStats[a.code]?.total || 0);
            return (b.createdAt || "").localeCompare(a.createdAt || "");
          }).map((s) => {
            const status = getSubscriptionStatus(s.subscriptionUntil);
            const isEditing = editingCode === s.code;
            const stat = shopStats[s.code];
            return (
              <div key={s.code} className="rounded-lg p-3" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => onOpenShop(s.code)} className="text-left flex-1">
                    <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E", letterSpacing: "0.1em" }} className="block text-sm">{s.code}</span>
                    <span className="text-xs block mt-0.5" style={{ color: "#6B6558" }}>
                      {BUSINESS_TYPES[s.businessType]?.label || "Type non défini"}
                      {s.createdAt ? ` · créé le ${new Date(s.createdAt).toLocaleDateString("fr-FR")}` : ""}
                    </span>
                    {stat && (
                      <span className="text-xs block mt-0.5" style={{ color: stat.count > 0 ? "#16A34A" : "#6B6558" }}>
                        {stat.count} vente{stat.count > 1 ? "s" : ""} · {fmt(stat.total)} FCFA
                        {stat.lastActivity ? ` · dernière activité il y a ${Math.floor((Date.now() - stat.lastActivity) / 86400000)}j` : " · jamais utilisé"}
                      </span>
                    )}
                  </button>
                  <span style={{ color: "#16A34A" }} className="text-xs shrink-0 ml-2">Ouvrir →</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #DCD5C6" }}>
                  <span className="text-[11px]" style={{ color: status.color }}>{status.label}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => exportShopData(s.code)} className="text-[11px] px-2 py-1 rounded" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#6B6558" }}>
                      Export
                    </button>
                    <button onClick={() => deleteShop(s)} className="text-[11px] px-2 py-1 rounded" style={{ background: "#DC4C3C1A", color: "#DC4C3C" }}>
                      Supprimer
                    </button>
                    <button onClick={() => extendOneMonth(s)} className="text-[11px] px-2 py-1 rounded" style={{ background: "#16A34A1A", color: "#16A34A" }}>
                      +1 mois
                    </button>
                    <button onClick={() => { setEditingCode(isEditing ? null : s.code); setEditDateValue(s.subscriptionUntil ? new Date(s.subscriptionUntil).toISOString().slice(0, 10) : ""); }} className="text-[11px] px-2 py-1 rounded" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#6B6558" }}>
                      Date
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="date"
                      value={editDateValue}
                      onChange={(e) => setEditDateValue(e.target.value)}
                      className="flex-1 text-xs rounded p-1.5"
                      style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
                    />
                    <button onClick={() => saveSubscription(s.code, editDateValue)} className="text-xs px-2 py-1.5 rounded" style={{ background: "#C08A3E", color: "#F0ECE3" }}>
                      OK
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Écran d'accueil ---------- */
function ShopScreen({ onCreate, onJoin, onDevOpen, onDemo, knownShops, onForget }) {
  const [mode, setMode] = useState(null); // null | 'join'
  const [code, setCode] = useState("");
  const [ownerGate, setOwnerGate] = useState(false);
  const [ownerError, setOwnerError] = useState("");
  const [devPanel, setDevPanel] = useState(false);

  const handleOwnerPin = async (pin) => {
    try {
      await adminCall("verifyOwner", pin);
      setOwnerGate(false);
      setOwnerError("");
      if (BIOMETRIC_SUPPORTED && !adminBioLocal("owner") && window.confirm("Activer l'empreinte sur ce téléphone pour ne plus taper ce code ?")) {
        try { await adminBioRegister("owner", pin); } catch (e) { window.alert("Empreinte non activée : " + (e?.message || "annulé")); }
      }
      onCreate();
    } catch (e) {
      setOwnerError(e.status === 401 || e.status === 429 ? e.message : "Connexion impossible : " + e.message);
    }
  };
  const handleOwnerBio = async () => {
    try {
      const auth = await adminBioLogin("owner");
      await adminCall("verifyOwner", auth);
      setOwnerGate(false);
      setOwnerError("");
      onCreate();
    } catch (e) { setOwnerError(e?.message || "Empreinte refusée."); }
  };

  if (mode === "join") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <Logo size={56} />
            <h1 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-2xl">KABATEC Consulting</h1>
            <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Code de ton commerce</p>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex : AB12-CD34"
            className="w-full px-4 py-3 rounded-lg text-center outline-none text-lg tracking-widest"
            style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
          />
          <button
            disabled={!code.trim()}
            onClick={() => onJoin(code.trim())}
            className="w-full py-3 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "#1B1F1C", color: "#F0ECE3" }}
          >
            Rejoindre ce commerce
          </button>
          <button onClick={() => setMode(null)} className="w-full text-xs" style={{ color: "#6B6558" }}>Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
      <div className="w-full max-w-sm space-y-5">
        <CategoryShowcase />
        <div className="flex flex-col items-center text-center">
          <Logo size={64} letter={WELCOME_LETTER} />
          <h1 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-2xl mt-2">{WELCOME_TITLE}</h1>
          <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Bienvenue</p>
        </div>
        {knownShops && knownShops.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide mb-1.5 px-1" style={{ color: "#6B6558" }}>Mes commerces sur cet appareil</p>
            <div className="space-y-1.5">
              {knownShops.map((s) => (
                <div key={s.code} className="relative">
                  <button
                    onClick={() => onJoin(s.code)}
                    className="w-full pl-3 pr-10 py-2.5 rounded-lg text-left flex items-center justify-between text-sm"
                    style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
                  >
                    <span className="flex items-center gap-2"><Repeat size={13} style={{ color: "#C08A3E" }} /> {s.label || s.code}</span>
                    <span className="text-xs" style={{ color: "#6B6558", fontFamily: "'Carlito', sans-serif" }}>{s.code}</span>
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`Retirer « ${s.label || s.code} » de la liste de cet appareil ? Les données du commerce ne sont pas supprimées.`)) onForget(s.code); }}
                    aria-label="Retirer de la liste"
                    className="absolute top-1/2 right-2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ color: "#6B6558" }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <button onClick={() => setMode("join")} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55", color: "#1B1F1C" }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#1B1F1C", color: "#F0ECE3" }}><User size={16} /></span>
            <span>
              <span style={{ fontFamily: "'Carlito', sans-serif" }} className="block">Rejoindre un commerce</span>
              <span className="text-xs block mt-0.5" style={{ color: "#6B6558" }}>J'ai déjà un code</span>
            </span>
          </button>
        </div>
        <button onClick={() => setOwnerGate(true)} className="w-full text-center text-xs pt-1" style={{ color: "#8A6A2E" }}>
          Espace gérant — créer un commerce
        </button>
        {onDemo && (
          <div className="flex justify-center">
            <button
              onClick={onDemo}
              aria-label="Essayer la démo"
              title="Démo"
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "#C08A3E1A", color: "#C08A3E", border: "1px solid #C08A3E66" }}
            >
              <Sparkles size={18} />
            </button>
          </div>
        )}
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setDevPanel(true)}
            aria-label="Espace développeur"
            className="flex items-center justify-center rounded-full"
            style={{ width: 34, height: 34, background: "#1B1F1C" }}
          >
            <Lock size={14} color="#F0ECE3" />
          </button>
        </div>
      </div>
      {ownerGate && (
        <PasswordGate
          title="Mot de passe gérant"
          subtitle="Ce code t'est réservé, communique-le au commerçant une fois son abonnement confirmé"
          onSubmit={handleOwnerPin}
          onBio={BIOMETRIC_SUPPORTED && adminBioLocal("owner") ? handleOwnerBio : null}
          onCancel={() => { setOwnerGate(false); setOwnerError(""); }}
          error={ownerError}
        />
      )}
      {devPanel && (
        <DevPanel
          onOpenShop={(code) => { setDevPanel(false); onDevOpen(code); }}
          onClose={() => setDevPanel(false)}
        />
      )}
    </div>
  );
}

/* ---------- Confirmation du code commerce nouvellement créé ---------- */
function ShopCodeReveal({ code, onContinue }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 text-center" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <Package size={22} style={{ color: "#1B1F1C" }} className="mx-auto" />
        <div>
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Ton commerce est créé</h3>
          <p className="text-xs mt-1" style={{ color: "#6B6558" }}>Note ce code : il te servira à connecter tes autres appareils et employés à ce même registre.</p>
        </div>
        <div className="py-3 rounded-lg text-xl tracking-[0.3em]" style={{ background: "#F0ECE3", border: "1px solid #C08A3E55", color: "#8A6A2E", fontFamily: "'Carlito', sans-serif" }}>
          {code}
        </div>
        <p className="text-[10px]" style={{ color: "#8A6A2E" }}>Tu pourras le retrouver plus tard dans Réglages.</p>
        <button onClick={onContinue} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: "#1B1F1C", color: "#F0ECE3" }}>
          J'ai noté, continuer
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ sellers, cashiers, onPickGerant, onPickVendeur, onPickCaissier, biometricCreds, onBack }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
      <div className="w-full max-w-sm space-y-5">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm" style={{ color: "#6B6558" }}>
            <ArrowLeft size={16} /> Retour
          </button>
        )}
        <div className="text-center">
          <Logo size={56} />
          <h1 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-2xl">KABATEC Consulting</h1>
          <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Qui utilise l'application ?</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onPickGerant}
            className="relative aspect-square rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center"
            style={{ background: "#C08A3E1A", border: "2px solid #C08A3E", color: "#1B1F1C" }}
          >
            {biometricCreds?.["gerant"] && <ScanLine size={13} className="absolute top-2 right-2" style={{ color: "#C08A3E" }} />}
            <Lock size={22} style={{ color: "#8A6A2E" }} />
            <span style={{ fontFamily: "'Carlito', sans-serif" }} className="text-sm font-semibold">Gérant</span>
          </button>
          {sellers.map((s) => (
            <button
              key={s.id}
              onClick={() => onPickVendeur(s)}
              className="relative aspect-square rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center"
              style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
            >
              {biometricCreds?.[`vendeur:${s.id}`] && <ScanLine size={13} className="absolute top-2 right-2" style={{ color: "#C08A3E" }} />}
              <User size={22} style={{ color: "#6B6558" }} />
              <span style={{ fontFamily: "'Carlito', sans-serif" }} className="text-sm font-semibold">{s.name}</span>
            </button>
          ))}
          {cashiers.map((c) => (
            <button
              key={c.id}
              onClick={() => onPickCaissier(c)}
              className="relative aspect-square rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center"
              style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
            >
              {biometricCreds?.[`caissier:${c.id}`] && <ScanLine size={13} className="absolute top-2 right-2" style={{ color: "#C08A3E" }} />}
              <Receipt size={22} style={{ color: "#6B6558" }} />
              <span style={{ fontFamily: "'Carlito', sans-serif" }} className="text-sm font-semibold">{c.name}</span>
              <span className="text-[10px] -mt-1.5" style={{ color: "#8A6A2E" }}>Caissier</span>
            </button>
          ))}
        </div>
        {sellers.length === 0 && cashiers.length === 0 && (
          <p className="text-xs text-center" style={{ color: "#8A6A2E" }}>Le gérant peut créer des accès vendeur ou caissier depuis Réglages.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Stock ---------- */
function allCategoriesOf(categories, products) {
  const extra = [];
  products.forEach((p) => { if (p.category && !categories.includes(p.category) && !extra.includes(p.category)) extra.push(p.category); });
  return [...categories, ...extra];
}

function CategoryChips({ categories, value, onChange, counts }) {
  if (!categories.length) return null;
  const chip = (label, val, count) => {
    const active = value === val;
    return (
      <button
        key={val}
        onClick={() => onChange(val)}
        className="shrink-0 px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
        style={{ background: active ? "#C08A3E" : "#F0ECE3", color: active ? "#FFFFFF" : "#1B1F1C", border: `1px solid ${active ? "#C08A3E" : "#DCD5C6"}` }}
      >
        {label}{count != null ? ` (${count})` : ""}
      </button>
    );
  };
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {chip("Tout", "", counts ? counts[""] : null)}
      {categories.map((c) => chip(c, c, counts ? counts[c] || 0 : null))}
    </div>
  );
}

function StockTab({ products, isAdmin, canEdit, onOpenProduct, onRequestGerant, categories, depots, alertPhones }) {
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [depotFilter, setDepotFilter] = useState("");
  const depotOf = (p) => p.depot || depots[0];
  const depotsAll = useMemo(() => allCategoriesOf(depots, products.map((p) => ({ category: depotOf(p) }))), [depots, products]);
  const depotCounts = useMemo(() => {
    const c = { "": products.length };
    products.forEach((p) => { const d = p.depot || depots[0]; c[d] = (c[d] || 0) + 1; });
    return c;
  }, [products, depots]);
  const cats = useMemo(() => allCategoriesOf(categories, products), [categories, products]);
  const counts = useMemo(() => {
    const c = { "": products.length };
    products.forEach((p) => { c[p.category] = (c[p.category] || 0) + 1; });
    return c;
  }, [products]);
  const filtered = useMemo(
    () => products.filter((p) => productSearchText(p).includes(query.toLowerCase()) && (!catFilter || p.category === catFilter) && (!depotFilter || depotOf(p) === depotFilter)),
    [products, query, catFilter, depotFilter]
  );
  const stockValue = (list) => list.reduce((sum, p) => sum + (Number(p.stock) || 0) * (Number(p.costPrice) || Number(p.price) || 0), 0);
  const catValue = stockValue(filtered);
  const lowStock = products.filter((p) => !p.isService && p.stock <= p.threshold);
  const expiring = products.filter((p) => p.expiryDate && daysUntil(p.expiryDate) <= 7);

  return (
    <div className="space-y-4">
      {expiring.length > 0 && (
        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55" }}>
          <CalendarClock size={18} style={{ color: "#C08A3E" }} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm" style={{ color: "#1B1F1C" }}>
            <span className="font-semibold" style={{ color: "#C08A3E" }}>{expiring.length} article{expiring.length > 1 ? "s" : ""}</span> proche{expiring.length > 1 ? "s" : ""} de la péremption : {expiring.map((p) => `${p.name} (${daysUntil(p.expiryDate) < 0 ? "expiré" : `${daysUntil(p.expiryDate)}j`})`).join(", ")}
          </div>
        </div>
      )}
      {lowStock.length > 0 && (
        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: "#DC4C3C1A", border: "1px solid #DC4C3C55" }}>
          <AlertTriangle size={18} style={{ color: "#DC4C3C" }} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div style={{ color: "#1B1F1C" }} className="text-sm">
              <span className="font-semibold" style={{ color: "#DC4C3C" }}>{lowStock.length} article{lowStock.length > 1 ? "s" : ""}</span> en stock bas : {lowStock.map((p) => p.name).join(", ")}
            </div>
            {isAdmin && (
              <div className="mt-1.5 flex flex-col items-start gap-1">
                <WaAlertButtons
                  phones={alertPhones}
                  label="💬 Alerter par WhatsApp"
                  text={`⚠️ Stock bas — ${lowStock.length} article${lowStock.length > 1 ? "s" : ""} à réapprovisionner :\n` + lowStock.map((p) => `• ${p.name} (${p.stock} ${p.unit} restant${p.stock > 1 ? "s" : ""})`).join("\n")}
                  className="text-xs flex items-center gap-1"
                  style={{ color: "#1B9E52" }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un article…"
          className="flex-1 min-w-0 px-4 py-2.5 rounded-lg outline-none text-sm"
          style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
        />
        {canEdit && (
          <button
            onClick={() => onOpenProduct({})}
            className="hidden md:flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium shrink-0"
            style={{ background: "#C08A3E", color: "#FFFFFF" }}
          >
            <Plus size={16} /> Ajouter un article
          </button>
        )}
      </div>

      {depotsAll.length > 1 && <CategoryChips categories={depotsAll} value={depotFilter} onChange={setDepotFilter} counts={depotCounts} />}
      <CategoryChips categories={cats} value={catFilter} onChange={setCatFilter} counts={counts} />
      {isAdmin && filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs px-1" style={{ color: "#6B6558" }}>
          <span>{catFilter || "Tous les articles"} · {filtered.length} article{filtered.length > 1 ? "s" : ""}</span>
          <span style={{ color: "#C08A3E", fontWeight: 600 }}>Valeur du stock : {fmt(catValue)} FCFA</span>
        </div>
      )}

      <Ledger>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>
            Aucun article. {canEdit ? "Ajoute ton premier produit avec le bouton +." : "Le gérant n'a pas encore ajouté d'articles."}
          </div>
        ) : (
          filtered.map((p, i) => (
            <Row key={p.id} n={i + 1}>
              <button onClick={() => canEdit && onOpenProduct(p)} className="flex-1 flex items-center justify-between text-left">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-md overflow-hidden flex items-center justify-center shrink-0" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                    {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-full h-full object-cover" /> : <Package size={15} style={{ color: "#DCD5C6" }} />}
                  </div>
                  <div className="min-w-0">
                    <div style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} className="text-[15px] flex items-center gap-1.5">
                      {p.name}
                      {p.hasCodes && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#C08A3E22", color: "#C08A3E" }}>🔑 codes</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{p.category}{productMeta(p) ? ` · ${productMeta(p)}` : ""}{depotsAll.length > 1 ? ` · ${depotOf(p)}` : ""}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div style={{ fontFamily: "'Carlito', sans-serif", color: !p.isService && p.stock <= p.threshold ? "#DC4C3C" : "#1B1F1C" }} className="text-sm">
                    {p.isService ? "Prestation" : `${p.stock} ${p.unit}`}
                  </div>
                  <div style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-xs mt-0.5">
                    {fmt(p.price)} FCFA
                  </div>
                </div>
              </button>
            </Row>
          ))
        )}
      </Ledger>

      {!canEdit && (
        <button onClick={onRequestGerant} className="w-full flex items-center justify-center gap-2 text-xs py-2" style={{ color: "#16A34A" }}>
          <Lock size={12} /> Ajout et modification réservés au gérant et au magasinier
        </button>
      )}
    </div>
  );
}

function ProductModal({ product, businessType, categories, depots, canDelete, shopId, onSave, onDelete, onClose }) {
  const isNew = !product?.id;
  const [form, setForm] = useState(
    product || { id: uid(), name: "", category: (categories && categories[0]) || BUSINESS_TYPES[businessType].categories[0], depot: (depots && depots[0]) || "", decimal: false, isService: !!BUSINESS_TYPES[businessType]?.isService, wholesalePrice: "", price: "", stock: "", unit: "u", threshold: 3, hasCodes: false, codes: [] }
  );
  const [newCodesText, setNewCodesText] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const codes = form.codes || [];
  const unusedCount = codes.filter((c) => !c.used).length;
  const usedCount = codes.length - unusedCount;
  const needsRef = isTileCat(form.category);
  const isElectro = isElectroCat(form.category);
  const isElec = isElecCat(form.category);
  const isSanit = isSanitCat(form.category);
  const needsBM = isElectro && !(String(form.brand || "").trim() && String(form.model || "").trim());
  const valid = form.name.trim() && (!needsRef || String(form.reference || "").trim()) && !needsBM && form.price !== "" && (form.hasCodes || form.isService ? true : form.stock !== "");

  const handlePhotoChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError("");
    setPhotoUploading(true);
    try {
      const url = await storage.uploadProductPhoto(file, shopId, form.id);
      const oldUrl = form.photoUrl;
      set("photoUrl", url);
      if (oldUrl && oldUrl !== url) storage.deleteProductPhoto(oldUrl);
    } catch (err) {
      setPhotoError("Envoi de la photo impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = () => {
    const oldUrl = form.photoUrl;
    set("photoUrl", null);
    if (oldUrl) storage.deleteProductPhoto(oldUrl);
  };

  const addCodes = () => {
    const existing = new Set(codes.map((c) => c.code));
    const toAdd = newCodesText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !existing.has(s));
    if (toAdd.length === 0) { setNewCodesText(""); return; }
    const added = toAdd.map((code) => ({ id: uid(), code, used: false }));
    setForm((f) => ({ ...f, codes: [...(f.codes || []), ...added], stock: [...(f.codes || []), ...added].filter((c) => !c.used).length }));
    setNewCodesText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "#00000088" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">{isNew ? "Nouvel article" : "Modifier l'article"}</h3>
          <button onClick={onClose}><X size={20} style={{ color: "#6B6558" }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Nom</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} placeholder="Ex : Vis 4x40, Planche chêne…" />
          </div>

          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Photo (optionnel)</label>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-16 h-16 rounded-lg overflow-hidden flex items-center justify-center shrink-0" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                {form.photoUrl ? (
                  <img src={form.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package size={22} style={{ color: "#DCD5C6" }} />
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs cursor-pointer" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#C08A3E" }}>
                  {photoUploading ? <Loader2 size={13} className="animate-spin" /> : <Package size={13} />}
                  {photoUploading ? "Envoi en cours…" : form.photoUrl ? "Changer la photo" : "Ajouter une photo"}
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} disabled={photoUploading} className="hidden" />
                </label>
                {form.photoUrl && !photoUploading && (
                  <button onClick={removePhoto} className="block text-xs" style={{ color: "#DC4C3C" }}>Retirer la photo</button>
                )}
                {photoError && <p className="text-xs" style={{ color: "#DC4C3C" }}>{photoError}</p>}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Catégorie</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>
              {allCategoriesOf(categories || BUSINESS_TYPES[businessType].categories, form.category ? [{ category: form.category }] : []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Référence {needsRef ? "(obligatoire pour les carreaux)" : "(optionnel)"}</label>
            <input value={form.reference || ""} onChange={(e) => set("reference", e.target.value)} placeholder="Ex. CB-6060-12, beige brillant 60x60" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: `1px solid ${needsRef && !String(form.reference || "").trim() ? "#DC4C3C" : "#DCD5C6"}`, color: "#1B1F1C" }} />
          </div>

          {needsRef && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Format</label>
                <input value={form.tileFormat || ""} onChange={(e) => set("tileFormat", e.target.value)} placeholder="Ex. 60x60" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>m² par carton</label>
                <input type="number" step="0.01" inputMode="decimal" value={form.m2PerBox ?? ""} onChange={(e) => set("m2PerBox", e.target.value)} placeholder="Ex. 1.44" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
              {parseFloat(form.m2PerBox) > 0 && parseFloat(form.stock) > 0 && /carton/i.test(form.unit || "") && (
                <div className="col-span-2 text-xs" style={{ color: "#6B6558" }}>
                  Stock : {form.stock} carton(s) = {(parseFloat(form.stock) * parseFloat(form.m2PerBox)).toFixed(2).replace(".", ",")} m²
                </div>
              )}
            </div>
          )}

          {isElectro && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs" style={{ color: "#6B6558" }}>Marque (obligatoire)</label>
                  <input value={form.brand || ""} onChange={(e) => set("brand", e.target.value)} placeholder="Ex. Hisense" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: `1px solid ${!String(form.brand || "").trim() ? "#DC4C3C" : "#DCD5C6"}`, color: "#1B1F1C" }} />
                </div>
                <div>
                  <label className="text-xs" style={{ color: "#6B6558" }}>Modèle (obligatoire)</label>
                  <input value={form.model || ""} onChange={(e) => set("model", e.target.value)} placeholder="Ex. RS-60" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: `1px solid ${!String(form.model || "").trim() ? "#DC4C3C" : "#DCD5C6"}`, color: "#1B1F1C" }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Numéro de série (optionnel)</label>
                <input value={form.serial || ""} onChange={(e) => set("serial", e.target.value)} placeholder="N° de l'appareil" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
                <div>
                  <label className="text-xs" style={{ color: "#6B6558" }}>Garantie (mois)</label>
                  <input type="number" inputMode="numeric" value={form.warrantyMonths ?? ""} onChange={(e) => set("warrantyMonths", e.target.value)} placeholder="Ex. 12" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
                </div>
              </div>
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Caractéristiques (capacité, puissance, nombre de feux…)</label>
                <input value={form.specs || ""} onChange={(e) => set("specs", e.target.value)} placeholder="Ex. 4 feux gaz, 60 cm" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
            </div>
          )}

          {(isElec || isSanit) && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Marque (optionnel)</label>
                <input value={form.brand || ""} onChange={(e) => set("brand", e.target.value)} placeholder="Ex. Legrand" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>{isElec ? "Calibre / section / puissance" : "Dimensions / diamètre"}</label>
                <input value={form.sizeSpec || ""} onChange={(e) => set("sizeSpec", e.target.value)} placeholder="Ex. 2,5 mm², 16 A, 12 W" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Matière (optionnel)</label>
                <input value={form.material || ""} onChange={(e) => set("material", e.target.value)} placeholder="Ex. PVC, PPR, inox" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
                <div>
                  <label className="text-xs" style={{ color: "#6B6558" }}>Longueur d'un rouleau / d'une barre (m)</label>
                  <input type="number" step="any" inputMode="decimal" value={form.rollLength ?? ""} onChange={(e) => set("rollLength", e.target.value)} placeholder="Ex. 100" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
                </div>
              </div>
              <p className="text-[11px]" style={{ color: "#6B6558" }}>Pour vendre au mètre : coche « Vendu au détail », mets l'unité « m » et le prix au mètre.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Fournisseur (optionnel)</label>
                <input value={form.supplier || ""} onChange={(e) => set("supplier", e.target.value)} placeholder="Ex. Lomé Carrelage" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Emplacement (optionnel)</label>
                <input value={form.location || ""} onChange={(e) => set("location", e.target.value)} placeholder="Ex. Rayon B, étagère 2" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              </div>
          </div>

          {depots && depots.length > 1 && (
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Dépôt / magasin</label>
              <select value={form.depot || depots[0]} onChange={(e) => set("depot", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>
                {allCategoriesOf(depots, form.depot ? [{ category: form.depot }] : []).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Prix de vente (FCFA)</label>
              <input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
            </div>
            {canDelete && (
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Prix d'achat (optionnel)</label>
              <input type="number" value={form.costPrice ?? ""} onChange={(e) => set("costPrice", e.target.value)} placeholder="Pour calculer la marge" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
            </div>
            )}
          </div>

          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Prix de gros (optionnel)</label>
            <input type="number" value={form.wholesalePrice ?? ""} onChange={(e) => set("wholesalePrice", e.target.value)} placeholder="Prix pour les achats en gros" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
          </div>

          <label className="flex items-center gap-2.5 py-1 cursor-pointer select-none">
            <input type="checkbox" checked={!!form.decimal} onChange={(e) => set("decimal", e.target.checked)} className="w-4 h-4" />
            <span className="text-sm" style={{ color: "#1B1F1C" }}>Vendu au détail (quantités avec virgule : 2,5 m, 0,5 kg…)</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Unité</label>
              <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="u, kg, m…" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Code-barres (optionnel)</label>
              <input value={form.barcode || ""} onChange={(e) => set("barcode", e.target.value)} placeholder="Pour le scan" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
            </div>
          </div>

          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Date de péremption (optionnel)</label>
            <input type="date" value={form.expiryDate || ""} onChange={(e) => set("expiryDate", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
          </div>

          <label className="flex items-center gap-2.5 py-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!form.hasCodes}
              onChange={(e) => {
                const hasCodes = e.target.checked;
                setForm((f) => ({ ...f, hasCodes, stock: hasCodes ? (f.codes || []).filter((c) => !c.used).length : f.stock }));
              }}
              className="w-4 h-4"
            />
            <span className="text-sm" style={{ color: "#1B1F1C" }}>Codes uniques (tickets WiFi, cartes prépayées…)</span>
          </label>

          <label className="flex items-center gap-2.5 py-1 cursor-pointer select-none">
            <input type="checkbox" checked={!!form.isService} onChange={(e) => setForm((f) => ({ ...f, isService: e.target.checked, hasCodes: e.target.checked ? false : f.hasCodes }))} className="w-4 h-4" />
            <span className="text-sm" style={{ color: "#1B1F1C" }}>Prestation de service (pas de stock à suivre)</span>
          </label>

          {form.isService ? null : form.hasCodes ? (
            <div className="space-y-2">
              <div className="rounded-lg p-3 flex items-center justify-between text-sm" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                <span style={{ color: "#6B6558" }}>Codes disponibles</span>
                <span style={{ fontFamily: "'Carlito', sans-serif", color: unusedCount === 0 ? "#DC4C3C" : "#16A34A" }}>{unusedCount} dispo · {usedCount} vendus</span>
              </div>
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Ajouter des codes (un par ligne)</label>
                <textarea
                  value={newCodesText}
                  onChange={(e) => setNewCodesText(e.target.value)}
                  placeholder={"EX : WIFI-A1B2\nWIFI-C3D4\nWIFI-E5F6"}
                  rows={4}
                  className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none"
                  style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
                />
                <button
                  onClick={addCodes}
                  disabled={!newCodesText.trim()}
                  className="w-full mt-2 py-2 rounded-md text-sm font-medium disabled:opacity-40"
                  style={{ background: "#C08A3E", color: "#FFFFFF" }}
                >
                  Ajouter ces codes au stock
                </button>
              </div>
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Seuil d'alerte (codes restants)</label>
                <input type="number" value={form.threshold} onChange={(e) => set("threshold", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Quantité en stock</label>
                <input type="number" step={form.decimal ? "any" : undefined} value={form.stock} onChange={(e) => set("stock", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
              </div>
              <div>
                <label className="text-xs" style={{ color: "#6B6558" }}>Seuil d'alerte</label>
                <input type="number" value={form.threshold} onChange={(e) => set("threshold", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          {!isNew && canDelete && (
            <button onClick={() => onDelete(form.id)} className="px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm" style={{ background: "#DC4C3C1A", color: "#DC4C3C", border: "1px solid #DC4C3C55" }}>
              <Trash2 size={16} /> Supprimer
            </button>
          )}
          <button
            disabled={!valid}
            onClick={() => onSave({ ...form, warrantyMonths: form.warrantyMonths === "" || form.warrantyMonths == null ? null : parseInt(form.warrantyMonths) || null, rollLength: form.rollLength === "" || form.rollLength == null ? null : parseFloat(form.rollLength) || null, m2PerBox: form.m2PerBox === "" || form.m2PerBox == null ? null : parseFloat(form.m2PerBox) || null, price: parseFloat(form.price) || 0, costPrice: form.costPrice === "" || form.costPrice == null ? null : parseFloat(form.costPrice) || 0, stock: form.isService ? 999999 : form.hasCodes ? unusedCount : (form.decimal ? round3(parseFloat(form.stock) || 0) : (parseInt(form.stock) || 0)), wholesalePrice: form.wholesalePrice === "" || form.wholesalePrice == null ? null : parseFloat(form.wholesalePrice) || null, depot: form.depot || (depots && depots[0]) || "", threshold: form.isService ? 0 : form.decimal ? (parseFloat(form.threshold) || 0) : (parseInt(form.threshold) || 0), unit: form.hasCodes ? "code" : form.unit })}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "#C08A3E", color: "#F0ECE3" }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Vente ---------- */
/* ---------- Ticket de caisse ---------- */
/* ---------- Champs propres à chaque famille d'articles ---------- */
const isTileCat = (c) => /carreau/i.test(c || "");
const isElectroCat = (c) => /[ée]lectrom[ée]nager/i.test(c || "");
const isElecCat = (c) => /[ée]lectricit[ée]/i.test(c || "");
const isSanitCat = (c) => /sanitaire|plomberie/i.test(c || "");
const productMeta = (p) => {
  const parts = [];
  const bm = [p.brand, p.model].filter(Boolean).join(" ");
  if (bm) parts.push(bm);
  if (p.reference) parts.push(`Réf. ${p.reference}`);
  if (p.tileFormat) parts.push(p.tileFormat);
  if (p.m2PerBox) parts.push(`${String(p.m2PerBox).replace(".", ",")} m²/carton`);
  if (p.sizeSpec) parts.push(p.sizeSpec);
  if (p.material) parts.push(p.material);
  if (p.rollLength) parts.push(`${String(p.rollLength).replace(".", ",")} m/rouleau`);
  if (p.warrantyMonths) parts.push(`garantie ${p.warrantyMonths} mois`);
  if (p.location) parts.push(`📍 ${p.location}`);
  return parts.join(" · ");
};
const productSearchText = (p) => [p.name, p.reference, p.brand, p.model, p.serial, p.supplier, p.sizeSpec].filter(Boolean).join(" ").toLowerCase();
const addMonthsFr = (ts, m) => { const d = new Date(ts); d.setMonth(d.getMonth() + (parseInt(m) || 0)); return d.toLocaleDateString("fr-FR"); };

function ReceiptModal({ receipt, onClose, format = "58mm" }) {
  const { shopName, businessTypeLabel, items, total, date, cashierName, clientName, clientPhone, paymentMethod } = receipt;
  const d = new Date(date);
  const sendToClient = () => {
    const lines = [
      `🧾 ${shopName || "Ticket de caisse"}`,
      `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
      "",
      ...items.map((i) => `${i.qty}× ${i.name} — ${fmt(i.qty * i.price)} FCFA${i.codes && i.codes.length ? ` (code${i.codes.length > 1 ? "s" : ""} : ${i.codes.join(", ")})` : ""}`),
      "",
      `Total : ${fmt(total)} FCFA`,
      paymentMethod ? `Paiement : ${paymentLabel(paymentMethod)}` : null,
      "",
      "Merci de votre confiance !",
    ].filter((l) => l !== null).join("\n");
    window.open(`https://wa.me/${waPhone(clientPhone)}?text=${encodeURIComponent(lines)}`, "_blank");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .mte-receipt, .mte-receipt * { visibility: visible; }
          .mte-receipt { position: fixed; inset: 0; margin: auto; }
          .mte-receipt .no-print { display: none !important; }
          ${receiptPrintCss(format)}
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mte-receipt w-full max-w-xs rounded-xl p-5 space-y-3"
        style={{ background: "#EDE6D6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
      >
        <div className="text-center space-y-0.5">
          <p className="text-base font-semibold" style={{ fontFamily: "'Carlito', sans-serif" }}>{shopName || "Mon commerce"}</p>
          <p className="text-[11px]">{businessTypeLabel}</p>
        </div>
        <div className="border-t border-dashed pt-2 text-[11px] flex items-center justify-between" style={{ borderColor: "#1B1F1C55" }}>
          <span>{d.toLocaleDateString("fr-FR")}</span>
          <span>{d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="border-t border-dashed pt-2 space-y-1.5" style={{ borderColor: "#1B1F1C55" }}>
          {items.map((i) => (
            <div key={i.id} className="text-[12px]">
              <div className="flex items-center justify-between">
                <span>{i.name}</span>
                <span>{fmt(i.qty * i.price)} FCFA</span>
              </div>
              <div className="text-[10px] opacity-70">{i.qty} × {fmt(i.price)} FCFA</div>
              {(i.brandModel || i.reference) && <div className="text-[10px] opacity-70">{[i.brandModel, i.reference ? `Réf. ${i.reference}` : ""].filter(Boolean).join(" · ")}</div>}
              {i.serial && <div className="text-[10px] opacity-70">N° série : {i.serial}</div>}
              {i.warrantyMonths > 0 && <div className="text-[10px] font-semibold">Garantie {i.warrantyMonths} mois (jusqu'au {addMonthsFr(date, i.warrantyMonths)})</div>}
              {i.codes && i.codes.length > 0 && (
                <div className="text-[11px] mt-0.5 font-semibold">Code{i.codes.length > 1 ? "s" : ""} : {i.codes.join(", ")}</div>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-dashed pt-2 flex items-center justify-between" style={{ borderColor: "#1B1F1C55" }}>
          <span className="text-sm font-semibold">Total</span>
          <span className="text-base font-semibold">{fmt(total)} FCFA</span>
        </div>
        <div className="border-t border-dashed pt-2 text-[11px] text-center" style={{ borderColor: "#1B1F1C55" }}>
          Servi par : {cashierName}
          {clientName && <><br />Client : {clientName}</>}
          {paymentMethod && <><br />Paiement : {paymentLabel(paymentMethod)}</>}
        </div>
        <p className="text-[9px] text-center opacity-60 pt-1">Merci de votre confiance</p>

        {clientPhone && (
          <button onClick={sendToClient} className="no-print w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2" style={{ background: "#25D36622", color: "#1B9E52", border: "1px solid #25D36655" }}>
            <Send size={15} /> Envoyer ce ticket au client par WhatsApp
          </button>
        )}

        <div className="flex gap-2 pt-2 no-print" style={{ colorScheme: "light" }}>
          <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "#1B1F1C", color: "#EDE6D6" }}>
            Imprimer le ticket
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-medium" style={{ background: "#37403A22", border: "1px solid #1B1F1C33", color: "#1B1F1C" }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Clients ---------- */
function ClientDetail({ client, sales, isAdmin, onUpdate, onRemove, onClose, onRecordPayment, loyaltyRate }) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone || "");
  const [notes, setNotes] = useState(client.notes || "");
  const [confirming, setConfirming] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState("");

  const purchases = sales.filter((s) => s.clientId === client.id).sort((a, b) => b.date - a.date);
  const totalSpent = purchases.reduce((s, p) => s + p.total, 0);
  const debt = client.creditBalance || 0;
  const points = loyaltyRate > 0 ? Math.floor(totalSpent / loyaltyRate) : 0;
  const reviews = client.reviews || [];
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const save = () => {
    onUpdate(client.id, { name: name.trim() || client.name, phone: phone.trim(), notes: notes.trim() });
    onClose();
  };

  const repay = () => {
    const amount = parseFloat(repayAmount);
    if (!amount || amount <= 0) return;
    onRecordPayment(client.id, Math.min(amount, debt));
    setRepayAmount("");
  };

  const addReview = () => {
    if (!newRating) return;
    const review = { id: uid(), rating: newRating, comment: newComment.trim(), date: Date.now() };
    onUpdate(client.id, { reviews: [...reviews, review] });
    setNewRating(0);
    setNewComment("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "#00000099" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Fiche client</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#6B6558" }} /></button>
        </div>

        {isAdmin ? (
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Téléphone" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optionnel)" rows={2} className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
            <button onClick={save} className="w-full py-2 rounded-md text-sm font-medium" style={{ background: "#C08A3E", color: "#FFFFFF" }}>Enregistrer</button>
          </div>
        ) : (
          <div>
            <p style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-base">{client.name}</p>
            {client.phone && <p className="text-sm mt-0.5 flex items-center gap-1.5" style={{ color: "#6B6558" }}><Phone size={12} /> {client.phone}</p>}
          </div>
        )}

        <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#C08A3E1A" }}>
          <span className="text-sm" style={{ color: "#1B1F1C" }}>Total dépensé</span>
          <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-lg">{fmt(totalSpent)} FCFA</span>
        </div>

        {loyaltyRate > 0 && (
          <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#16A34A1A" }}>
            <span className="text-sm" style={{ color: "#1B1F1C" }}>Points de fidélité</span>
            <span style={{ fontFamily: "'Carlito', sans-serif", color: "#16A34A" }} className="text-lg">{points} pt{points > 1 ? "s" : ""}</span>
          </div>
        )}

        <div className="rounded-lg p-3 space-y-2" style={{ background: debt > 0 ? "#DC4C3C1A" : "#F0ECE3", border: `1px solid ${debt > 0 ? "#DC4C3C55" : "#DCD5C6"}` }}>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "#1B1F1C" }}>Dette (vente à crédit)</span>
            <span style={{ fontFamily: "'Carlito', sans-serif", color: debt > 0 ? "#DC4C3C" : "#6B6558" }} className="text-lg">{fmt(debt)} FCFA</span>
          </div>
          {isAdmin && debt > 0 && (
            <div className="flex gap-2">
              <input
                type="number"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                placeholder="Montant remboursé"
                className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
              />
              <button onClick={repay} disabled={!repayAmount} className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40" style={{ background: "#16A34A", color: "#FFFFFF" }}>
                Enregistrer
              </button>
            </div>
          )}
        </div>

        <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-1.5" style={{ color: "#1B1F1C" }}><Star size={14} style={{ color: "#C08A3E" }} /> Avis / satisfaction</span>
            {reviews.length > 0 && (
              <span className="text-sm" style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }}>{avgRating.toFixed(1)} / 5 ({reviews.length})</span>
            )}
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setNewRating(n)}>
                    <Star size={20} style={{ color: n <= newRating ? "#C08A3E" : "#DCD5C6" }} fill={n <= newRating ? "#C08A3E" : "none"} />
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Commentaire (optionnel)" className="flex-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
                <button onClick={addReview} disabled={!newRating} className="px-3 py-2 rounded-md text-sm font-medium disabled:opacity-40" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
                  Ajouter
                </button>
              </div>
              <p className="text-[10px]" style={{ color: "#6B6558" }}>Noté par le personnel après un échange avec le client — le client ne reçoit rien automatiquement.</p>
            </div>
          )}
          {reviews.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {[...reviews].reverse().slice(0, 3).map((r) => (
                <div key={r.id} className="text-xs" style={{ color: "#6B6558" }}>
                  {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} {r.comment && `— ${r.comment}`}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6B6558" }}>Historique d'achats ({purchases.length})</p>
          <div className="space-y-2">
            {purchases.length === 0 && <p className="text-xs" style={{ color: "#6B6558" }}>Aucun achat enregistré pour ce client.</p>}
            {purchases.map((s) => (
              <div key={s.id} className="p-2.5 rounded-lg text-sm" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                <div className="flex items-center justify-between">
                  <span style={{ color: "#1B1F1C" }}>{new Date(s.date).toLocaleDateString("fr-FR")}</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }}>{fmt(s.total)} FCFA</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{s.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
                {s.paymentMethod && <p className="text-[10px] mt-0.5" style={{ color: s.paymentMethod === "credit" ? "#DC4C3C" : "#16A34A" }}>{paymentLabel(s.paymentMethod)}</p>}
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          confirming ? (
            <div className="flex gap-2">
              <button onClick={() => { onRemove(client.id); onClose(); }} className="flex-1 py-2 rounded-md text-sm font-medium" style={{ background: "#DC4C3C", color: "#FFFFFF" }}>Confirmer la suppression</button>
              <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded-md text-sm" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>Annuler</button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} className="text-xs" style={{ color: "#DC4C3C" }}>Supprimer ce client</button>
          )
        )}
      </div>
    </div>
  );
}

function ClientsTab({ shopName, clients, sales, isAdmin, onAddClient, onUpdateClient, onRemoveClient, onRecordPayment, loyaltyRate }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [openClient, setOpenClient] = useState(null);
  const [query, setQuery] = useState("");

  const spentByClient = useMemo(() => {
    const map = {};
    sales.forEach((s) => { if (s.clientId) map[s.clientId] = (map[s.clientId] || 0) + s.total; });
    return map;
  }, [sales]);

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  const createClient = () => {
    if (!newName.trim()) return;
    onAddClient({ id: uid(), name: newName.trim(), phone: newPhone.trim(), notes: "", createdAt: Date.now() });
    setNewName("");
    setNewPhone("");
    setAdding(false);
  };

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un client..."
          className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
        />
        <button onClick={() => setAdding(true)} className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
          <Plus size={18} />
        </button>
      </div>

      {adding && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du client" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
          <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Téléphone (optionnel)" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
          <div className="flex gap-2">
            <button disabled={!newName.trim()} onClick={createClient} className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40" style={{ background: "#C08A3E", color: "#FFFFFF" }}>Ajouter</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-md text-sm" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>Annuler</button>
          </div>
        </div>
      )}

      <Ledger>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#6B6558" }}>
            {clients.length === 0 ? "Aucun client enregistré pour l'instant." : "Aucun client ne correspond à cette recherche."}
          </div>
        ) : (
          filtered.map((c, i) => (
            <Row key={c.id} n={i + 1}>
              <button onClick={() => setOpenClient(c)} className="flex-1 flex items-center justify-between text-left">
                <div>
                  <div style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} className="text-[15px]">{c.name}</div>
                  {c.phone && <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{c.phone}</div>}
                  {c.creditBalance > 0 && (
                    <div className="text-[10px] mt-0.5 font-semibold" style={{ color: "#DC4C3C" }}>Doit {fmt(c.creditBalance)} FCFA</div>
                  )}
                </div>
                <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-sm">{fmt(spentByClient[c.id] || 0)} FCFA</span>
              </button>
              {isAdmin && c.creditBalance > 0 && c.phone && (
                <button
                  onClick={() => {
                    const msg = `Bonjour ${c.name}, petit rappel amical : votre solde à régler chez ${shopName || "nous"} est de ${fmt(c.creditBalance)} FCFA. Merci de passer le régler dès que possible. 🙏`;
                    window.open(`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                  className="shrink-0 text-[11px] px-2 py-1 rounded-full"
                  style={{ background: "#16A34A1A", color: "#16A34A" }}
                >
                  💬 Rappel
                </button>
              )}
            </Row>
          ))
        )}
      </Ledger>

      {openClient && (
        <ClientDetail
          client={clients.find((c) => c.id === openClient.id) || openClient}
          sales={sales}
          isAdmin={isAdmin}
          onUpdate={onUpdateClient}
          onRemove={onRemoveClient}
          onClose={() => setOpenClient(null)}
          onRecordPayment={onRecordPayment}
          loyaltyRate={loyaltyRate}
        />
      )}
    </div>
  );
}

/* ---------- Scanner code-barres ----------
   Utilise l'API native BarcodeDetector (disponible sur Chrome Android récent).
   Si le téléphone/navigateur ne la supporte pas, on propose simplement une
   saisie manuelle du code à la place — jamais de blocage complet.
------------------------------------------------------------------- */
function BarcodeScannerModal({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let stream = null;
    let raf = null;
    let stopped = false;

    const run = async () => {
      if (!("BarcodeDetector" in window)) {
        setSupported(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector();
        const loop = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              onDetect(codes[0].rawValue);
              return;
            }
          } catch (e) {}
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        setError("Impossible d'accéder à la caméra. Vérifie les autorisations, ou saisis le code manuellement.");
      }
    };
    run();

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#000000dd" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl p-5 space-y-3" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg flex items-center gap-2"><ScanLine size={18} style={{ color: "#C08A3E" }} /> Scanner un code-barres</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#6B6558" }} /></button>
        </div>

        {supported ? (
          <div className="rounded-lg overflow-hidden" style={{ background: "#000", aspectRatio: "4/3" }}>
            <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
          </div>
        ) : (
          <p className="text-xs" style={{ color: "#6B6558" }}>Ton navigateur ne supporte pas le scan automatique. Saisis le code manuellement ci-dessous.</p>
        )}
        {error && <p className="text-xs" style={{ color: "#DC4C3C" }}>{error}</p>}

        <div className="flex gap-2 pt-1">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Saisir le code manuellement"
            className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
            style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
          />
          <button
            disabled={!manual.trim()}
            onClick={() => onDetect(manual.trim())}
            className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40"
            style={{ background: "#C08A3E", color: "#FFFFFF" }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function VenteTab({ categories, products, cart, setCart, onValidate, clients, onAddClient, fedapayKey, shopName }) {
  const [clientId, setClientId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("especes");
  const [payingOnline, setPayingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [creditError, setCreditError] = useState("");

  const stepOf = (i) => (i.decimal ? 0.5 : 1);
  const add = (p) => setCart((c) => {
    const existing = c.find((i) => i.id === p.id);
    if (existing) {
      if (existing.qty >= p.stock) return c;
      return c.map((i) => (i.id === p.id ? { ...i, qty: round3(Math.min(p.stock, i.qty + stepOf(i))) } : i));
    }
    return p.stock > 0 ? [...c, { id: p.id, name: p.name, price: p.price, unit: p.unit, qty: 1, decimal: !!p.decimal, m2PerBox: p.m2PerBox || null, warrantyMonths: p.warrantyMonths || null, brandModel: [p.brand, p.model].filter(Boolean).join(" ") || null, serial: p.serial || null, reference: p.reference || null, priceRetail: p.price, priceWholesale: p.wholesalePrice || null, mode: "detail" }] : c;
  });
  const dec = (id) => setCart((c) => c.map((i) => (i.id === id ? { ...i, qty: round3(i.qty - stepOf(i)) } : i)).filter((i) => i.qty > 0));
  const inc = (id) => setCart((c) => {
    const product = products.find((p) => p.id === id);
    if (!product) return c;
    return c.map((i) => (i.id === id ? { ...i, qty: i.qty < product.stock ? round3(Math.min(product.stock, i.qty + stepOf(i))) : i.qty } : i));
  });
  const setQty = (id, raw) => setCart((c) => {
    const product = products.find((p) => p.id === id);
    const v = round3(parseFloat(String(raw).replace(",", ".")));
    if (!product || !(v > 0)) return c.filter((i) => i.id !== id);
    return c.map((i) => (i.id === id ? { ...i, qty: Math.min(product.stock, v) } : i));
  });
  const toggleMode = (id) => setCart((c) => c.map((i) => {
    if (i.id !== id || !i.priceWholesale) return i;
    const gros = i.mode !== "gros";
    return { ...i, mode: gros ? "gros" : "detail", price: gros ? i.priceWholesale : i.priceRetail };
  }));
  const total = Math.round(cart.reduce((s, i) => s + i.qty * i.price, 0));
  const selectedClient = clients.find((c) => c.id === clientId) || null;

  const createAndSelectClient = () => {
    if (!newClientName.trim()) return;
    const client = { id: uid(), name: newClientName.trim(), phone: newClientPhone.trim(), notes: "", createdAt: Date.now() };
    onAddClient(client);
    setClientId(client.id);
    setNewClientName("");
    setNewClientPhone("");
    setPickerOpen(false);
  };

  const finishSale = (method) => {
    onValidate(cart, total, clientId, method);
    setClientId(null);
    setPaymentMethod("especes");
  };

  const startOnlinePayment = () => {
    setOnlineError("");
    if (!fedapayKey) {
      setOnlineError("Le paiement en ligne n'est pas encore activé pour ce commerce. Le gérant doit d'abord renseigner sa clé FedaPay dans Réglages → Paiement en ligne.");
      return;
    }
    setPayingOnline(true);
    loadFedaPayScript(
      () => {
        try {
          window.FedaPay.init({
            public_key: fedapayKey,
            transaction: {
              amount: total,
              description: `Vente — ${shopName || "KABATEC Consulting"}`,
            },
            customer: selectedClient ? {
              firstname: selectedClient.name,
              phone_number: { number: selectedClient.phone || "", country: "tg" },
            } : undefined,
            onComplete: (resp) => {
              setPayingOnline(false);
              const ok = window.FedaPay && resp && resp.reason === window.FedaPay.CHECKOUT_COMPLETED;
              if (ok) {
                finishSale("en_ligne");
              } else {
                setOnlineError("Le paiement a été annulé ou n'a pas abouti. Aucune vente n'a été enregistrée.");
              }
            },
          }).open();
        } catch (e) {
          setPayingOnline(false);
          setOnlineError("Impossible d'ouvrir le paiement en ligne. Vérifie la connexion internet et la clé FedaPay.");
        }
      },
      () => {
        setPayingOnline(false);
        setOnlineError("Impossible de charger le module de paiement en ligne (vérifie la connexion internet).");
      }
    );
  };

  const handleValidate = () => {
    setCreditError("");
    if (paymentMethod === "credit" && !clientId) {
      setCreditError("Choisis un client avant de vendre à crédit — il faut savoir qui doit l'argent.");
      return;
    }
    if (paymentMethod === "en_ligne") {
      startOnlinePayment();
      return;
    }
    finishSale(paymentMethod);
  };

  const [query, setQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const cats = allCategoriesOf(categories || [], products);
  const visibleProducts = products.filter((p) => productSearchText(p).includes(query.toLowerCase()) && (!catFilter || p.category === catFilter));

  const handleScanned = (code) => {
    setScannerOpen(false);
    const match = products.find((p) => p.barcode && p.barcode === code);
    if (match) {
      add(match);
      setScanMsg(`✓ ${match.name} ajouté au panier.`);
    } else {
      setScanMsg(`Aucun article ne correspond au code "${code}".`);
    }
    setTimeout(() => setScanMsg(""), 3000);
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un article…"
          className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
          style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
        />
        <button onClick={() => setScannerOpen(true)} className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#C08A3E22", color: "#C08A3E", border: "1px solid #C08A3E55" }}>
          <ScanLine size={18} />
        </button>
      </div>
      <CategoryChips categories={cats} value={catFilter} onChange={setCatFilter} />
      {scanMsg && <p className="text-xs text-center" style={{ color: "#16A34A" }}>{scanMsg}</p>}

      <Ledger>
        {products.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>Le gérant n'a pas encore ajouté d'articles.</div>
        ) : visibleProducts.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>Aucun article ne correspond à cette recherche.</div>
        ) : (
          visibleProducts.map((p, i) => (
            <Row key={p.id} n={i + 1}>
              <button onClick={() => add(p)} disabled={p.stock === 0} className="flex-1 flex items-center justify-between text-left disabled:opacity-30">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-md overflow-hidden flex items-center justify-center shrink-0" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                    {p.photoUrl ? <img src={p.photoUrl} alt="" className="w-full h-full object-cover" /> : <Package size={15} style={{ color: "#DCD5C6" }} />}
                  </div>
                  <div className="min-w-0">
                    <div style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} className="text-[15px]">{p.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{productMeta(p) ? `${productMeta(p)} · ` : ""}{p.isService ? "Prestation" : `${p.stock} ${p.unit} dispo`}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-sm">{fmt(p.price)} FCFA</span>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "#C08A3E22", color: "#C08A3E" }}><Plus size={14} /></span>
                </div>
              </button>
            </Row>
          ))
        )}
      </Ledger>

      {cart.length > 0 && (
        <div className="fixed bottom-16 md:bottom-4 left-0 right-0 mx-auto max-w-lg px-4">
          <div className="rounded-xl p-4 space-y-2" style={{ background: "#FFFFFF", border: "1px solid #C08A3E55", boxShadow: "0 -8px 24px #00000055" }}>
            {cart.map((i) => (
              <React.Fragment key={i.id}>
              <div className="flex items-center justify-between text-sm gap-2">
                <div className="min-w-0">
                  <span style={{ color: "#1B1F1C" }} className="block truncate">{i.name}</span>
                  <span className="text-[11px] flex items-center gap-1.5" style={{ color: "#6B6558" }}>
                    {fmt(i.price)} FCFA{i.unit && i.unit !== "u" ? ` / ${i.unit}` : ""}
                    {i.priceWholesale ? (
                      <button onClick={() => toggleMode(i.id)} className="px-1.5 py-0.5 rounded-full text-[10px]" style={{ background: i.mode === "gros" ? "#16A34A22" : "#F0ECE3", color: i.mode === "gros" ? "#16A34A" : "#6B6558", border: "1px solid #DCD5C6" }}>
                        {i.mode === "gros" ? "Gros" : "Détail"}
                      </button>
                    ) : null}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => dec(i.id)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#DCD5C6", color: "#1B1F1C" }}><Minus size={12} /></button>
                  {i.decimal ? (
                    <input
                      key={`${i.id}:${i.qty}`}
                      type="number"
                      step="any"
                      defaultValue={i.qty}
                      onBlur={(e) => setQty(i.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                      className="w-14 text-center rounded-md outline-none py-0.5"
                      style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C", background: "#F0ECE3", border: "1px solid #DCD5C6" }}
                    />
                  ) : (
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="w-5 text-center">{i.qty}</span>
                  )}
                  <button onClick={() => inc(i.id)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#DCD5C6", color: "#1B1F1C" }}><Plus size={12} /></button>
                </div>
              </div>
              {i.m2PerBox > 0 && !i.decimal && (
                <div className="flex items-center justify-between gap-2 text-[11px] -mt-1 pl-1" style={{ color: "#6B6558" }}>
                  <span className="flex items-center gap-1.5">
                    Surface à couvrir
                    <input
                      type="number"
                      step="any"
                      inputMode="decimal"
                      placeholder="m²"
                      onBlur={(e) => { if (e.target.value) { setQty(i.id, Math.ceil(parseFloat(String(e.target.value).replace(",", ".")) / i.m2PerBox - 1e-9)); e.target.value = ""; } }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                      className="w-16 text-center rounded-md outline-none py-0.5"
                      style={{ color: "#1B1F1C", background: "#F0ECE3", border: "1px solid #DCD5C6" }}
                    />
                    m²
                  </span>
                  <span>{i.qty} carton{i.qty > 1 ? "s" : ""} = {(i.qty * i.m2PerBox).toFixed(2).replace(".", ",")} m²</span>
                </div>
              )}
              </React.Fragment>
            ))}

            <button onClick={() => setPickerOpen(true)} className="w-full flex items-center justify-between py-1.5 text-sm" style={{ color: "#6B6558" }}>
              <span className="flex items-center gap-1.5"><Users size={13} /> Client</span>
              <span style={{ color: selectedClient ? "#C08A3E" : "#6B6558" }}>{selectedClient ? selectedClient.name : "Anonyme ›"}</span>
            </button>

            <div className="pt-2 border-t" style={{ borderColor: "#DCD5C6" }}>
              <p className="text-xs mb-1.5" style={{ color: "#6B6558" }}>Moyen de paiement</p>
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon;
                  const active = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setPaymentMethod(m.id); setOnlineError(""); setCreditError(""); }}
                      className="flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] leading-tight"
                      style={{ background: active ? "#C08A3E22" : "#F0ECE3", border: `1px solid ${active ? "#C08A3E" : "#DCD5C6"}`, color: active ? "#C08A3E" : "#6B6558" }}
                    >
                      <Icon size={15} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              {paymentMethod === "en_ligne" && !fedapayKey && (
                <p className="text-[10px] mt-1.5" style={{ color: "#DC4C3C" }}>Paiement en ligne non configuré pour ce commerce.</p>
              )}
              {paymentMethod === "credit" && (
                <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Le montant sera ajouté à la dette du client choisi ci-dessus.</p>
              )}
              {onlineError && (
                <p className="text-[10px] mt-1.5" style={{ color: "#DC4C3C" }}>{onlineError}</p>
              )}
              {creditError && (
                <p className="text-[10px] mt-1.5" style={{ color: "#DC4C3C" }}>{creditError}</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#DCD5C6" }}>
              <span style={{ color: "#6B6558" }} className="text-sm">Total</span>
              <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-xl">{fmt(total)} FCFA</span>
            </div>
            <button
              onClick={handleValidate}
              disabled={payingOnline}
              className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "#16A34A", color: "#F0ECE3" }}
            >
              {payingOnline ? (<><Loader2 size={16} className="animate-spin" /> Paiement en cours…</>) : paymentMethod === "en_ligne" ? (<><Globe size={16} /> Payer en ligne</>) : (<><Check size={16} /> Valider la vente</>)}
            </button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "#00000099" }} onClick={() => setPickerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 space-y-3" style={{ background: "#FFFFFF" }}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Choisir un client</h3>
              <button onClick={() => setPickerOpen(false)}><X size={18} style={{ color: "#6B6558" }} /></button>
            </div>
            <button
              onClick={() => { setClientId(null); setPickerOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm"
              style={{ background: !clientId ? "#C08A3E1A" : "#F0ECE3", color: !clientId ? "#C08A3E" : "#1B1F1C" }}
            >
              Anonyme (pas de client)
            </button>
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => { setClientId(c.id); setPickerOpen(false); }}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between"
                style={{ background: clientId === c.id ? "#C08A3E1A" : "#F0ECE3", color: clientId === c.id ? "#C08A3E" : "#1B1F1C" }}
              >
                <span>{c.name}</span>
                {c.phone && <span className="text-xs" style={{ color: "#6B6558" }}>{c.phone}</span>}
              </button>
            ))}
            <div className="pt-2 border-t space-y-2" style={{ borderColor: "#DCD5C6" }}>
              <p className="text-xs" style={{ color: "#6B6558" }}>Nouveau client</p>
              <input value={newClientName} onChange={(e) => setNewClientName(e.target.value)} placeholder="Nom" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              <input value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} placeholder="Téléphone (optionnel)" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              <button
                disabled={!newClientName.trim()}
                onClick={createAndSelectClient}
                className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-40"
                style={{ background: "#C08A3E", color: "#FFFFFF" }}
              >
                Ajouter et sélectionner
              </button>
            </div>
          </div>
        </div>
      )}

      {scannerOpen && <BarcodeScannerModal onDetect={handleScanned} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}

/* ---------- Inventaire ---------- */
function InventaireTab({ products: allProducts, isAdmin, onRequestGerant, onValidateInventory }) {
  const [counts, setCounts] = useState({});
  const [started, setStarted] = useState(false);
  // Les articles à codes uniques (tickets WiFi...) ne se comptent pas physiquement :
  // leur stock vient du nombre de codes non utilisés, géré depuis la fiche article.
  const products = allProducts.filter((p) => !p.hasCodes);
  const codesProductsCount = allProducts.length - products.length;

  const begin = () => {
    const init = {};
    products.forEach((p) => (init[p.id] = String(p.stock)));
    setCounts(init);
    setStarted(true);
  };

  if (!isAdmin) {
    return (
      <div className="py-14 text-center space-y-3">
        <Lock size={22} style={{ color: "#16A34A" }} className="mx-auto" />
        <p className="text-sm" style={{ color: "#6B6558" }}>L'inventaire est réservé au gérant.</p>
        <button onClick={onRequestGerant} className="text-sm px-4 py-2 rounded-lg" style={{ background: "#C08A3E22", color: "#C08A3E" }}>Se connecter en gérant</button>
      </div>
    );
  }

  if (products.length === 0) {
    return <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>Ajoute des articles avant de faire un inventaire.</div>;
  }

  if (!started) {
    return (
      <div className="py-10 text-center space-y-3">
        <ClipboardList size={24} style={{ color: "#C08A3E" }} className="mx-auto" />
        <p className="text-sm" style={{ color: "#6B6558" }}>Compte chaque article physiquement, puis saisis la quantité réelle trouvée.</p>
        {codesProductsCount > 0 && (
          <p className="text-xs" style={{ color: "#6B6558" }}>({codesProductsCount} article{codesProductsCount > 1 ? "s" : ""} à codes uniques exclu{codesProductsCount > 1 ? "s" : ""} — leur stock se gère depuis leur fiche.)</p>
        )}
        <button onClick={begin} disabled={products.length === 0} className="text-sm px-5 py-2.5 rounded-lg disabled:opacity-40" style={{ background: "#C08A3E", color: "#F0ECE3" }}>Commencer l'inventaire</button>
      </div>
    );
  }

  const diffs = products.map((p) => {
    const counted = counts[p.id] === "" ? 0 : (p.decimal ? round3(parseFloat(counts[p.id] ?? p.stock) || 0) : (parseInt(counts[p.id] ?? p.stock) || 0));
    return { ...p, counted, diff: round3(counted - p.stock) };
  });
  const changed = diffs.filter((d) => d.diff !== 0);

  return (
    <div className="space-y-4 pb-6">
      <Ledger>
        {diffs.map((p, i) => (
          <Row key={p.id} n={i + 1}>
            <div className="flex-1 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} className="text-[15px] truncate">{p.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>Enregistré : {p.stock} {p.unit}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  step="any"
                  value={counts[p.id] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                  className="w-16 px-2 py-1.5 rounded-md text-sm text-right outline-none"
                  style={{ background: "#F0ECE3", border: `1px solid ${p.diff !== 0 ? "#C08A3E" : "#DCD5C6"}`, color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
                />
                {p.diff !== 0 && (
                  <span className="text-xs w-10 text-right" style={{ fontFamily: "'Carlito', sans-serif", color: p.diff > 0 ? "#16A34A" : "#DC4C3C" }}>
                    {p.diff > 0 ? "+" : ""}{p.diff}
                  </span>
                )}
              </div>
            </div>
          </Row>
        ))}
      </Ledger>

      <div className="rounded-lg p-3 text-sm" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#6B6558" }}>
        {changed.length === 0 ? "Aucun écart pour l'instant." : `${changed.length} article${changed.length > 1 ? "s" : ""} avec écart.`}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setStarted(false)} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>Annuler</button>
        <button
          onClick={() => { onValidateInventory(diffs); setStarted(false); }}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: "#16A34A", color: "#F0ECE3" }}
        >
          Valider l'inventaire
        </button>
      </div>
    </div>
  );
}

/* ---------- Historique ---------- */
function HistoriqueTab({ sales }) {
  const byDay = useMemo(() => {
    const groups = {};
    [...sales].sort((a, b) => b.date - a.date).forEach((s) => {
      const d = new Date(s.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      (groups[d] ||= []).push(s);
    });
    return groups;
  }, [sales]);

  const exportCsv = () => {
    const header = ["Date", "Heure", "Vendeur", "Articles", "Total", "Paiement", "Codes vendus"];
    const rows = [...sales].sort((a, b) => a.date - b.date).map((s) => {
      const d = new Date(s.date);
      const articles = s.items.map((it) => `${it.qty}x ${it.name}`).join(" | ");
      const codes = s.items.filter((it) => it.codes && it.codes.length).map((it) => it.codes.join(", ")).join(" | ");
      return [
        d.toLocaleDateString("fr-FR"),
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        s.sellerName,
        articles,
        s.total,
        paymentLabel(s.paymentMethod),
        codes,
      ];
    });
    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(escape).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (sales.length === 0) {
    return <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>Aucune vente enregistrée pour l'instant.</div>;
  }

  return (
    <div className="space-y-5">
      <button
        onClick={exportCsv}
        className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
        style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#C08A3E" }}
      >
        <Receipt size={15} /> Exporter les ventes en CSV
      </button>
      {Object.entries(byDay).map(([day, list]) => {
        const dayTotal = list.reduce((s, v) => s + v.total, 0);
        return (
          <div key={day}>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs uppercase tracking-wide" style={{ color: "#16A34A" }}>{day}</span>
              <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-xs">{fmt(dayTotal)} FCFA</span>
            </div>
            <Ledger>
              {list.map((s, i) => (
                <Row key={s.id} n={i + 1}>
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <div style={{ color: "#1B1F1C" }} className="text-sm">{s.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{new Date(s.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {s.sellerName} · {paymentLabel(s.paymentMethod)}</div>
                      {s.items.some((it) => it.codes && it.codes.length > 0) && (
                        <div className="text-[11px] mt-0.5" style={{ color: "#C08A3E", fontFamily: "'Carlito', sans-serif" }}>
                          {s.items.filter((it) => it.codes && it.codes.length).map((it) => it.codes.join(", ")).join(" · ")}
                        </div>
                      )}
                    </div>
                    <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-sm">{fmt(s.total)} FCFA</span>
                  </div>
                </Row>
              ))}
            </Ledger>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Tableau de bord (ventes & meilleurs articles) ---------- */
function DashboardTab({ sales, products, goal, setGoal }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const DAYS = 14;

  const dailyData = useMemo(() => {
    const days = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      days.push({ date: d, total: 0, count: 0 });
    }
    sales.forEach((sale) => {
      const d = new Date(sale.date);
      d.setHours(0, 0, 0, 0);
      const t = d.getTime();
      const match = days.find((day) => day.date.getTime() === t);
      if (match) { match.total += sale.total; match.count += 1; }
    });
    return days;
  }, [sales]);

  const monthTotal = useMemo(() => {
    const n = new Date();
    return sales.filter((x) => { const d = new Date(x.date); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); }).reduce((a, x) => a + x.total, 0);
  }, [sales]);
  const goalNum = Number(goal) || 0;
  const goalPct = goalNum > 0 ? Math.min(100, Math.round((monthTotal / goalNum) * 100)) : 0;
  const maxDaily = Math.max(1, ...dailyData.map((d) => d.total));
  const totalPeriod = dailyData.reduce((s, d) => s + d.total, 0);
  const avgDaily = totalPeriod / DAYS;
  const bestDay = dailyData.reduce((best, d) => (!best || d.total > best.total ? d : best), null);

  const topProducts = useMemo(() => {
    const since = dailyData[0]?.date?.getTime() ?? 0;
    const map = {};
    sales.forEach((sale) => {
      if (sale.date < since) return;
      (sale.items || []).forEach((it) => {
        map[it.name] = (map[it.name] || 0) + it.price * it.qty;
      });
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sales, dailyData]);
  const maxProduct = Math.max(1, ...topProducts.map(([, v]) => v));

  const byPayment = useMemo(() => {
    const since = dailyData[0]?.date?.getTime() ?? 0;
    const map = {};
    sales.forEach((sale) => {
      if (sale.date < since) return;
      const key = sale.paymentMethod || "especes";
      map[key] = (map[key] || 0) + sale.total;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [sales, dailyData]);
  const maxPayment = Math.max(1, ...byPayment.map(([, v]) => v));

  return (
    <div className="space-y-5">
      <div className="rounded-lg p-3 space-y-2" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "#6B6558" }}>Objectif de ventes du mois</span>
          <span className="text-[11px]" style={{ color: goalPct >= 100 ? "#16A34A" : "#C08A3E" }}>{goalNum > 0 ? `${goalPct} %` : "non défini"}</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "#F0ECE3" }}>
          <div className="h-full rounded-full" style={{ width: `${goalPct}%`, background: goalPct >= 100 ? "#16A34A" : "#C08A3E" }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }}>{fmt(monthTotal)} FCFA{goalNum > 0 ? ` / ${fmt(goalNum)}` : ""}</span>
          <input
            type="number"
            value={goal || ""}
            onChange={(e) => setGoal(parseFloat(e.target.value) || 0)}
            placeholder="Objectif en FCFA"
            className="w-36 px-2 py-1 rounded-md text-sm text-right outline-none"
            style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-3" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
          <div className="text-[11px]" style={{ color: "#6B6558" }}>Total sur {DAYS} jours</div>
          <div style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg mt-0.5">{fmt(totalPeriod)} <span className="text-xs" style={{ color: "#6B6558" }}>FCFA</span></div>
        </div>
        <div className="rounded-lg p-3" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
          <div className="text-[11px]" style={{ color: "#6B6558" }}>Moyenne par jour</div>
          <div style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg mt-0.5">{fmt(Math.round(avgDaily))} <span className="text-xs" style={{ color: "#6B6558" }}>FCFA</span></div>
        </div>
      </div>

      <div className="rounded-lg p-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs uppercase tracking-wide" style={{ color: "#16A34A" }}>Ventes des {DAYS} derniers jours</span>
          {bestDay && bestDay.total > 0 && (
            <span className="text-[10px]" style={{ color: "#6B6558" }}>Meilleur jour : {bestDay.date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}</span>
          )}
        </div>
        <div className="flex items-end gap-1" style={{ height: 110 }}>
          {dailyData.map((d, i) => {
            const h = d.total > 0 ? Math.max(4, Math.round((d.total / maxDaily) * 100)) : 2;
            const isSelected = selectedDay === i;
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : i)}
                className="flex-1 h-full flex flex-col items-center justify-end"
                aria-label={`${d.date.toLocaleDateString("fr-FR")} : ${fmt(d.total)} FCFA`}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${h}%`,
                    background: isSelected ? "#1B1F1C" : "#C08A3E",
                    borderRadius: "3px 3px 0 0",
                    minHeight: 2,
                  }}
                />
              </button>
            );
          })}
        </div>
        <div className="flex gap-1 mt-1.5">
          {dailyData.map((d, i) => (
            <div key={i} className="flex-1 text-center text-[8px]" style={{ color: "#6B6558" }}>
              {d.date.toLocaleDateString("fr-FR", { weekday: "narrow" })}
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 flex items-center justify-between text-sm" style={{ borderTop: "1px solid #DCD5C6" }}>
          {selectedDay != null ? (
            <>
              <span style={{ color: "#6B6558" }} className="capitalize">{dailyData[selectedDay].date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
              <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }}>{fmt(dailyData[selectedDay].total)} FCFA · {dailyData[selectedDay].count} vente{dailyData[selectedDay].count > 1 ? "s" : ""}</span>
            </>
          ) : (
            <span className="text-xs" style={{ color: "#6B6558" }}>Touche une barre pour voir le détail du jour.</span>
          )}
        </div>
      </div>

      <div className="rounded-lg p-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="text-xs uppercase tracking-wide mb-3" style={{ color: "#16A34A" }}>Meilleurs articles ({DAYS} jours)</div>
        {topProducts.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: "#6B6558" }}>Aucune vente sur la période.</div>
        ) : (
          <div className="space-y-2.5">
            {topProducts.map(([name, value]) => (
              <div key={name}>
                <div className="flex items-center justify-between text-xs mb-1 gap-2">
                  <span style={{ color: "#1B1F1C" }} className="truncate">{name}</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="shrink-0">{fmt(value)} FCFA</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#F0ECE3" }}>
                  <div style={{ height: 6, borderRadius: 3, background: "#C08A3E", width: `${Math.max(4, Math.round((value / maxProduct) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {byPayment.length > 0 && (
        <div className="rounded-lg p-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
          <div className="text-xs uppercase tracking-wide mb-3" style={{ color: "#16A34A" }}>Moyens de paiement ({DAYS} jours)</div>
          <div className="space-y-2.5">
            {byPayment.map(([method, value]) => (
              <div key={method}>
                <div className="flex items-center justify-between text-xs mb-1 gap-2">
                  <span style={{ color: "#1B1F1C" }}>{paymentLabel(method)}</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="shrink-0">{fmt(value)} FCFA</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#F0ECE3" }}>
                  <div style={{ height: 6, borderRadius: 3, background: "#C08A3E", width: `${Math.max(4, Math.round((value / maxPayment) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Agenda des prises de service ---------- */
function AgendaTab({ shifts }) {
  const byDay = useMemo(() => {
    const groups = {};
    [...shifts].sort((a, b) => b.time - a.time).forEach((s) => {
      const d = new Date(s.time).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      (groups[d] ||= []).push(s);
    });
    return groups;
  }, [shifts]);

  if (shifts.length === 0) {
    return <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>Aucune prise de service enregistrée pour l'instant.</div>;
  }

  return (
    <div className="space-y-5">
      {Object.entries(byDay).map(([day, list]) => (
        <div key={day}>
          <div className="mb-2 px-1 text-xs uppercase tracking-wide" style={{ color: "#16A34A" }}>{day}</div>
          <Ledger>
            {list.map((s, i) => (
              <Row key={s.id} n={i + 1}>
                <div className="flex-1 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} className="text-[15px] flex items-center gap-1.5 flex-wrap">
                      {s.name}
                      {s.locationFlag === "ok" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#16A34A22", color: "#16A34A" }}>📍 sur place</span>
                      )}
                      {s.locationFlag === "hors_zone" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#DC4C3C22", color: "#DC4C3C" }}>⚠️ hors zone{s.distance != null ? ` (${s.distance >= 1000 ? `${(s.distance / 1000).toFixed(1)} km` : `${s.distance} m`})` : ""}</span>
                      )}
                      {s.locationFlag === "non_verifiee" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "#DCD5C6", color: "#6B6558" }}>position non vérifiée</span>
                      )}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>
                      {s.role === "gerant" ? "Gérant" : s.role === "caissier" ? "Caissier" : "Vendeur"} · {new Date(s.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      {s.endTime ? (
                        <>
                          {" → "}{new Date(s.endTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}{formatDuration(s.endTime - s.time)}
                        </>
                      ) : (
                        <span style={{ color: "#16A34A" }}> · service en cours</span>
                      )}
                    </div>
                    {s.endTime && s.endLocationFlag === "hors_zone" && (
                      <div className="text-[9px] mt-1 inline-block px-1.5 py-0.5 rounded-full" style={{ background: "#DC4C3C22", color: "#DC4C3C" }}>
                        ⚠️ fin hors zone{s.endDistance != null ? ` (${s.endDistance >= 1000 ? `${(s.endDistance / 1000).toFixed(1)} km` : `${s.endDistance} m`})` : ""}
                      </div>
                    )}
                  </div>
                  {s.signature && (
                    <img
                      src={s.signature}
                      alt={`Signature de ${s.name}`}
                      className="h-8 w-16 object-contain rounded shrink-0"
                      style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}
                    />
                  )}
                </div>
              </Row>
            ))}
          </Ledger>
        </div>
      ))}
    </div>
  );
}

/* ---------- Paie (commission sur les ventes) ---------- */
function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function PayslipModal({ data, year, month, onClose }) {
  const { person, role, salesCount, salesTotal, commissionRate, commissionAmount, hoursMs, hourlyRate, hourlyAmount, baseSalary, gross, loanBalance, net } = data;
  let n = 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "#00000088" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Bulletin de paie</h3>
            <p className="text-xs mt-0.5 capitalize" style={{ color: "#6B6558" }}>{monthLabel(year, month)}</p>
          </div>
          <button onClick={onClose}><X size={20} style={{ color: "#6B6558" }} /></button>
        </div>

        <Ledger>
          <Row n={++n}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#6B6558" }}>{role === "caissier" ? "Caissier" : "Vendeur"}</span>
              <span style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}>{person.name}</span>
            </div>
          </Row>
          <Row n={++n}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#6B6558" }}>Heures travaillées</span>
              <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }}>{formatDuration(hoursMs)}</span>
            </div>
          </Row>
          {hourlyRate > 0 && (
            <Row n={++n}>
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm" style={{ color: "#6B6558" }}>Taux horaire × heures</span>
                <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }}>{fmt(hourlyAmount)} FCFA</span>
              </div>
            </Row>
          )}
          {baseSalary > 0 && (
            <Row n={++n}>
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm" style={{ color: "#6B6558" }}>Salaire de base</span>
                <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }}>{fmt(baseSalary)} FCFA</span>
              </div>
            </Row>
          )}
          {role === "vendeur" && (
            <>
              <Row n={++n}>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm" style={{ color: "#6B6558" }}>Ventes réalisées</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }}>{salesCount}</span>
                </div>
              </Row>
              <Row n={++n}>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm" style={{ color: "#6B6558" }}>Chiffre d'affaires généré</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }}>{fmt(salesTotal)} FCFA</span>
                </div>
              </Row>
              <Row n={++n}>
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-sm" style={{ color: "#6B6558" }}>Commission ({commissionRate}%)</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }}>{fmt(commissionAmount)} FCFA</span>
                </div>
              </Row>
            </>
          )}
          {loanBalance > 0 && (
            <Row n={++n}>
              <div className="flex-1 flex items-center justify-between">
                <span className="text-sm" style={{ color: "#DC4C3C" }}>Emprunt en cours à déduire</span>
                <span style={{ fontFamily: "'Carlito', sans-serif", color: "#DC4C3C" }}>− {fmt(loanBalance)} FCFA</span>
              </div>
            </Row>
          )}
        </Ledger>

        <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55" }}>
          <span className="text-sm" style={{ color: "#1B1F1C" }}>Montant net à verser</span>
          <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-xl">{fmt(net)} FCFA</span>
        </div>

        <p className="text-[10px]" style={{ color: "#16A34A" }}>
          Calcul basé sur les ventes et les heures de service (Agenda) enregistrées dans KABATEC Consulting pour la période sélectionnée — document indicatif à intégrer dans ta comptabilité.
        </p>

        <button onClick={() => window.print()} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>
          Imprimer / Exporter en PDF
        </button>
      </div>
    </div>
  );
}

function PaieTab({ sales, sellers, cashiers, shifts, currentUser, isAdmin, expenses, onAddExpense, onDeleteExpense }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [openSlip, setOpenSlip] = useState(null);
  const [expLabel, setExpLabel] = useState("");
  const [expAmount, setExpAmount] = useState("");

  const shiftMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setMonth(m); setYear(y);
  };

  const periodSales = useMemo(
    () => sales.filter((s) => {
      const d = new Date(s.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }),
    [sales, year, month]
  );

  const periodExpenses = useMemo(
    () => (expenses || []).filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    }),
    [expenses, year, month]
  );
  const totalSalesPeriod = periodSales.reduce((s, v) => s + v.total, 0);
  const totalExpensesPeriod = periodExpenses.reduce((s, v) => s + v.amount, 0);

  const addExpense = () => {
    const amount = parseFloat(expAmount);
    if (!expLabel.trim() || !amount || amount <= 0) return;
    onAddExpense({ id: uid(), label: expLabel.trim(), amount, date: Date.now() });
    setExpLabel("");
    setExpAmount("");
  };

  const buildRow = (person, role) => {
    const own = role === "vendeur"
      ? periodSales.filter((sale) => (sale.sellerId ? sale.sellerId === person.id : sale.sellerName === person.name))
      : [];
    const salesTotal = own.reduce((sum, sale) => sum + sale.total, 0);
    const commissionRate = person.commission || 0;
    const commissionAmount = role === "vendeur" ? (salesTotal * commissionRate) / 100 : 0;
    const hoursMs = (shifts || [])
      .filter((s) => s.role === role && s.endTime && (s.personId ? s.personId === person.id : s.name === person.name))
      .filter((s) => { const d = new Date(s.time); return d.getFullYear() === year && d.getMonth() === month; })
      .reduce((sum, s) => sum + (s.endTime - s.time), 0);
    const hours = hoursMs / 3600000;
    const hourlyRate = person.hourlyRate || 0;
    const hourlyAmount = Math.round(hours * hourlyRate);
    const baseSalary = person.baseSalary || 0;
    const gross = commissionAmount + hourlyAmount + baseSalary;
    const loanBalance = person.loanBalance || 0;
    const net = Math.max(0, gross - loanBalance);
    return { person, role, salesCount: own.length, salesTotal, commissionRate, commissionAmount, hoursMs, hours, hourlyRate, hourlyAmount, baseSalary, gross, loanBalance, net };
  };

  const rows = useMemo(() => {
    const sellerList = isAdmin ? sellers : (currentUser?.role === "vendeur" ? sellers.filter((s) => s.id === currentUser.id) : []);
    const cashierList = isAdmin ? (cashiers || []) : (currentUser?.role === "caissier" ? (cashiers || []).filter((c) => c.id === currentUser.id) : []);
    return [
      ...sellerList.map((s) => buildRow(s, "vendeur")),
      ...cashierList.map((c) => buildRow(c, "caissier")),
    ];
  }, [sellers, cashiers, periodSales, shifts, isAdmin, currentUser, year, month]);

  const totalPayroll = rows.reduce((sum, r) => sum + r.net, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "#FFFFFF", color: "#1B1F1C", border: "1px solid #DCD5C6" }}>‹</button>
        <span style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-sm capitalize">{monthLabel(year, month)}</span>
        <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "#FFFFFF", color: "#1B1F1C", border: "1px solid #DCD5C6" }}>›</button>
      </div>

      {isAdmin && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "#6B6558" }}>Ventes du mois</span>
            <span style={{ fontFamily: "'Carlito', sans-serif", color: "#16A34A" }}>{fmt(totalSalesPeriod)} FCFA</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "#6B6558" }}>Dépenses du mois</span>
            <span style={{ fontFamily: "'Carlito', sans-serif", color: "#DC4C3C" }}>− {fmt(totalExpensesPeriod)} FCFA</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "#6B6558" }}>Salaires du mois (net)</span>
            <span style={{ fontFamily: "'Carlito', sans-serif", color: "#DC4C3C" }}>− {fmt(totalPayroll)} FCFA</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2" style={{ borderTop: "1px solid #DCD5C6" }}>
            <span style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}>Bilan net</span>
            <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }}>{fmt(totalSalesPeriod - totalExpensesPeriod - totalPayroll)} FCFA</span>
          </div>
        </div>
      )}

      {sellers.length === 0 && (cashiers || []).length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: "#16A34A99" }}>Aucun vendeur ni caissier enregistré pour l'instant.</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: "#16A34A99" }}>Aucun accès à afficher.</div>
      ) : (
        <Ledger>
          {rows.map((r, i) => (
            <Row key={`${r.role}-${r.person.id}`} n={i + 1}>
              <button onClick={() => setOpenSlip(r)} className="flex-1 flex items-center justify-between text-left">
                <div>
                  <div style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} className="text-[15px]">{r.person.name} <span className="text-[10px]" style={{ color: "#6B6558" }}>{r.role === "caissier" ? "(caissier)" : ""}</span></div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>
                    {formatDuration(r.hoursMs)}
                    {r.role === "vendeur" && ` · ${r.salesCount} vente${r.salesCount > 1 ? "s" : ""} · ${fmt(r.salesTotal)} FCFA vendus · ${r.commissionRate}%`}
                    {r.loanBalance > 0 && ` · doit ${fmt(r.loanBalance)} FCFA`}
                  </div>
                </div>
                <div style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-sm">{fmt(r.net)} FCFA</div>
              </button>
            </Row>
          ))}
        </Ledger>
      )}

      {isAdmin && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide px-1" style={{ color: "#16A34A" }}>Dépenses</p>
          <div className="flex gap-2">
            <input
              value={expLabel}
              onChange={(e) => setExpLabel(e.target.value)}
              placeholder="Ex. Achat marchandise, loyer…"
              className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
            />
            <input
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              type="number"
              placeholder="Montant"
              className="w-28 px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
            />
            <button onClick={addExpense} className="px-3 rounded-md" style={{ background: "#C08A3E", color: "#F0ECE3" }}>
              <Plus size={16} />
            </button>
          </div>
          {periodExpenses.length > 0 && (
            <Ledger>
              {periodExpenses.map((e, i) => (
                <Row key={e.id} n={i + 1}>
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <div style={{ color: "#1B1F1C" }} className="text-sm">{e.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{new Date(e.date).toLocaleDateString("fr-FR")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: "'Carlito', sans-serif", color: "#DC4C3C" }} className="text-sm">{fmt(e.amount)} FCFA</span>
                      <button onClick={() => onDeleteExpense(e.id)} style={{ color: "#16A34A" }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                </Row>
              ))}
            </Ledger>
          )}
        </div>
      )}

      {openSlip && <PayslipModal data={openSlip} year={year} month={month} onClose={() => setOpenSlip(null)} />}
    </div>
  );
}

/* ---------- Achats & fournisseurs ---------- */
function PurchasesModal({ products, purchases, onAdd, onDelete, onClose }) {
  const [supplier, setSupplier] = useState("");
  const [productName, setProductName] = useState("");
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");

  const total = (purchases || []).reduce((s, p) => s + (p.amount || 0), 0);
  const sorted = [...(purchases || [])].sort((a, b) => b.date - a.date);

  const add = () => {
    if (!supplier.trim() || !productName.trim() || !amount) return;
    onAdd({ supplier: supplier.trim(), productName: productName.trim(), qty: parseFloat(qty) || 1, amount: parseFloat(amount) || 0 });
    setSupplier(""); setProductName(""); setQty(""); setAmount("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "#00000099" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Achats & fournisseurs</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#6B6558" }} /></button>
        </div>

        <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#C08A3E1A" }}>
          <span className="text-sm" style={{ color: "#1B1F1C" }}>Total des achats enregistrés</span>
          <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-lg">{fmt(total)} FCFA</span>
        </div>

        <div className="space-y-2 p-3 rounded-lg" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Fournisseur" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
          <input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Article acheté" list="purchase-products" className="w-full px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
          <datalist id="purchase-products">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantité" className="px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant payé (FCFA)" className="px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
          </div>
          <button onClick={add} disabled={!supplier.trim() || !productName.trim() || !amount} className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-40" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
            Ajouter l'achat
          </button>
        </div>

        <div className="space-y-2">
          {sorted.length === 0 && <p className="text-xs text-center py-4" style={{ color: "#6B6558" }}>Aucun achat enregistré pour l'instant.</p>}
          {sorted.map((p) => (
            <div key={p.id} className="p-2.5 rounded-lg text-sm flex items-center justify-between" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
              <div>
                <div style={{ color: "#1B1F1C" }}>{p.productName} <span style={{ color: "#6B6558" }}>×{p.qty}</span></div>
                <div className="text-xs" style={{ color: "#6B6558" }}>{p.supplier} · {new Date(p.date).toLocaleDateString("fr-FR")}</div>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }}>{fmt(p.amount)} FCFA</span>
                <button onClick={() => onDelete(p.id)}><Trash2 size={14} style={{ color: "#DC4C3C" }} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Clôture de caisse ---------- */
function ClotureModal({ sales, closures, onSave, onClose }) {
  const [counted, setCounted] = useState("");
  const lastClosure = [...(closures || [])].sort((a, b) => b.date - a.date)[0];
  const since = lastClosure ? lastClosure.date : 0;
  const cashSales = sales.filter((s) => s.date > since && s.paymentMethod === "especes");
  const theoretical = cashSales.reduce((s, v) => s + v.total, 0);
  const diff = counted === "" ? null : (parseFloat(counted) || 0) - theoretical;
  const history = [...(closures || [])].sort((a, b) => b.date - a.date).slice(0, 10);

  const save = () => {
    if (counted === "") return;
    onSave({ theoretical, counted: parseFloat(counted) || 0, diff: (parseFloat(counted) || 0) - theoretical });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "#00000099" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Clôture de caisse</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#6B6558" }} /></button>
        </div>

        <p className="text-xs" style={{ color: "#6B6558" }}>
          Depuis la dernière clôture {lastClosure ? `(${new Date(lastClosure.date).toLocaleString("fr-FR")})` : "(jamais effectuée)"}, {cashSales.length} vente{cashSales.length > 1 ? "s" : ""} en espèces.
        </p>

        <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#C08A3E1A" }}>
          <span className="text-sm" style={{ color: "#1B1F1C" }}>Total théorique (espèces)</span>
          <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-lg">{fmt(theoretical)} FCFA</span>
        </div>

        <div>
          <label className="text-xs" style={{ color: "#6B6558" }}>Argent compté physiquement en caisse</label>
          <input
            type="number"
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            placeholder="Montant compté"
            className="w-full mt-1 px-3 py-2.5 rounded-md text-sm outline-none"
            style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
          />
        </div>

        {diff !== null && (
          <div className="rounded-lg p-3 text-center" style={{ background: diff === 0 ? "#16A34A1A" : "#DC4C3C1A" }}>
            <div style={{ fontFamily: "'Carlito', sans-serif", color: diff === 0 ? "#16A34A" : "#DC4C3C" }} className="text-xl">
              {diff === 0 ? "Caisse juste ✓" : `${diff > 0 ? "+" : ""}${fmt(diff)} FCFA`}
            </div>
            <div className="text-xs mt-1" style={{ color: "#6B6558" }}>{diff === 0 ? "Aucun écart" : diff > 0 ? "Surplus en caisse" : "Manque en caisse"}</div>
          </div>
        )}

        <button onClick={save} disabled={counted === ""} className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-40" style={{ background: "#16A34A", color: "#F0ECE3" }}>
          Enregistrer la clôture
        </button>

        {history.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6B6558" }}>Historique des clôtures</p>
            <div className="space-y-1.5">
              {history.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs p-2 rounded-md" style={{ background: "#F0ECE3" }}>
                  <span style={{ color: "#6B6558" }}>{new Date(c.date).toLocaleDateString("fr-FR")}</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: c.diff === 0 ? "#16A34A" : "#DC4C3C" }}>{c.diff > 0 ? "+" : ""}{fmt(c.diff)} FCFA</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Devis ---------- */
function DevisModal({ products, clients, shopName, receiptFormat, onClose }) {
  const [clientName, setClientName] = useState("");
  const [lines, setLines] = useState([{ id: uid(), name: "", qty: 1, price: 0 }]);
  const date = new Date();
  const validUntil = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
  const total = lines.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.price) || 0), 0);

  const updateLine = (id, patch) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, { id: uid(), name: "", qty: 1, price: 0 }]);
  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.id !== id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .mte-devis, .mte-devis * { visibility: visible; }
          .mte-devis { position: fixed; inset: 0; margin: auto; }
          .mte-devis .no-print { display: none !important; }
          ${receiptPrintCss(receiptFormat)}
        }
      `}</style>
      <div onClick={(e) => e.stopPropagation()} className="mte-devis w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-xl p-5 space-y-3" style={{ background: "#FFFFFF", color: "#1B1F1C" }}>
        <div className="flex items-center justify-between no-print">
          <h3 style={{ fontFamily: "'Carlito', sans-serif" }} className="text-lg">Nouveau devis</h3>
          <button onClick={onClose}><X size={18} style={{ color: "#6B6558" }} /></button>
        </div>

        <div className="text-center space-y-0.5">
          <p className="text-base font-semibold" style={{ fontFamily: "'Carlito', sans-serif" }}>{shopName || "Mon commerce"}</p>
          <p className="text-[11px]" style={{ color: "#6B6558" }}>DEVIS — valable jusqu'au {validUntil.toLocaleDateString("fr-FR")}</p>
        </div>

        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Nom du client"
          list="devis-clients"
          className="w-full px-3 py-2 rounded-md text-sm outline-none no-print-border"
          style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
        />
        <datalist id="devis-clients">{clients.map((c) => <option key={c.id} value={c.name} />)}</datalist>

        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center gap-1.5">
              <input value={l.name} onChange={(e) => updateLine(l.id, { name: e.target.value })} placeholder="Article" list="devis-products" className="flex-1 px-2 py-1.5 rounded-md text-xs outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
              <input type="number" value={l.qty} onChange={(e) => updateLine(l.id, { qty: e.target.value })} className="w-12 px-1 py-1.5 rounded-md text-xs text-center outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
              <input type="number" value={l.price} onChange={(e) => updateLine(l.id, { price: e.target.value })} placeholder="Prix" className="w-20 px-1 py-1.5 rounded-md text-xs text-right outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }} />
              <button onClick={() => removeLine(l.id)} className="no-print"><X size={14} style={{ color: "#DC4C3C" }} /></button>
            </div>
          ))}
          <datalist id="devis-products">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          <button onClick={addLine} className="text-xs flex items-center gap-1 no-print" style={{ color: "#C08A3E" }}><Plus size={12} /> Ajouter une ligne</button>
        </div>

        <div className="border-t pt-2 flex items-center justify-between" style={{ borderColor: "#DCD5C6" }}>
          <span className="text-sm font-semibold">Total</span>
          <span className="text-base font-semibold" style={{ fontFamily: "'Carlito', sans-serif" }}>{fmt(total)} FCFA</span>
        </div>

        <div className="flex gap-2 pt-2 no-print">
          <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "#1B1F1C", color: "#EDE6D6" }}>
            Imprimer / Enregistrer en PDF
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-medium" style={{ background: "#37403A22", border: "1px solid #1B1F1C33", color: "#1B1F1C" }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Réglages ---------- */
function SafetyPanel({ lockMinutes, setLockMinutes, backupInfo, onBackup, onRestore }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg, failMsg) => {
    setBusy(true); setMsg("");
    const ok = await fn();
    setBusy(false);
    setMsg(ok ? okMsg : failMsg);
  };
  return (
    <div>
      <div className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "#16A34A" }}>
        <Lock size={13} /> Sécurité et sauvegarde
      </div>
      <div className="rounded-lg p-3 space-y-3" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
        <div>
          <label className="text-xs" style={{ color: "#6B6558" }}>Verrouillage automatique après inactivité</label>
          <select value={Number(lockMinutes) || 0} onChange={(e) => setLockMinutes(parseInt(e.target.value, 10) || 0)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>
            <option value={0}>Désactivé</option>
            <option value={2}>Après 2 minutes</option>
            <option value={5}>Après 5 minutes</option>
            <option value={10}>Après 10 minutes</option>
            <option value={30}>Après 30 minutes</option>
          </select>
          <p className="text-[11px] mt-1" style={{ color: "#6B6558" }}>Si personne ne touche l'écran, l'application revient à l'écran de connexion.</p>
        </div>
        <div className="pt-2 border-t space-y-2" style={{ borderColor: "#DCD5C6" }}>
          <p className="text-xs" style={{ color: "#6B6558" }}>
            {backupInfo ? `Dernière sauvegarde : ${new Date(backupInfo.date).toLocaleString("fr-FR")} · ${backupInfo.products} article(s) · ${backupInfo.sales} vente(s)` : "Aucune sauvegarde pour l'instant."}
          </p>
          <p className="text-[11px]" style={{ color: "#6B6558" }}>Une sauvegarde automatique est faite chaque jour quand le gérant se connecte.</p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => run(onBackup, "✓ Sauvegarde enregistrée.", "Échec de la sauvegarde.")} className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-50" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
              Sauvegarder maintenant
            </button>
            <button
              disabled={busy || !backupInfo}
              onClick={() => { if (window.confirm("Restaurer la dernière sauvegarde ? Les données actuelles (articles, ventes, clients, personnel) seront REMPLACÉES par celles de la sauvegarde.")) run(onRestore, "✓ Sauvegarde restaurée.", "Échec de la restauration."); }}
              className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40"
              style={{ background: "#FFFFFF", border: "1px solid #DC4C3C55", color: "#DC4C3C" }}
            >
              Restaurer
            </button>
          </div>
          {msg && <p className="text-xs" style={{ color: msg.startsWith("✓") ? "#16A34A" : "#DC4C3C" }}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}

function CategoryManager({ categories, products, onSave, onRename, title = "Catégories d'articles", hint = "Crée tes propres rayons (ex. Électroménager, Carreaux, Lavabos). Ils servent de filtres dans Stock et Vente.", placeholder = "Nouvelle catégorie…", field = "category", noun = "catégorie" }) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const countOf = (c) => products.filter((p) => (p[field] || (field === "depot" ? categories[0] : "")) === c).length;
  const add = () => {
    const n = newName.trim();
    if (!n || categories.some((c) => c.toLowerCase() === n.toLowerCase())) return;
    onSave([...categories, n]);
    setNewName("");
  };
  const commitRename = () => {
    const n = editValue.trim();
    if (n && n !== editing && !categories.some((c) => c.toLowerCase() === n.toLowerCase())) onRename(editing, n);
    setEditing(null);
  };
  const remove = (c) => {
    const cnt = countOf(c);
    const msg = cnt > 0 ? `Supprimer ${noun === "dépôt" ? "le" : "la"} ${noun} « ${c} » ? Les ${cnt} article(s) la gardent mais elle n'apparaîtra plus dans la liste.` : `Supprimer ${noun === "dépôt" ? "le" : "la"} ${noun} « ${c} » ?`;
    if (window.confirm(msg)) onSave(categories.filter((x) => x !== c));
  };
  return (
    <div>
      <div className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "#16A34A" }}>
        <Package size={13} /> {title}
      </div>
      <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
        <p className="text-xs" style={{ color: "#6B6558" }}>{hint}</p>
        {categories.map((c) => (
          <div key={c} className="flex items-center gap-2">
            {editing === c ? (
              <>
                <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && commitRename()} className="flex-1 min-w-0 px-3 py-1.5 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
                <button onClick={commitRename} className="text-xs px-2 py-1.5 rounded-md" style={{ background: "#16A34A", color: "#FFFFFF" }}>OK</button>
              </>
            ) : (
              <>
                <span className="flex-1 min-w-0 truncate text-sm" style={{ color: "#1B1F1C" }}>{c} <span className="text-xs" style={{ color: "#6B6558" }}>({countOf(c)})</span></span>
                <button onClick={() => { setEditing(c); setEditValue(c); }} className="text-xs px-2 py-1" style={{ color: "#C08A3E" }}>Renommer</button>
                <button onClick={() => remove(c)} className="text-xs px-2 py-1" style={{ color: "#DC4C3C" }}>Supprimer</button>
              </>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder} className="flex-1 min-w-0 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
          <button onClick={add} className="px-3 py-2 rounded-md text-sm font-medium shrink-0" style={{ background: "#C08A3E", color: "#FFFFFF" }}>Ajouter</button>
        </div>
      </div>
    </div>
  );
}

function ReglagesTab({ lockMinutes, setLockMinutes, backupInfo, onBackup, onRestore, onUpdatePerson, depots, onSaveDepots, onRenameDepot, categories, onSaveCategories, onRenameCategory, businessType, setBusinessType, isAdmin, currentUser, onLogout, sellers, onAddSeller, onRemoveSeller, onRenameSeller, onUpdateCommission, onUpdateSellerHourlyRate, onAddSellerLoan, onRepaySellerLoan, cashiers, onAddCashier, onRemoveCashier, onRenameCashier, onUpdateCashierHourlyRate, onAddCashierLoan, onRepayCashierLoan, onReset, hours, setHours, shopLocation, setShopLocation, shopLogoUrl, setShopLogoUrl, shopId, shopName, setShopName, onLeaveShop, sales, products, expenses, fedapayKey, setFedapayKey, gerantEmail, setGerantEmail, alertPhones, setAlertPhones, loyaltyRate, setLoyaltyRate, receiptFormat, setReceiptFormat, purchases, onAddPurchase, onDeletePurchase, closures, onAddClosure, clients, onEndService }) {
  const [confirming, setConfirming] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommission, setNewCommission] = useState("");
  const [newCashierName, setNewCashierName] = useState("");
  const [reportPeriod, setReportPeriod] = useState(null);
  const [keyDraft, setKeyDraft] = useState(fedapayKey || "");
  const [keySaved, setKeySaved] = useState(false);
  const padPhones = (arr) => [0, 1, 2].map((i) => ({ name: (arr && arr[i] && arr[i].name) || "", phone: (arr && arr[i] && arr[i].phone) || "" }));
  const [phonesDraft, setPhonesDraft] = useState(padPhones(alertPhones));
  const [phonesSaved, setPhonesSaved] = useState(false);
  const phonesKey = JSON.stringify(alertPhones || []);
  useEffect(() => { setPhonesDraft(padPhones(alertPhones)); }, [phonesKey]);
  const [emailDraft, setEmailDraft] = useState(gerantEmail || "");
  const [emailSaved, setEmailSaved] = useState(false);
  const [loyaltyDraft, setLoyaltyDraft] = useState(loyaltyRate || "");
  const [showPurchases, setShowPurchases] = useState(false);
  const [showClosure, setShowClosure] = useState(false);
  const [showDevis, setShowDevis] = useState(false);
  const [capturingLocation, setCapturingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const captureShopLocation = async () => {
    setLocationError("");
    setCapturingLocation(true);
    try {
      const pos = await getCurrentPosition();
      setShopLocation(pos);
    } catch (e) {
      setLocationError("Position impossible à obtenir. Vérifie que la localisation est activée sur ton téléphone.");
    } finally {
      setCapturingLocation(false);
    }
  };
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState("");
  const handleLogoChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setLogoError("");
    setLogoUploading(true);
    try {
      const oldUrl = shopLogoUrl;
      const url = await storage.uploadShopLogo(file, shopId);
      setShopLogoUrl(url);
      if (oldUrl && oldUrl !== url) storage.deleteShopLogo(oldUrl);
    } catch (err) {
      setLogoError("Envoi du logo impossible. Vérifie ta connexion et réessaie.");
    } finally {
      setLogoUploading(false);
    }
  };
  const removeLogo = () => {
    const oldUrl = shopLogoUrl;
    setShopLogoUrl("");
    if (oldUrl) storage.deleteShopLogo(oldUrl);
  };
  const [loanEditing, setLoanEditing] = useState(null); // { type: 'seller' | 'cashier', id } | null
  const [loanAmount, setLoanAmount] = useState("");
  const [loanNote, setLoanNote] = useState("");

  const toggleLoanEditor = (type, id) => {
    if (loanEditing && loanEditing.type === type && loanEditing.id === id) {
      setLoanEditing(null);
    } else {
      setLoanEditing({ type, id });
      setLoanAmount("");
      setLoanNote("");
    }
  };

  const submitLoan = (direction) => {
    const amount = parseFloat(loanAmount);
    if (!amount || amount <= 0 || !loanEditing) return;
    if (loanEditing.type === "seller") {
      if (direction === "emprunt") onAddSellerLoan(loanEditing.id, amount, loanNote.trim());
      else onRepaySellerLoan(loanEditing.id, amount);
    } else {
      if (direction === "emprunt") onAddCashierLoan(loanEditing.id, amount, loanNote.trim());
      else onRepayCashierLoan(loanEditing.id, amount);
    }
    setLoanEditing(null);
    setLoanAmount("");
    setLoanNote("");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "#1B1F1C" }}>
          <User size={16} style={{ color: "#C08A3E" }} />
          Connecté en tant que <span style={{ fontFamily: "'Carlito', sans-serif" }}>{currentUser?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {onEndService && (
            <button onClick={onEndService} className="text-xs px-3 py-1.5 rounded-md flex items-center gap-1" style={{ background: "#C08A3E1A", color: "#C08A3E" }}>
              <PenTool size={12} /> Terminer le service
            </button>
          )}
          <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded-md flex items-center gap-1" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>
            <LogOut size={12} /> Changer
          </button>
        </div>
      </div>

      {isAdmin && (
        <div>
          <p className="text-xs uppercase tracking-wide mb-2 px-1" style={{ color: "#16A34A" }}>Rapports</p>
          <div className="flex gap-2">
            {[["day", "Jour"], ["week", "Semaine"], ["month", "Mois"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setReportPeriod(id)}
                className="flex-1 py-2 rounded-lg text-sm"
                style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#C08A3E" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Code de ce commerce</div>
          <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
            <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E", letterSpacing: "0.15em" }} className="text-sm">{shopId}</span>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Donne ce code à tes employés ou utilise-le sur un autre appareil pour rejoindre ce même registre.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Nom du commerce</div>
          <input
            value={shopName || ""}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Ex : Quincaillerie Kodjo"
            className="w-full px-3 py-2.5 rounded-md text-sm outline-none"
            style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
          />
          <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Ce nom apparaîtra en haut des tickets de caisse imprimés.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Logo du commerce</div>
          <div className="rounded-lg p-3 flex items-center gap-3" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
            <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 flex items-center justify-center" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
              {shopLogoUrl ? (
                <img src={shopLogoUrl} alt="Logo du commerce" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl">{BUSINESS_TYPES[businessType]?.icon || "🏪"}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="text-xs" style={{ color: "#6B6558" }}>Mets la photo du logo de ta {BUSINESS_TYPES[businessType]?.label?.toLowerCase() || "commerce"} : elle apparaîtra en haut de l'application une fois connecté.</p>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
                  {logoUploading ? "Envoi…" : shopLogoUrl ? "Changer" : "Ajouter une photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} disabled={logoUploading} />
                </label>
                {shopLogoUrl && !logoUploading && (
                  <button onClick={removeLogo} className="text-xs" style={{ color: "#DC4C3C" }}>Retirer</button>
                )}
              </div>
              {logoError && <p className="text-[10px]" style={{ color: "#DC4C3C" }}>{logoError}</p>}
            </div>
          </div>
        </div>
      )}

      {isAdmin && <CategoryManager categories={categories} products={products} onSave={onSaveCategories} onRename={onRenameCategory} />}
      {isAdmin && <SafetyPanel lockMinutes={lockMinutes} setLockMinutes={setLockMinutes} backupInfo={backupInfo} onBackup={onBackup} onRestore={onRestore} />}
      {isAdmin && <CategoryManager categories={depots} products={products} onSave={onSaveDepots} onRename={onRenameDepot} title="Dépôts / magasins" hint="Indique où se trouve chaque article (ex. Magasin principal, Dépôt 2). Tu peux filtrer le stock par dépôt." placeholder="Nouveau dépôt…" field="depot" noun="dépôt" />}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "#16A34A" }}>
            <ScanLine size={13} /> Emplacement du commerce
          </div>
          <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
            <p className="text-xs" style={{ color: "#6B6558" }}>
              Enregistre la position GPS de ton commerce depuis ici, sur place. À chaque prise de service, l'application compare la position de l'appareil à celle-ci (tolérance {SHOP_RADIUS_METERS} m) pour vérifier que le vendeur ou le caissier est bien sur place. Ça n'empêche personne de se connecter — ça ajoute juste un repère "sur place" ou "hors zone" visible dans l'Agenda.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={captureShopLocation}
                disabled={capturingLocation}
                className="px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                style={{ background: "#C08A3E", color: "#FFFFFF" }}
              >
                {capturingLocation ? (<><Loader2 size={14} className="animate-spin" /> Localisation…</>) : (shopLocation ? "Mettre à jour la position" : "Enregistrer la position actuelle")}
              </button>
              {shopLocation && (
                <span className="text-xs" style={{ color: "#16A34A" }}>✓ Position enregistrée</span>
              )}
            </div>
            {locationError && <p className="text-[10px]" style={{ color: "#DC4C3C" }}>{locationError}</p>}
            {!shopLocation && !locationError && (
              <p className="text-[10px]" style={{ color: "#6B6558" }}>Aucune position enregistrée pour l'instant : les prises de service seront marquées "non vérifiées".</p>
            )}
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "#16A34A" }}>
            <Globe size={13} /> Paiement en ligne
          </div>
          <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
            <p className="text-xs" style={{ color: "#6B6558" }}>
              Renseigne ici la clé publique FedaPay de ce commerce pour permettre aux clients de payer directement en ligne (Mobile Money, carte...) depuis l'écran de vente.
            </p>
            <input
              value={keyDraft}
              onChange={(e) => { setKeyDraft(e.target.value); setKeySaved(false); }}
              placeholder="Clé publique FedaPay (pk_live_... ou pk_sandbox_...)"
              className="w-full px-3 py-2.5 rounded-md text-sm outline-none"
              style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setFedapayKey(keyDraft.trim()); setKeySaved(true); }}
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: "#C08A3E", color: "#FFFFFF" }}
              >
                Enregistrer
              </button>
              {keySaved && <span className="text-xs" style={{ color: "#16A34A" }}>✓ Clé enregistrée</span>}
              {fedapayKey && (
                <span className="text-xs ml-auto" style={{ color: "#16A34A" }}>Paiement en ligne activé</span>
              )}
            </div>
            <p className="text-[10px]" style={{ color: "#6B6558" }}>
              Trouve ta clé sur ton compte FedaPay (fedapay.com) → Développeurs → Clés API. Sans cette clé, l'option "Paiement en ligne" reste visible mais ne fonctionne pas.
            </p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Numéros WhatsApp d'alerte (jusqu'à 3)</div>
          <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
            <p className="text-xs" style={{ color: "#6B6558" }}>
              Les alertes de stock bas et les rapports proposent un bouton par numéro. Écris le numéro avec ou sans l'indicatif (le Togo, +228, est ajouté si besoin).
            </p>
            {phonesDraft.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={p.name}
                  onChange={(e) => { const n = [...phonesDraft]; n[i] = { ...n[i], name: e.target.value }; setPhonesDraft(n); setPhonesSaved(false); }}
                  placeholder={`Nom ${i + 1} (facultatif)`}
                  className="w-2/5 px-3 py-2.5 rounded-md text-sm outline-none"
                  style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
                />
                <input
                  type="tel"
                  inputMode="tel"
                  value={p.phone}
                  onChange={(e) => { const n = [...phonesDraft]; n[i] = { ...n[i], phone: e.target.value }; setPhonesDraft(n); setPhonesSaved(false); }}
                  placeholder="90 00 00 00"
                  className="flex-1 px-3 py-2.5 rounded-md text-sm outline-none"
                  style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setAlertPhones(phonesDraft.map((p) => ({ name: p.name.trim(), phone: p.phone.trim() })).filter((p) => waPhone(p.phone)).slice(0, 3)); setPhonesSaved(true); }}
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: "#C08A3E", color: "#FFFFFF" }}
              >
                Enregistrer
              </button>
              {phonesSaved && <span className="text-xs" style={{ color: "#16A34A" }}>✓ Numéros enregistrés</span>}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: "#16A34A" }}>
            <Send size={13} /> Email du gérant
          </div>
          <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
            <p className="text-xs" style={{ color: "#6B6558" }}>
              Renseigne ton adresse email pour pouvoir recevoir le rapport du jour et les alertes de stock bas par email, en plus du WhatsApp.
            </p>
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => { setEmailDraft(e.target.value); setEmailSaved(false); }}
              placeholder="ton.email@exemple.com"
              className="w-full px-3 py-2.5 rounded-md text-sm outline-none"
              style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setGerantEmail(emailDraft.trim()); setEmailSaved(true); }}
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: "#C08A3E", color: "#FFFFFF" }}
              >
                Enregistrer
              </button>
              {emailSaved && <span className="text-xs" style={{ color: "#16A34A" }}>✓ Email enregistré</span>}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Fidélité client</div>
          <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
            <p className="text-xs" style={{ color: "#6B6558" }}>Donne 1 point de fidélité tous les X FCFA dépensés par un client. Laisse à 0 pour désactiver.</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={loyaltyDraft}
                onChange={(e) => setLoyaltyDraft(e.target.value)}
                placeholder="Ex : 1000"
                className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
              />
              <button onClick={() => setLoyaltyRate(parseInt(loyaltyDraft) || 0)} className="px-4 py-2 rounded-md text-sm font-medium" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
                Enregistrer
              </button>
            </div>
            {loyaltyRate > 0 && <p className="text-[10px]" style={{ color: "#16A34A" }}>✓ Actif : 1 point par {fmt(loyaltyRate)} FCFA dépensés. Visible sur chaque fiche client.</p>}
          </div>
        </div>
      )}

      {isAdmin && (() => {
        const allReviews = (clients || []).flatMap((c) => c.reviews || []);
        if (allReviews.length === 0) return null;
        const avg = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
        return (
          <div>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Avis clients</div>
            <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
              <span className="text-sm flex items-center gap-1.5" style={{ color: "#1B1F1C" }}><Star size={14} style={{ color: "#C08A3E" }} /> Note moyenne</span>
              <span style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-lg">{avg.toFixed(1)} / 5 <span className="text-xs" style={{ color: "#6B6558", fontFamily: "'Carlito', sans-serif" }}>({allReviews.length} avis)</span></span>
            </div>
          </div>
        );
      })()}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Format du ticket imprimé</div>
          <div className="grid grid-cols-3 gap-2">
            {[["58mm", "58 mm"], ["80mm", "80 mm"], ["a4", "A4 / normal"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setReceiptFormat(id)}
                className="py-2.5 rounded-lg text-sm"
                style={{ background: receiptFormat === id ? "#C08A3E22" : "#F0ECE3", border: `1px solid ${receiptFormat === id ? "#C08A3E" : "#DCD5C6"}`, color: receiptFormat === id ? "#C08A3E" : "#6B6558" }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Choisis le format de ta bobine d'imprimante thermique, ou "A4 / normal" pour une imprimante classique.</p>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Type de commerce</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(BUSINESS_TYPES).map(([key, v]) => (
            <button
              key={key}
              disabled={!isAdmin}
              onClick={() => setBusinessType(key)}
              className="p-3 rounded-lg text-left text-sm flex items-center gap-2 disabled:opacity-40"
              style={{ background: businessType === key ? "#C08A3E22" : "#F0ECE3", border: `1px solid ${businessType === key ? "#C08A3E" : "#DCD5C6"}`, color: "#1B1F1C" }}
            >
              <span>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Heures d'ouverture</div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs" style={{ color: "#6B6558" }}>Ouverture</label>
              <input
                type="time"
                value={hours?.open || "08:00"}
                onChange={(e) => setHours((h) => ({ ...(h || {}), open: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs" style={{ color: "#6B6558" }}>Fermeture</label>
              <input
                type="time"
                value={hours?.close || "18:00"}
                onChange={(e) => setHours((h) => ({ ...(h || {}), close: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
              />
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Accès vendeurs</div>
          <div className="space-y-2 mb-3">
            {sellers.length === 0 && <p className="text-xs" style={{ color: "#6B6558" }}>Aucun vendeur pour l'instant.</p>}
            {sellers.map((s) => (
              <div key={s.id} className="rounded-lg p-3" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2 flex-1 min-w-0">
                    <User size={14} style={{ color: "#16A34A" }} className="shrink-0" />
                    <input
                      value={s.name}
                      onChange={(e) => onRenameSeller(s.id, e.target.value)}
                      className="bg-transparent outline-none min-w-0 flex-1"
                      style={{ color: "#1B1F1C" }}
                    />
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={s.commission ?? 0}
                        onChange={(e) => onUpdateCommission(s.id, parseFloat(e.target.value) || 0)}
                        className="w-14 px-2 py-1 rounded-md text-sm text-right outline-none"
                        style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
                      />
                      <span className="text-xs" style={{ color: "#6B6558" }}>%</span>
                    </div>
                    <button onClick={() => onRemoveSeller(s.id)} className="text-xs" style={{ color: "#DC4C3C" }}><Trash2 size={14} /></button>
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={!!s.stockKeeper} onChange={(e) => onUpdatePerson("seller", s.id, { stockKeeper: e.target.checked })} className="w-4 h-4" />
                  <span className="text-[11px]" style={{ color: "#6B6558" }}>Magasinier : peut ajouter et modifier le stock, faire l'inventaire</span>
                </label>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[11px]" style={{ color: "#6B6558" }}>Taux horaire</span>
                  <input
                    type="number"
                    value={s.hourlyRate ?? 0}
                    onChange={(e) => onUpdateSellerHourlyRate(s.id, parseFloat(e.target.value) || 0)}
                    className="w-20 px-2 py-1 rounded-md text-sm text-right outline-none ml-auto"
                    style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
                  />
                  <span className="text-[11px]" style={{ color: "#6B6558" }}>FCFA/h</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #DCD5C6" }}>
                  <span className="text-[11px]" style={{ color: (s.loanBalance || 0) > 0 ? "#DC4C3C" : "#6B6558" }}>
                    {(s.loanBalance || 0) > 0 ? `Doit ${fmt(s.loanBalance)} FCFA` : "Aucun emprunt"}
                  </span>
                  <button
                    onClick={() => toggleLoanEditor("seller", s.id)}
                    className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                    style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#C08A3E" }}
                  >
                    <Banknote size={12} /> Emprunt
                  </button>
                </div>
                {loanEditing && loanEditing.type === "seller" && loanEditing.id === s.id && (
                  <div className="mt-2 space-y-1.5">
                    <input
                      type="number"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      placeholder="Montant (FCFA)"
                      className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
                    />
                    <input
                      value={loanNote}
                      onChange={(e) => setLoanNote(e.target.value)}
                      placeholder="Motif (optionnel)"
                      className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => submitLoan("emprunt")} className="flex-1 py-1.5 rounded-md text-xs" style={{ background: "#DC4C3C1A", color: "#DC4C3C" }}>
                        + Emprunt
                      </button>
                      <button onClick={() => submitLoan("remboursement")} className="flex-1 py-1.5 rounded-md text-xs" style={{ background: "#16A34A1A", color: "#16A34A" }}>
                        Remboursement
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du vendeur" className="flex-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
            <input
              type="number"
              value={newCommission}
              onChange={(e) => setNewCommission(e.target.value)}
              placeholder="%"
              className="w-16 px-2 py-2 rounded-md text-sm text-right outline-none"
              style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
            />
            <button
              disabled={!newName.trim()}
              onClick={() => { onAddSeller(newName.trim(), parseFloat(newCommission) || 0); setNewName(""); setNewCommission(""); }}
              className="px-3 py-2 rounded-md text-sm flex items-center gap-1 disabled:opacity-40"
              style={{ background: "#C08A3E", color: "#F0ECE3" }}
            >
              <UserPlus size={14} /> Créer
            </button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Le pourcentage définit la commission de ce vendeur sur ses propres ventes. Le taux horaire (optionnel) est multiplié par les heures travaillées (calculées depuis l'Agenda) pour le salaire fixe. Les deux sont utilisés dans l'onglet Paie.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Espace caisse</div>
          <div className="space-y-2 mb-3">
            {cashiers.length === 0 && <p className="text-xs" style={{ color: "#6B6558" }}>Aucun caissier pour l'instant.</p>}
            {cashiers.map((c) => (
              <div key={c.id} className="rounded-lg p-3" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center gap-2 flex-1 min-w-0">
                    <Receipt size={14} style={{ color: "#16A34A" }} className="shrink-0" />
                    <input
                      value={c.name}
                      onChange={(e) => onRenameCashier(c.id, e.target.value)}
                      className="bg-transparent outline-none min-w-0 flex-1"
                      style={{ color: "#1B1F1C" }}
                    />
                  </span>
                  <button onClick={() => onRemoveCashier(c.id)} className="text-xs" style={{ color: "#DC4C3C" }}><Trash2 size={14} /></button>
                </div>
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                  <input type="checkbox" checked={!!c.stockKeeper} onChange={(e) => onUpdatePerson("cashier", c.id, { stockKeeper: e.target.checked })} className="w-4 h-4" />
                  <span className="text-[11px]" style={{ color: "#6B6558" }}>Magasinier : peut ajouter et modifier le stock, faire l'inventaire</span>
                </label>
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-[11px]" style={{ color: "#6B6558" }}>Taux horaire</span>
                  <input
                    type="number"
                    value={c.hourlyRate ?? 0}
                    onChange={(e) => onUpdateCashierHourlyRate(c.id, parseFloat(e.target.value) || 0)}
                    className="w-20 px-2 py-1 rounded-md text-sm text-right outline-none ml-auto"
                    style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
                  />
                  <span className="text-[11px]" style={{ color: "#6B6558" }}>FCFA/h</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #DCD5C6" }}>
                  <span className="text-[11px]" style={{ color: (c.loanBalance || 0) > 0 ? "#DC4C3C" : "#6B6558" }}>
                    {(c.loanBalance || 0) > 0 ? `Doit ${fmt(c.loanBalance)} FCFA` : "Aucun emprunt"}
                  </span>
                  <button
                    onClick={() => toggleLoanEditor("cashier", c.id)}
                    className="text-[11px] px-2 py-1 rounded flex items-center gap-1"
                    style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#C08A3E" }}
                  >
                    <Banknote size={12} /> Emprunt
                  </button>
                </div>
                {loanEditing && loanEditing.type === "cashier" && loanEditing.id === c.id && (
                  <div className="mt-2 space-y-1.5">
                    <input
                      type="number"
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      placeholder="Montant (FCFA)"
                      className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}
                    />
                    <input
                      value={loanNote}
                      onChange={(e) => setLoanNote(e.target.value)}
                      placeholder="Motif (optionnel)"
                      className="w-full px-2 py-1.5 rounded-md text-xs outline-none"
                      style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => submitLoan("emprunt")} className="flex-1 py-1.5 rounded-md text-xs" style={{ background: "#DC4C3C1A", color: "#DC4C3C" }}>
                        + Emprunt
                      </button>
                      <button onClick={() => submitLoan("remboursement")} className="flex-1 py-1.5 rounded-md text-xs" style={{ background: "#16A34A1A", color: "#16A34A" }}>
                        Remboursement
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newCashierName} onChange={(e) => setNewCashierName(e.target.value)} placeholder="Nom du caissier" className="flex-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
            <button
              disabled={!newCashierName.trim()}
              onClick={() => { onAddCashier(newCashierName.trim()); setNewCashierName(""); }}
              className="px-3 py-2 rounded-md text-sm flex items-center gap-1 disabled:opacity-40"
              style={{ background: "#C08A3E", color: "#F0ECE3" }}
            >
              <UserPlus size={14} /> Créer
            </button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Le caissier peut valider les ventes et imprimer les tickets ; son nom apparaît sur chaque ticket.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Achats & fournisseurs</div>
          <button onClick={() => setShowPurchases(true)} className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#C08A3E" }}>
            <ShoppingBag size={15} /> Gérer les achats ({purchases.length})
          </button>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Caisse</div>
          <button onClick={() => setShowClosure(true)} className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#C08A3E" }}>
            <ClipboardList size={15} /> Clôturer la caisse
          </button>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Devis</div>
          <button onClick={() => setShowDevis(true)} className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#C08A3E" }}>
            <Receipt size={15} /> Créer un devis
          </button>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Alertes WhatsApp</div>
          <div className="flex flex-col gap-2">
            <WaAlertButtons
              phones={alertPhones}
              label="⚠️ Envoyer l'alerte stock bas"
              text={(() => {
                const low = products.filter((p) => !p.isService && p.stock <= p.threshold);
                return low.length === 0
                  ? `Stock de ${shopName || "mon commerce"} : aucun article en stock bas pour l'instant.`
                  : `⚠️ Stock bas — ${shopName || "mon commerce"}\n\n${low.map((p) => `• ${p.name} : ${p.stock} ${p.unit} restant(s)`).join("\n")}`;
              })()}
              className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
              style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#DC4C3C" }}
            />
            <WaAlertButtons
              phones={alertPhones}
              label="📊 Envoyer le rapport du jour"
              text={(() => {
                const { start, label } = periodRange("day");
                const todaySales = sales.filter((s) => new Date(s.date) >= start);
                const total = todaySales.reduce((s, v) => s + v.total, 0);
                return `📊 Rapport ${label} — ${shopName || "mon commerce"}\n\n${todaySales.length} vente(s)\nTotal : ${fmt(total)} FCFA`;
              })()}
              className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
              style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#16A34A" }}
            />
            {gerantEmail && (
              <>
                <button
                  onClick={() => {
                    const low = products.filter((p) => !p.isService && p.stock <= p.threshold);
                    const text = low.length === 0
                      ? `Stock de ${shopName || "mon commerce"} : aucun article en stock bas pour l'instant.`
                      : `⚠️ Stock bas — ${shopName || "mon commerce"}\n\n${low.map((p) => `• ${p.name} : ${p.stock} ${p.unit} restant(s)`).join("\n")}`;
                    window.open(`mailto:${gerantEmail}?subject=${encodeURIComponent(`Alerte stock bas — ${shopName || "KABATEC Consulting"}`)}&body=${encodeURIComponent(text)}`, "_blank");
                  }}
                  className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
                  style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#DC4C3C" }}
                >
                  <Send size={14} /> Envoyer l'alerte stock bas par email
                </button>
                <button
                  onClick={() => {
                    const { start, label } = periodRange("day");
                    const todaySales = sales.filter((s) => new Date(s.date) >= start);
                    const total = todaySales.reduce((s, v) => s + v.total, 0);
                    const text = `${todaySales.length} vente(s)\nTotal : ${fmt(total)} FCFA`;
                    window.open(`mailto:${gerantEmail}?subject=${encodeURIComponent(`Rapport ${label} — ${shopName || "KABATEC Consulting"}`)}&body=${encodeURIComponent(text)}`, "_blank");
                  }}
                  className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
                  style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#16A34A" }}
                >
                  <Send size={14} /> Envoyer le rapport du jour par email
                </button>
              </>
            )}
            <p className="text-[10px]" style={{ color: "#6B6558" }}>Ouvre WhatsApp (ou ton application email, si une adresse est renseignée ci-dessus) avec le message déjà prêt — choisis simplement à qui l'envoyer. L'envoi n'est pas automatique, il faut appuyer sur ce bouton.</p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Sauvegarde</div>
          <button
            onClick={() => {
              const backup = { shopName, businessType, exportedAt: new Date().toISOString(), products, sales, expenses, purchases, closures };
              const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `kabatec-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
            style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#C08A3E" }}
          >
            <RefreshCw size={15} /> Exporter toutes mes données
          </button>
          <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Télécharge un fichier de sauvegarde complet de ce commerce (produits, ventes, dépenses, achats, clôtures).</p>
        </div>
      )}

      {isAdmin && (
        <div>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="text-sm flex items-center gap-2" style={{ color: "#DC4C3C" }}>
              <Trash2 size={14} /> Réinitialiser le stock et l'historique
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: "#1B1F1C" }}>Sûr ?</span>
              <button onClick={() => { onReset(); setConfirming(false); }} className="text-sm px-3 py-1 rounded-md" style={{ background: "#DC4C3C", color: "#1B1F1C" }}>Oui, effacer</button>
              <button onClick={() => setConfirming(false)} className="text-sm px-3 py-1 rounded-md" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>Annuler</button>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <button onClick={onLeaveShop} className="text-sm flex items-center gap-2" style={{ color: "#6B6558" }}>
          <LogOut size={14} /> Changer de commerce
        </button>
      )}

      <p className="text-xs" style={{ color: "#6B6558" }}>Le stock et l'historique sont partagés entre tous les appareils. Chaque vente enregistrée garde la trace du vendeur qui l'a faite.</p>

      <div className="pt-2 flex flex-col items-center gap-2">
        <Logo size={28} />
      </div>

      {reportPeriod && (
        <DailyReportModal sales={sales} products={products} expenses={expenses} purchases={purchases} sellers={sellers} period={reportPeriod} gerantEmail={gerantEmail} alertPhones={alertPhones} onClose={() => setReportPeriod(null)} />
      )}
      {showPurchases && (
        <PurchasesModal products={products} purchases={purchases} onAdd={onAddPurchase} onDelete={onDeletePurchase} onClose={() => setShowPurchases(false)} />
      )}
      {showClosure && (
        <ClotureModal sales={sales} closures={closures} onSave={onAddClosure} onClose={() => setShowClosure(false)} />
      )}
      {showDevis && (
        <DevisModal products={products} clients={clients} shopName={shopName} receiptFormat={receiptFormat} onClose={() => setShowDevis(false)} />
      )}
    </div>
  );
}

/* ---------- App ---------- */
/* ---------- Bandeau d'installation PWA ----------
   S'affiche automatiquement dès l'ouverture du lien, sur n'importe quel écran,
   pour inciter à installer l'application sur l'écran d'accueil du téléphone.
   Fonctionne nativement sur Android/Chrome (bouton "Installer"). Sur iPhone,
   Safari ne permet pas ce déclenchement automatique : on affiche à la place
   le mode d'emploi manuel (Partager → Sur l'écran d'accueil).
-------------------------------------------------------------------------- */
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // déjà installée, rien à afficher

    if (isIOS()) {
      setVisible(true);
      return;
    }

    const onPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    const onInstalled = () => { setVisible(false); setDeferredPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!visible || dismissed) return;
    document.body.style.paddingTop = "60px";
    return () => { document.body.style.paddingTop = ""; };
  }, [visible, dismissed]);

  if (!visible || dismissed) return null;

  const handleInstallClick = async () => {
    if (isIOS()) { setShowIOSHelp(true); return; }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  return (
    <>
      <div
        className="fixed top-0 left-0 right-0 z-[100] px-4 py-3 flex items-center gap-3"
        style={{ background: "#C08A3E", color: "#F0ECE3" }}
      >
        <Package size={20} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight" style={{ fontFamily: "'Carlito', sans-serif" }}>
            Installe KABATEC Consulting sur ton téléphone
          </p>
          <p className="text-[11px] leading-tight opacity-80">Accès plus rapide, fonctionne même hors connexion</p>
        </div>
        <button
          onClick={handleInstallClick}
          className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ background: "#F0ECE3", color: "#1B1F1C" }}
        >
          Installer
        </button>
        <button onClick={() => setDismissed(true)} className="shrink-0" style={{ color: "#F0ECE3" }}>
          <X size={18} />
        </button>
      </div>

      {showIOSHelp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={() => setShowIOSHelp(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-6 space-y-3 text-center" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
            <Package size={22} style={{ color: "#C08A3E" }} className="mx-auto" />
            <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Installer sur iPhone</h3>
            <p className="text-sm text-left" style={{ color: "#1B1F1C" }}>
              1. Appuie sur l'icône <strong>Partager</strong> en bas de Safari (le carré avec la flèche)<br /><br />
              2. Fais défiler et choisis <strong>"Sur l'écran d'accueil"</strong><br /><br />
              3. Appuie sur <strong>"Ajouter"</strong> en haut à droite
            </p>
            <button onClick={() => setShowIOSHelp(false)} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: "#C08A3E", color: "#F0ECE3" }}>
              J'ai compris
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Rapport journalier automatique ---------- */
function periodRange(period) {
  const now = new Date();
  if (period === "week") {
    const start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0);
    return { start, label: "de la semaine" };
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, label: "du mois" };
  }
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  return { start, label: "du jour" };
}

function DailyReportModal({ sales, products, expenses, purchases, sellers, period = "day", gerantEmail, alertPhones, onClose }) {
  const { start, label } = periodRange(period);
  const inRange = (t) => new Date(t) >= start;
  const todaySales = sales.filter((s) => inRange(s.date));
  const todayExpenses = (expenses || []).filter((e) => inRange(e.date));
  const todayPurchases = (purchases || []).filter((p) => inRange(p.date));
  const total = todaySales.reduce((s, v) => s + v.total, 0);
  const totalExpenses = todayExpenses.reduce((s, v) => s + v.amount, 0);
  const totalPurchases = todayPurchases.reduce((s, v) => s + v.amount, 0);

  // Marge réelle = ventes - coût d'achat des articles vendus (quand le prix d'achat est connu) - achats enregistrés sur la période
  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const costOfSold = todaySales.reduce((s, sale) => s + sale.items.reduce((ss, it) => {
    const p = productById[it.id];
    return ss + (p?.costPrice ? p.costPrice * it.qty : 0);
  }, 0), 0);
  const margin = total - costOfSold - totalExpenses - totalPurchases;

  const productCount = {};
  todaySales.forEach((s) => s.items.forEach((it) => { productCount[it.name] = (productCount[it.name] || 0) + it.qty; }));
  const top = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const sellerTotals = {};
  todaySales.forEach((s) => { sellerTotals[s.sellerName] = (sellerTotals[s.sellerName] || 0) + s.total; });
  const topSeller = Object.entries(sellerTotals).sort((a, b) => b[1] - a[1])[0];

  const lowStock = products.filter((p) => !p.isService && p.stock <= p.threshold);

  // Mini graphique : total des ventes des 7 derniers jours
  const last7 = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const dayTotal = sales.filter((s) => s.date >= d.getTime() && s.date < next.getTime()).reduce((s, v) => s + v.total, 0);
      days.push({ label: d.toLocaleDateString("fr-FR", { weekday: "short" }), total: dayTotal });
    }
    return days;
  }, [sales]);
  const maxDay = Math.max(1, ...last7.map((d) => d.total));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#1B1F1Ccc" }}>
      <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-lg p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-lg">Rapport {label}</h2>
          <button onClick={onClose} style={{ color: "#6B6558" }}><X size={20} /></button>
        </div>
        <div className="text-center py-3">
          <div style={{ fontFamily: "'Carlito', sans-serif", color: "#C08A3E" }} className="text-3xl">{fmt(margin)} FCFA</div>
          <div className="text-xs mt-1" style={{ color: "#6B6558" }}>Marge nette estimée · {todaySales.length} vente{todaySales.length > 1 ? "s" : ""}, {fmt(total)} vendus</div>
          {(totalExpenses > 0 || totalPurchases > 0) && (
            <div className="text-[10px] mt-1" style={{ color: "#6B6558" }}>{fmt(totalExpenses)} dépenses, {fmt(totalPurchases)} achats déduits</div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "#16A34A" }}>Ventes des 7 derniers jours</p>
          <div className="flex items-end gap-1.5 h-16">
            {last7.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full rounded-t-sm" style={{ height: `${Math.max(4, (d.total / maxDay) * 48)}px`, background: "#C08A3E" }} />
                <span className="text-[9px]" style={{ color: "#6B6558" }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        {top.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "#16A34A" }}>Top produits</p>
            <div className="space-y-1">
              {top.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between text-sm" style={{ color: "#1B1F1C" }}>
                  <span>{name}</span>
                  <span style={{ fontFamily: "'Carlito', sans-serif", color: "#6B6558" }}>{qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {topSeller && sellers && sellers.length > 1 && (
          <div className="flex items-center justify-between text-sm p-2.5 rounded-lg" style={{ background: "#F0ECE3" }}>
            <span style={{ color: "#6B6558" }}>Meilleur vendeur</span>
            <span style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}>{topSeller[0]} · {fmt(topSeller[1])} FCFA</span>
          </div>
        )}

        {lowStock.length > 0 && (
          <div className="p-2.5 rounded-lg text-xs flex items-start gap-2" style={{ background: "#DC4C3C1A", color: "#DC4C3C" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{lowStock.length} article{lowStock.length > 1 ? "s" : ""} en stock bas : {lowStock.map((p) => p.name).join(", ")}</span>
          </div>
        )}
        <WaAlertButtons
          phones={alertPhones}
          label="💬 Envoyer ce rapport par WhatsApp"
          text={(() => {
            const lines = [
              `📊 Rapport ${label}`,
              `Marge nette estimée : ${fmt(margin)} FCFA`,
              `${todaySales.length} vente${todaySales.length > 1 ? "s" : ""}, ${fmt(total)} FCFA vendus`,
              top.length > 0 ? `Top produits : ${top.map(([n, q]) => `${n} (${q})`).join(", ")}` : null,
              topSeller ? `Meilleur vendeur : ${topSeller[0]} (${fmt(topSeller[1])} FCFA)` : null,
              lowStock.length > 0 ? `⚠️ Stock bas : ${lowStock.map((p) => p.name).join(", ")}` : null,
            ].filter(Boolean).join("\n");
            return lines;
          })()}
          className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
          style={{ background: "#25D36622", color: "#1B9E52", border: "1px solid #25D36655" }}
        />
        {gerantEmail && (
          <button
            onClick={() => {
              const lines = [
                `Marge nette estimée : ${fmt(margin)} FCFA`,
                `${todaySales.length} vente${todaySales.length > 1 ? "s" : ""}, ${fmt(total)} FCFA vendus`,
                top.length > 0 ? `Top produits : ${top.map(([n, q]) => `${n} (${q})`).join(", ")}` : null,
                topSeller ? `Meilleur vendeur : ${topSeller[0]} (${fmt(topSeller[1])} FCFA)` : null,
                lowStock.length > 0 ? `⚠️ Stock bas : ${lowStock.map((p) => p.name).join(", ")}` : null,
              ].filter(Boolean).join("\n");
              const subject = `Rapport ${label} — KABATEC Consulting`;
              window.open(`mailto:${gerantEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines)}`, "_blank");
            }}
            className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
            style={{ background: "#C08A3E1A", color: "#C08A3E", border: "1px solid #C08A3E55" }}
          >
            <Send size={14} /> Envoyer ce rapport par email
          </button>
        )}
        <button onClick={onClose} className="w-full py-2.5 rounded-lg text-sm" style={{ background: "#C08A3E", color: "#F0ECE3" }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function AppInner() {
  const pendingRef = useRef(new Map());
  const [syncTick, setSyncTick] = useState(0);
  const bumpSync = useCallback(() => setSyncTick((t) => t + 1), []);
  const online = useOnline();

  const [shopId, setShopId] = useState(null);
  const [shopIdLoaded, setShopIdLoaded] = useState(false);
  const [subBlocked, setSubBlocked] = useState(false);

  // Vérifie le statut d'abonnement du commerce : bloque intégralement l'accès
  // (y compris la connexion) dès que la période d'essai ou l'abonnement est expiré,
  // ou si aucune date d'abonnement n'est enregistrée pour ce commerce.
  const [subTick, setSubTick] = useState(0); // incrémenté pour relancer la vérification (renouvellement détecté sans recharger)
  useEffect(() => {
    if (!shopId || shopId === TEST_SHOP_CODE || shopId.startsWith(DEMO_PREFIX)) { setSubBlocked(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get(SHOPS_REGISTRY_KEY, true);
        const list = res ? JSON.parse(res.value) : [];
        const entry = list.find((s) => s.code === shopId);
        if (cancelled) return;
        if (!entry?.subscriptionUntil) {
          setSubBlocked(true);
        } else {
          setSubBlocked(new Date(entry.subscriptionUntil) < new Date());
        }
      } catch (e) {
        if (!cancelled) setSubBlocked(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shopId, subTick]);
  // Tant que l'accès est suspendu, on revérifie toutes les 15 s et au retour sur l'onglet :
  // dès que le développeur prolonge l'abonnement, le commerce se débloque tout seul.
  useEffect(() => {
    if (!subBlocked) return;
    const again = () => setSubTick((n) => n + 1);
    const id = setInterval(again, 15000);
    const onVis = () => { if (document.visibilityState === "visible") again(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [subBlocked]);
  const [newShopCode, setNewShopCode] = useState(null); // affiché juste après une création de commerce

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get("shopId", false);
        if (!cancelled) setShopId(res ? res.value : null);
      } catch (e) {
        if (!cancelled) setShopId(null);
      } finally {
        if (!cancelled) setShopIdLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const k = (name) => (shopId ? `${name}:${shopId}` : null);

  const [products, setProducts, productsLoaded] = useShared(k("products"), [], pendingRef, bumpSync);
  const [sales, setSales, salesLoaded] = useShared(k("sales"), [], pendingRef, bumpSync);
  const [businessType, setBusinessType, btLoaded] = useShared(k("businessType"), null, pendingRef, bumpSync);
  const [shopName, setShopName, shopNameLoaded] = useShared(k("shopName"), "", pendingRef, bumpSync);
  const [customCategories, setCustomCategories] = useShared(k("categories"), null, pendingRef, bumpSync);
  const categories = Array.isArray(customCategories) ? customCategories : (businessType && BUSINESS_TYPES[businessType] ? BUSINESS_TYPES[businessType].categories : []);
  const [lockMinutes, setLockMinutes] = useShared(k("lockMinutes"), 0, pendingRef, bumpSync);
  const [backupInfo, setBackupInfo] = useState(null);
  const [salesGoal, setSalesGoal] = useShared(k("salesGoal"), 0, pendingRef, bumpSync);
  const [customDepots, setCustomDepots] = useShared(k("depots"), null, pendingRef, bumpSync);
  const depots = Array.isArray(customDepots) && customDepots.length ? customDepots : DEFAULT_DEPOTS;
  const renameDepot = (oldName, newName) => {
    setCustomDepots(depots.map((d) => (d === oldName ? newName : d)));
    setProducts((ps) => ps.map((p) => ((p.depot || depots[0]) === oldName ? { ...p, depot: newName } : p)));
  };
  const renameCategory = (oldName, newName) => {
    setCustomCategories(categories.map((c) => (c === oldName ? newName : c)));
    setProducts((ps) => ps.map((p) => (p.category === oldName ? { ...p, category: newName } : p)));
  };
  const [adminPin, setAdminPin, pinLoaded] = useShared(k("adminPin"), null, pendingRef, bumpSync);
  const [sellers, setSellers, sellersLoaded] = useShared(k("sellers"), [], pendingRef, bumpSync);
  const [cashiers, setCashiers, cashiersLoaded] = useShared(k("cashiers"), [], pendingRef, bumpSync);
  const [clients, setClients, clientsLoaded] = useShared(k("clients"), [], pendingRef, bumpSync);
  const [hours, setHours, hoursLoaded] = useShared(k("hours"), { open: "08:00", close: "18:00" }, pendingRef, bumpSync);
  const [shopLocation, setShopLocation] = useShared(k("shopLocation"), null, pendingRef, bumpSync);
  const [shopLogoUrl, setShopLogoUrl] = useShared(k("shopLogo"), "", pendingRef, bumpSync);
  const [shifts, setShifts, shiftsLoaded] = useShared(k("shifts"), [], pendingRef, bumpSync);
  const [expenses, setExpenses, expensesLoaded] = useShared(k("expenses"), [], pendingRef, bumpSync);
  const [fedapayKey, setFedapayKey, fedapayKeyLoaded] = useShared(k("fedapayKey"), "", pendingRef, bumpSync);
  const [gerantEmail, setGerantEmail] = useShared(k("gerantEmail"), "", pendingRef, bumpSync);
  const [alertPhones, setAlertPhones] = useShared(k("alertPhones"), [], pendingRef, bumpSync);
  const [loyaltyRate, setLoyaltyRate] = useShared(k("loyaltyRate"), 0, pendingRef, bumpSync);
  const [purchases, setPurchases, purchasesLoaded] = useShared(k("purchases"), [], pendingRef, bumpSync);
  const [closures, setClosures, closuresLoaded] = useShared(k("closures"), [], pendingRef, bumpSync);
  const [receiptFormat, setReceiptFormat] = useShared(k("receiptFormat"), "58mm", pendingRef, bumpSync);

  const [tab, setTab] = useState("stock");
  const [modalProduct, setModalProduct] = useState(null);
  const [cart, setCart] = useState([]);
  const [receiptData, setReceiptData] = useState(null); // ticket à afficher après une vente
  const [currentUser, setCurrentUser] = useState(null); // { role: 'gerant'|'vendeur'|'caissier', name, id? }
  const [loginDate, setLoginDate] = useState(null); // date (jour) de la connexion en cours, pour la déconnexion automatique
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [pendingUser, setPendingUser] = useState(null); // utilisateur authentifié, en attente de signature
  const [pinPrompt, setPinPrompt] = useState(null); // 'create-gerant' | 'login-gerant' | 'login-vendeur' | 'create-vendeur' | 'login-caissier' | 'create-caissier'
  const [pinTarget, setPinTarget] = useState(null); // vendeur/caissier ciblé pour login/creation
  const [pinError, setPinError] = useState("");

  const isAdmin = currentUser?.role === "gerant";
  const currentPerson = currentUser && currentUser.id ? (currentUser.role === "vendeur" ? sellers : currentUser.role === "caissier" ? cashiers : []).find((x) => x.id === currentUser.id) : null;
  const isStockKeeper = !!(currentPerson && currentPerson.stockKeeper);
  const canStock = isAdmin || isStockKeeper;
  const updatePerson = (type, id, patch) => (type === "seller" ? setSellers : setCashiers)((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const ready = shopIdLoaded && !!shopId && productsLoaded && salesLoaded && btLoaded && shopNameLoaded && pinLoaded && sellersLoaded && cashiersLoaded && clientsLoaded && hoursLoaded && shiftsLoaded;

  // Première ouverture d'un commerce démo : on le pré-remplit une seule fois
  // avec des données fictives, pour montrer l'appli sans créer de vrai commerce.
  useEffect(() => {
    if (!ready || !shopId || !shopId.startsWith(DEMO_PREFIX) || businessType) return;
    setBusinessType("boutique");
    setShopName("Commerce Démo");
    setAdminPin("0000");
    const p1 = uid(), p2 = uid(), p3 = uid();
    setProducts([
      { id: p1, name: "Savon de toilette", category: "Divers", price: 500, costPrice: 300, stock: 24, unit: "u", threshold: 5 },
      { id: p2, name: "Huile 1L", category: "Divers", price: 1500, costPrice: 1100, stock: 10, unit: "u", threshold: 3 },
      { id: p3, name: "Riz 5kg", category: "Divers", price: 3500, costPrice: 2800, stock: 2, unit: "sac", threshold: 3 },
    ]);
    const demoClientId = uid();
    setClients([{ id: demoClientId, name: "Client démo", phone: "", notes: "", createdAt: Date.now(), reviews: [] }]);
    const now = Date.now();
    setSales([
      { id: uid(), items: [{ id: p1, name: "Savon de toilette", price: 500, unit: "u", qty: 2 }], total: 1000, date: now - 3600000, sellerName: "Gérant", sellerId: null, clientId: null, paymentMethod: "especes" },
      { id: uid(), items: [{ id: p2, name: "Huile 1L", price: 1500, unit: "u", qty: 1 }], total: 1500, date: now - 7200000, sellerName: "Gérant", sellerId: null, clientId: demoClientId, paymentMethod: "mobile_money" },
    ]);
  }, [ready, shopId, businessType]);

  // Déconnexion automatique quand une nouvelle version de l'app est déployée,
  // pour que chacun retombe sur l'écran de connexion et voie les changements.
  useEffect(() => {
    (async () => {
      try {
        let seenVersion = null;
        try {
          const res = await storage.get("appVersion", false);
          seenVersion = res ? JSON.parse(res.value) : null;
        } catch (e) {
          seenVersion = null;
        }
        if (seenVersion !== APP_VERSION) {
          setCurrentUser(null);
          setPendingUser(null);
          await storage.set("appVersion", JSON.stringify(APP_VERSION), false);
        }
      } catch (e) {}
    })();
  }, []);

  // Diffusion automatique de version : dès qu'un appareil charge la nouvelle
  // version (typiquement toi, juste après un déploiement), il publie ce numéro
  // dans un registre partagé. Tous les autres appareils déjà ouverts le
  // détectent en quelques secondes et se rechargent tout seuls sur la
  // nouvelle version — sans que personne n'ait besoin de fermer l'app.
  useEffect(() => {
    let cancelled = false;

    // Clé propre à Wuri (MTE Registre partage la même base mais a sa propre clé,
    // sinon les deux applications se renvoient mutuellement des rechargements).
    const VERSION_KEY = "latestAppVersion:wuri";
    // Compare deux numéros de version "3.4" vs "3.10" : > 0 si a est plus récent que b.
    const cmpVersion = (a, b) => {
      const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
      const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d;
      }
      return 0;
    };

    // Ne publie que si cette version est plus récente que celle déjà annoncée :
    // un vieil appareil resté sur une ancienne version ne peut plus "faire reculer" les autres.
    const publish = async () => {
      try {
        const res = await storage.get(VERSION_KEY, true);
        const current = res ? JSON.parse(res.value) : null;
        if (!current || cmpVersion(APP_VERSION, current) > 0) {
          await storage.set(VERSION_KEY, JSON.stringify(APP_VERSION), true);
        }
      } catch (e) {}
    };
    publish();

    // Vide le cache de l'application (service worker) avant de recharger, sinon
    // le rechargement ressert l'ancienne version depuis le cache du téléphone.
    const hardReload = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (e) {}
      window.location.reload();
    };

    const checkForUpdate = async () => {
      try {
        const res = await storage.get(VERSION_KEY, true);
        const latest = res ? JSON.parse(res.value) : null;
        if (!cancelled && latest && cmpVersion(latest, APP_VERSION) > 0) {
          hardReload();
        }
      } catch (e) {}
    };
    checkForUpdate();

    const interval = setInterval(checkForUpdate, 45000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Déconnexion automatique dès que l'app quitte complètement le premier plan
  // (fermeture réelle, ou passage en arrière-plan sur mobile) : au retour,
  // l'utilisateur doit ressaisir ses identifiants — jamais de reconnexion
  // automatique, même si le téléphone n'a pas été verrouillé entre-temps.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        setCurrentUser(null);
        setPendingUser(null);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Verrouillage automatique : après N minutes sans toucher l'écran, retour à l'écran de connexion.
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    if (!currentUser || !(Number(lockMinutes) > 0)) return;
    lastActivityRef.current = Date.now();
    const touch = () => { lastActivityRef.current = Date.now(); };
    const events = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= Number(lockMinutes) * 60000) {
        setCurrentUser(null);
        setPendingUser(null);
      }
    }, 10000);
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); clearInterval(timer); };
  }, [currentUser, lockMinutes]);

  // Sauvegarde : une copie complète du commerce, stockée sous la clé "backup:CODE".
  const backupKey = shopId ? `backup:${shopId}` : null;
  const makeBackup = async () => {
    if (!backupKey) return false;
    const data = { products, sales, clients, sellers, cashiers, shifts, expenses, purchases, closures, hours, salesGoal, categories: customCategories, depots: customDepots };
    const payload = { date: Date.now(), version: APP_VERSION, data };
    try {
      await storage.set(backupKey, JSON.stringify(payload), true);
      setBackupInfo({ date: payload.date, products: products.length, sales: sales.length });
      return true;
    } catch (e) { return false; }
  };
  const restoreBackup = async () => {
    if (!backupKey) return false;
    try {
      const res = await storage.get(backupKey, true);
      if (!res) return false;
      const { data } = JSON.parse(res.value);
      if (!data) return false;
      setProducts(data.products || []); setSales(data.sales || []); setClients(data.clients || []);
      setSellers(data.sellers || []); setCashiers(data.cashiers || []); setShifts(data.shifts || []);
      setExpenses(data.expenses || []); setPurchases(data.purchases || []); setClosures(data.closures || []);
      if (data.hours) setHours(data.hours);
      setSalesGoal(data.salesGoal || 0);
      setCustomCategories(data.categories ?? null); setCustomDepots(data.depots ?? null);
      return true;
    } catch (e) { return false; }
  };
  const autoBackupDone = useRef(false);
  useEffect(() => {
    if (!backupKey) return;
    (async () => {
      try {
        const res = await storage.get(backupKey, true);
        if (res) { const b = JSON.parse(res.value); setBackupInfo({ date: b.date, products: (b.data?.products || []).length, sales: (b.data?.sales || []).length }); }
      } catch (e) {}
    })();
  }, [backupKey]);
  useEffect(() => {
    if (!isAdmin || !ready || autoBackupDone.current || !backupKey || shopId === TEST_SHOP_CODE || shopId.startsWith(DEMO_PREFIX)) return;
    if (products.length === 0 && sales.length === 0) return;
    if (backupInfo && Date.now() - backupInfo.date < 20 * 3600 * 1000) { autoBackupDone.current = true; return; }
    autoBackupDone.current = true;
    makeBackup();
  }, [isAdmin, ready, backupKey, backupInfo]);

  const genShopCode = () => {
    const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${part()}-${part()}`;
  };

  const createShop = async () => {
    const code = genShopCode();
    setShopId(code);
    setNewShopCode(code);
    try { await storage.set("shopId", code, false); } catch (e) {}
  };

  // Ajoute ou met à jour l'entrée d'un commerce dans le registre central
  // (utilisé par l'espace développeur pour lister tous les commerces).
  const registerShopInRegistry = useCallback(async (code, type) => {
    if (!code) return;
    try {
      const res = await storage.get(SHOPS_REGISTRY_KEY, true);
      const list = res ? JSON.parse(res.value) : [];
      const existing = list.find((s) => s.code === code);
      const trialEnd = new Date(Date.now() + 3 * 86400000).toISOString(); // essai gratuit de 3 jours
      const next = existing
        ? list.map((s) => (s.code === code ? { ...s, businessType: type ?? s.businessType } : s))
        : [...list, { code, businessType: type ?? null, createdAt: new Date().toISOString(), subscriptionUntil: trialEnd }];
      await storage.set(SHOPS_REGISTRY_KEY, JSON.stringify(next), true);
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (shopId && businessType && shopId !== TEST_SHOP_CODE && !shopId.startsWith(DEMO_PREFIX)) registerShopInRegistry(shopId, businessType);
  }, [shopId, businessType, registerShopInRegistry]);

  // ---------- Commerces connus sur cet appareil (changer de commerce en un geste) ----------
  const [knownShops, setKnownShops] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get("knownShops", false);
        setKnownShops(res ? JSON.parse(res.value) : []);
      } catch (e) {}
    })();
  }, []);
  const forgetShop = useCallback((code) => {
    setKnownShops((prev) => {
      const next = prev.filter((s) => s.code !== code);
      storage.set("knownShops", JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, []);
  const rememberShop = useCallback((code, label) => {
    setKnownShops((prev) => {
      const next = [{ code, label: label || null, lastOpened: Date.now() }, ...prev.filter((s) => s.code !== code)].slice(0, 6);
      storage.set("knownShops", JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, []);
  // Garde le libellé (nom du commerce) à jour une fois connu, pour l'afficher dans le sélecteur rapide.
  useEffect(() => {
    if (shopId && shopName) rememberShop(shopId, shopName);
  }, [shopId, shopName, rememberShop]);

  // ---------- Empreinte digitale : identifiants enregistrés sur CET appareil, pour ce commerce ----------
  // Stockage local uniquement (jamais partagé) : une empreinte est propre à un appareil précis.
  const [biometricCreds, setBiometricCreds] = useState({}); // `${role}` ou `${role}:${id}` -> { credentialId, addedAt }
  const [biometricOffer, setBiometricOffer] = useState(null); // userKey en attente de proposition d'activation
  useEffect(() => {
    if (!shopId) return;
    (async () => {
      try {
        const res = await storage.get(`biometric:${shopId}`, false);
        setBiometricCreds(res ? JSON.parse(res.value) : {});
      } catch (e) {}
    })();
  }, [shopId]);
  const saveBiometricCred = useCallback((userKey, credentialId) => {
    setBiometricCreds((prev) => {
      const next = { ...prev, [userKey]: { credentialId, addedAt: Date.now() } };
      storage.set(`biometric:${shopId}`, JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, [shopId]);
  const removeBiometricCred = useCallback((userKey) => {
    setBiometricCreds((prev) => {
      const next = { ...prev };
      delete next[userKey];
      storage.set(`biometric:${shopId}`, JSON.stringify(next), false).catch(() => {});
      return next;
    });
  }, [shopId]);
  const enrollBiometric = async (userKey, userName) => {
    try {
      const credentialId = await registerBiometric(userKey, userName);
      saveBiometricCred(userKey, credentialId);
      return true;
    } catch (e) {
      return false;
    }
  };

  const joinShop = async (code) => {
    setShopId(code);
    rememberShop(code, null);
    try { await storage.set("shopId", code, false); } catch (e) {}
  };

  const leaveShop = async () => {
    setCurrentUser(null);
    setPendingUser(null);
    setShopId(null);
    try { await storage.delete("shopId", false); } catch (e) {}
  };

  // ---------- Durée de vie des démos (24 h) ----------
  const [demoLeft, setDemoLeft] = useState(null); // millisecondes restantes de la démo ouverte
  useEffect(() => {
    if (!shopId || !shopId.startsWith(DEMO_PREFIX)) { setDemoLeft(null); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const res = await storage.get(`demoCreated:${shopId}`, true);
        let started = res ? JSON.parse(res.value) : null;
        if (!started) { started = Date.now(); await storage.set(`demoCreated:${shopId}`, JSON.stringify(started), true); }
        const left = started + DEMO_TTL_MS - Date.now();
        if (cancelled) return;
        if (left <= 0) {
          await storage.deleteShopData(shopId);
          await leaveShop();
          window.alert("Cette démo a expiré (24 h) et ses données ont été supprimées. Tu peux en lancer une nouvelle.");
        } else {
          setDemoLeft(left);
        }
      } catch (e) {}
    };
    check();
    const timer = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [shopId]);
  // Nettoyage : toute démo dont les 24 h sont écoulées est supprimée, où qu'elle ait été ouverte.
  useEffect(() => {
    (async () => {
      try {
        const codes = await storage.listCodesWithPrefix(DEMO_PREFIX);
        for (const c of codes) {
          const res = await storage.get(`demoCreated:${c}`, true);
          const started = res ? JSON.parse(res.value) : null;
          if (started && Date.now() - started > DEMO_TTL_MS) await storage.deleteShopData(c);
        }
      } catch (e) {}
    })();
  }, []);

  // ---------- Mode démo ----------
  // Ouvre un commerce factice (jamais dans le registre public, jamais bloqué par
  // l'abonnement) pré-rempli de données fictives, pour montrer l'appli sans
  // toucher aux vraies données d'un commerce.
  const startDemo = async () => {
    const code = DEMO_PREFIX + Math.random().toString(36).slice(2, 6).toUpperCase();
    try { await storage.set(`demoCreated:${code}`, JSON.stringify(Date.now()), true); } catch (e) {}
    setShopId(code);
    try { await storage.set("shopId", code, false); } catch (e) {}
  };

  const isOpenNow = useMemo(() => {
    if (!hours?.open || !hours?.close) return null;
    const [oh, om] = hours.open.split(":").map(Number);
    const [ch, cm] = hours.close.split(":").map(Number);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;
    return closeMin > openMin ? nowMin >= openMin && nowMin < closeMin : nowMin >= openMin || nowMin < closeMin;
  }, [hours]);

  const lowStockCount = useMemo(() => products.filter((p) => !p.isService && p.stock <= p.threshold).length, [products]);

  const confirmSignature = async (signature) => {
    // Vérifie que la prise de service se fait bien sur place : on compare la
    // position GPS de l'appareil à celle du commerce (enregistrée une fois par
    // le gérant). Si la position est refusée/indisponible ou que l'emplacement
    // du commerce n'est pas encore défini, on laisse quand même signer mais on
    // le marque comme non vérifié pour que le gérant puisse le voir dans l'agenda.
    let locationFlag = "non_verifiee";
    let distance = null;
    let location = null;
    try {
      location = await getCurrentPosition();
      if (shopLocation) {
        distance = distanceMeters(location, shopLocation);
        locationFlag = distance <= SHOP_RADIUS_METERS ? "ok" : "hors_zone";
      }
    } catch (e) {
      locationFlag = "non_verifiee";
    }
    setShifts((prev) => [...prev, { id: uid(), personId: pendingUser.id || null, name: pendingUser.name, role: pendingUser.role, time: Date.now(), signature, location, distance, locationFlag }]);
    setCurrentUser(pendingUser);
    setLoginDate(new Date().toDateString());
    // Propose l'empreinte digitale si l'appareil la supporte et qu'elle n'est pas
    // déjà activée pour cette personne sur cet appareil.
    const userKey = pendingUser.role === "gerant" ? "gerant" : `${pendingUser.role}:${pendingUser.id}`;
    if (BIOMETRIC_SUPPORTED && !biometricCreds[userKey]) setBiometricOffer({ userKey, name: pendingUser.name });
    setPendingUser(null);
  };

  // ---------- Fin de service ----------
  // Même principe que la prise de service : signature + position GPS, mais pour
  // clôturer le shift en cours. Permet de calculer les heures travaillées (utilisées
  // dans l'onglet Paie) et évite qu'un shift reste ouvert indéfiniment.
  const [endingService, setEndingService] = useState(false);
  const confirmEndSignature = async (signature) => {
    let locationFlag = "non_verifiee";
    let distance = null;
    let location = null;
    try {
      location = await getCurrentPosition();
      if (shopLocation) {
        distance = distanceMeters(location, shopLocation);
        locationFlag = distance <= SHOP_RADIUS_METERS ? "ok" : "hors_zone";
      }
    } catch (e) {
      locationFlag = "non_verifiee";
    }
    setShifts((prev) => {
      let idx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const s = prev[i];
        if (!s.endTime && s.name === currentUser?.name && s.role === currentUser?.role) { idx = i; break; }
      }
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx] = { ...copy[idx], endTime: Date.now(), endSignature: signature, endLocation: location, endDistance: distance, endLocationFlag: locationFlag };
      return copy;
    });
    setEndingService(false);
    setCurrentUser(null);
  };

  // Déconnexion automatique à chaque nouvelle journée (mode test et vrais commerces).
  useEffect(() => {
    const checkNewDay = () => {
      if (currentUser && loginDate && new Date().toDateString() !== loginDate) {
        setCurrentUser(null);
        setPendingUser(null);
        setLoginDate(null);
      }
    };
    const id = setInterval(checkNewDay, 60000);
    checkNewDay();
    return () => clearInterval(id);
  }, [currentUser, loginDate]);

  // Rapport journalier automatique : une fois par jour, pour le gérant, après l'heure de fermeture.
  useEffect(() => {
    if (!isAdmin || isOpenNow !== false || !shopId) return;
    const checkKey = `dailyReportShown:${shopId}`;
    const todayStr = new Date().toDateString();
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get(checkKey, false);
        if (!cancelled && res?.value !== todayStr) {
          setShowDailyReport(true);
          await storage.set(checkKey, todayStr, false);
        }
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [isAdmin, isOpenNow, shopId]);

  useEffect(() => {
    const flush = async () => {
      if (!online || pendingRef.current.size === 0) return;
      for (const [key, val] of Array.from(pendingRef.current.entries())) {
        try {
          await storage.set(key, JSON.stringify(val), true);
          pendingRef.current.delete(key);
        } catch (e) { /* réessaiera */ }
      }
      bumpSync();
    };
    flush();
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    const interval = setInterval(flush, 8000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(interval); };
  }, [online, bumpSync]);

  const saveProduct = (p) => {
    if (subBlocked) return;
    setProducts((prev) => {
      const exists = prev.some((x) => x.id === p.id);
      return exists ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p];
    });
    setModalProduct(null);
  };

  const deleteProduct = (id) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setModalProduct(null);
  };

  const validateSale = (cartItems, total, clientId = null, paymentMethod = "especes") => {
    if (subBlocked) return;
    const saleDate = Date.now();

    // Pour les articles à codes uniques (ex: tickets WiFi), on pioche N codes
    // non utilisés et on les fige sur la vente — ils ne pourront plus resservir.
    const codesAssigned = {}; // productId -> [codes]
    setProducts((prev) => prev.map((p) => {
      const item = cartItems.find((i) => i.id === p.id);
      if (!item) return p;
      if (p.isService) return p;
      if (p.hasCodes) {
        const unused = (p.codes || []).filter((c) => !c.used);
        const toAssign = unused.slice(0, item.qty);
        codesAssigned[p.id] = toAssign.map((c) => c.code);
        const assignedIds = new Set(toAssign.map((c) => c.id));
        const newCodes = (p.codes || []).map((c) => (assignedIds.has(c.id) ? { ...c, used: true, usedAt: saleDate } : c));
        return { ...p, codes: newCodes, stock: newCodes.filter((c) => !c.used).length };
      }
      return { ...p, stock: Math.max(0, round3(p.stock - item.qty)) };
    }));

    const cartItemsWithCodes = cartItems.map((i) => (codesAssigned[i.id] ? { ...i, codes: codesAssigned[i.id] } : i));

    setSales((prev) => [...prev, { id: uid(), items: cartItemsWithCodes, total, date: saleDate, sellerName: currentUser?.name || "?", sellerId: currentUser?.id || null, clientId: clientId || null, paymentMethod }]);

    // Vente à crédit : la dette du client augmente du montant de la vente.
    if (paymentMethod === "credit" && clientId) {
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, creditBalance: (c.creditBalance || 0) + total } : c)));
    }

    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    setReceiptData({
      shopName: shopName,
      businessTypeLabel: businessType ? BUSINESS_TYPES[businessType].label : "",
      items: cartItemsWithCodes,
      total,
      date: saleDate,
      cashierName: currentUser?.name || "?",
      clientName: client ? client.name : null,
      clientPhone: client ? client.phone : null,
      paymentMethod,
    });
    setCart([]);
  };

  const addClient = (client) => setClients((prev) => [...prev, client]);
  const updateClient = (id, patch) => setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const recordClientPayment = (id, amount) => setClients((prev) => prev.map((c) => (c.id === id ? {
    ...c,
    creditBalance: Math.max(0, (c.creditBalance || 0) - amount),
    payments: [...(c.payments || []), { id: uid(), amount, date: Date.now() }],
  } : c)));
  const removeClient = (id) => setClients((prev) => prev.filter((c) => c.id !== id));

  const addPurchase = (purchase) => setPurchases((prev) => [...prev, { id: uid(), date: Date.now(), ...purchase }]);
  const deletePurchase = (id) => setPurchases((prev) => prev.filter((p) => p.id !== id));
  const addClosure = (closure) => setClosures((prev) => [...prev, { id: uid(), date: Date.now(), ...closure }]);

  const validateInventory = (diffs) => {
    setProducts((prev) => prev.map((p) => {
      const d = diffs.find((x) => x.id === p.id);
      return d ? { ...p, stock: d.counted } : p;
    }));
  };

  const resetAll = () => { setProducts([]); setSales([]); };

  // Avant d'ouvrir le clavier à code : si une empreinte est enregistrée sur CET appareil
  // pour cette personne, on tente d'abord le déverrouillage biométrique. En cas d'échec,
  // d'annulation ou d'absence d'empreinte enregistrée, on retombe sur le code à 4 chiffres.
  const requestGerantLogin = async () => {
    setPinError("");
    const cred = biometricCreds["gerant"];
    if (cred && BIOMETRIC_SUPPORTED) {
      try {
        if (await verifyBiometric(cred.credentialId)) { setPendingUser({ role: "gerant", name: "Gérant" }); return; }
      } catch (e) {}
    }
    setPinTarget(null);
    setPinPrompt("login-gerant");
  };
  const requestVendeurLogin = async (seller) => {
    setPinError("");
    const userKey = `vendeur:${seller.id}`;
    const cred = biometricCreds[userKey];
    if (cred && BIOMETRIC_SUPPORTED) {
      try {
        if (await verifyBiometric(cred.credentialId)) { setPendingUser({ role: "vendeur", name: seller.name, id: seller.id }); return; }
      } catch (e) {}
    }
    setPinTarget(seller);
    setPinPrompt("login-vendeur");
  };
  const requestCreateGerant = () => { setPinError(""); setPinPrompt("create-gerant"); };
  const requestCreateVendeur = (name, commission) => { setPinError(""); setPinTarget({ name, commission }); setPinPrompt("create-vendeur"); };

  const requestCaissierLogin = async (cashier) => {
    setPinError("");
    const userKey = `caissier:${cashier.id}`;
    const cred = biometricCreds[userKey];
    if (cred && BIOMETRIC_SUPPORTED) {
      try {
        if (await verifyBiometric(cred.credentialId)) { setPendingUser({ role: "caissier", name: cashier.name, id: cashier.id }); return; }
      } catch (e) {}
    }
    setPinTarget(cashier);
    setPinPrompt("login-caissier");
  };
  const requestCreateCaissier = (name) => { setPinError(""); setPinTarget({ name }); setPinPrompt("create-caissier"); };
  const removeCashier = (id) => setCashiers((prev) => prev.filter((c) => c.id !== id));
  const renameCashier = (id, name) => setCashiers((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));

  const removeSeller = (id) => setSellers((prev) => prev.filter((s) => s.id !== id));
  const updateSellerCommission = (id, commission) => setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, commission } : s)));
  const updateSellerSalary = (id, baseSalary) => setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, baseSalary } : s)));
  const updateSellerHourlyRate = (id, hourlyRate) => setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, hourlyRate } : s)));
  const renameSeller = (id, name) => setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  const updateCashierCommission = (id, commission) => setCashiers((prev) => prev.map((c) => (c.id === id ? { ...c, commission } : c)));
  const updateCashierSalary = (id, baseSalary) => setCashiers((prev) => prev.map((c) => (c.id === id ? { ...c, baseSalary } : c)));
  const updateCashierHourlyRate = (id, hourlyRate) => setCashiers((prev) => prev.map((c) => (c.id === id ? { ...c, hourlyRate } : c)));

  // Emprunts du personnel : avances sur salaire/commission, saisies par le gérant
  // uniquement. loanBalance = ce que la personne doit encore au commerce.
  const addSellerLoan = (id, amount, note) => setSellers((prev) => prev.map((s) => (s.id === id ? {
    ...s,
    loanBalance: (s.loanBalance || 0) + amount,
    loans: [...(s.loans || []), { id: uid(), amount, note: note || "", date: Date.now(), type: "emprunt" }],
  } : s)));
  const repaySellerLoan = (id, amount) => setSellers((prev) => prev.map((s) => (s.id === id ? {
    ...s,
    loanBalance: Math.max(0, (s.loanBalance || 0) - amount),
    loans: [...(s.loans || []), { id: uid(), amount, date: Date.now(), type: "remboursement" }],
  } : s)));
  const addCashierLoan = (id, amount, note) => setCashiers((prev) => prev.map((c) => (c.id === id ? {
    ...c,
    loanBalance: (c.loanBalance || 0) + amount,
    loans: [...(c.loans || []), { id: uid(), amount, note: note || "", date: Date.now(), type: "emprunt" }],
  } : c)));
  const repayCashierLoan = (id, amount) => setCashiers((prev) => prev.map((c) => (c.id === id ? {
    ...c,
    loanBalance: Math.max(0, (c.loanBalance || 0) - amount),
    loans: [...(c.loans || []), { id: uid(), amount, date: Date.now(), type: "remboursement" }],
  } : c)));

  // Limite d'essais : 5 codes faux de suite = pause d'une minute (protège contre le "tâtonnement" sur l'appareil).
  const pinFailsRef = useRef({ n: 0, until: 0 });
  const handlePinSubmit = async (code) => {
    const now = Date.now();
    if (pinFailsRef.current.until > now) { setPinError("Trop d'essais. Réessaie dans une minute."); return; }
    const fail = () => {
      pinFailsRef.current.n += 1;
      if (pinFailsRef.current.n >= 5) { pinFailsRef.current = { n: 0, until: Date.now() + 60000 }; setPinError("Trop d'essais. Réessaie dans une minute."); }
      else setPinError("Code incorrect");
    };
    const ok = () => { pinFailsRef.current = { n: 0, until: 0 }; };
    if (pinPrompt === "create-gerant") {
      setAdminPin(await hashPin(code, `${shopId}:gerant`));
      setPendingUser({ role: "gerant", name: "Gérant" });
      setPinPrompt(null);
    } else if (pinPrompt === "login-gerant") {
      if (await pinMatches(code, adminPin, `${shopId}:gerant`)) {
        ok();
        if (adminPin && !String(adminPin).startsWith("h1:") && !(shopId || "").startsWith(DEMO_PREFIX)) setAdminPin(await hashPin(code, `${shopId}:gerant`));
        setPendingUser({ role: "gerant", name: "Gérant" }); setPinPrompt(null);
      } else fail();
    } else if (pinPrompt === "login-vendeur") {
      if (await pinMatches(code, pinTarget.pin, `${shopId}:${pinTarget.id}`)) {
        ok();
        if (!String(pinTarget.pin).startsWith("h1:")) { const h = await hashPin(code, `${shopId}:${pinTarget.id}`); setSellers((prev) => prev.map((x) => (x.id === pinTarget.id ? { ...x, pin: h } : x))); }
        setPendingUser({ role: "vendeur", name: pinTarget.name, id: pinTarget.id }); setPinPrompt(null);
      } else fail();
    } else if (pinPrompt === "create-vendeur") {
      const id = uid();
      const seller = { id, name: pinTarget.name, pin: await hashPin(code, `${shopId}:${id}`), commission: pinTarget.commission || 0 };
      setSellers((prev) => [...prev, seller]);
      setPinPrompt(null);
    } else if (pinPrompt === "login-caissier") {
      if (await pinMatches(code, pinTarget.pin, `${shopId}:${pinTarget.id}`)) {
        ok();
        if (!String(pinTarget.pin).startsWith("h1:")) { const h = await hashPin(code, `${shopId}:${pinTarget.id}`); setCashiers((prev) => prev.map((x) => (x.id === pinTarget.id ? { ...x, pin: h } : x))); }
        setPendingUser({ role: "caissier", name: pinTarget.name, id: pinTarget.id }); setPinPrompt(null);
      } else fail();
    } else if (pinPrompt === "create-caissier") {
      const id = uid();
      const cashier = { id, name: pinTarget.name, pin: await hashPin(code, `${shopId}:${id}`) };
      setCashiers((prev) => [...prev, cashier]);
      setPinPrompt(null);
    }
  };

  if (!shopIdLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0ECE3" }}>
        <div style={{ color: "#16A34A", fontFamily: "'Carlito', sans-serif" }} className="text-sm animate-pulse">Ouverture du registre…</div>
      </div>
    );
  }

  if (!shopId) {
    return <ShopScreen onCreate={createShop} onJoin={joinShop} onDevOpen={joinShop} onDemo={startDemo} knownShops={knownShops} onForget={forgetShop} />;
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0ECE3" }}>
        <div style={{ color: "#16A34A", fontFamily: "'Carlito', sans-serif" }} className="text-sm animate-pulse">Ouverture du registre…</div>
      </div>
    );
  }

  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap');`;

  if (newShopCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
        <style>{fontImport}</style>
        <ShopCodeReveal code={newShopCode} onContinue={() => setNewShopCode(null)} />
      </div>
    );
  }

  if (!businessType) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
        <style>{fontImport}</style>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <Logo size={60} />
            <h1 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-2xl">KABATEC Consulting</h1>
            <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Choisis ton type de commerce pour commencer</p>
          </div>
          <div className="space-y-2">
            {Object.entries(BUSINESS_TYPES).map(([key, v]) => (
              <button key={key} onClick={() => { setBusinessType(key); requestCreateGerant(); }} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>
                <span className="text-xl">{v.icon}</span>
                <span style={{ fontFamily: "'Carlito', sans-serif" }}>{v.label}</span>
              </button>
            ))}
          </div>
        </div>
        {pinPrompt && (
          <PinPad title="Crée ton code gérant" subtitle="4 chiffres, à ne partager qu'avec toi-même" onSubmit={handlePinSubmit} onCancel={() => setPinPrompt(null)} error={pinError} />
        )}
      </div>
    );
  }

  if (subBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
        <style>{fontImport}</style>
        <div className="w-full max-w-sm space-y-4 text-center">
          <Logo size={56} />
          <div>
            <h1 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-xl">Abonnement requis</h1>
            <p className="text-sm mt-2" style={{ color: "#6B6558" }}>
              La période d'essai ou l'abonnement de ce commerce est arrivé à échéance.
              L'accès est suspendu jusqu'au renouvellement.
            </p>
          </div>
          <a
            href="https://wa.me/22871670258"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-3 rounded-lg text-sm font-medium"
            style={{ background: "#1B1F1C", color: "#F0ECE3" }}
          >
            Contacter Moïse Tech Énergie
          </a>
          <button
            onClick={() => setSubTick((n) => n + 1)}
            className="block w-full py-3 rounded-lg text-sm font-medium"
            style={{ background: "#F0ECE3", color: "#1B1F1C", border: "1px solid #C08A3E" }}
          >
            J'ai renouvelé : vérifier à nouveau
          </button>
          <button
            onClick={leaveShop}
            className="block w-full py-3 rounded-lg text-sm font-medium"
            style={{ background: "transparent", color: "#1B1F1C", border: "1px solid #DCD5C6" }}
          >
            ← Retour au menu
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <style>{fontImport}</style>
        <LoginScreen sellers={sellers} cashiers={cashiers} onPickGerant={requestGerantLogin} onPickVendeur={requestVendeurLogin} onPickCaissier={requestCaissierLogin} biometricCreds={biometricCreds} onBack={leaveShop} />
        {pinPrompt && (
          <PinPad
            title={pinPrompt === "login-vendeur" || pinPrompt === "login-caissier" ? `Code de ${pinTarget?.name}` : "Code gérant"}
            subtitle="Entre le code à 4 chiffres"
            onSubmit={handlePinSubmit}
            onCancel={() => setPinPrompt(null)}
            error={pinError}
          />
        )}
        {pendingUser && (
          <SignaturePad name={pendingUser.name} onSign={confirmSignature} onCancel={() => setPendingUser(null)} />
        )}
      </>
    );
  }

  const TABS = [
    { id: "stock", label: "Stock", icon: Package },
    { id: "vente", label: "Vente", icon: ShoppingCart },
    { id: "clients", label: "Clients", icon: Users },
    { id: "inventaire", label: "Inventaire", icon: ClipboardList },
    { id: "historique", label: "Historique", icon: History },
    { id: "agenda", label: "Agenda", icon: Clock },
    { id: "paie", label: "Paie", icon: Receipt },
    ...(isAdmin ? [{ id: "dashboard", label: "Bilan", icon: BarChart3 }] : []),
    { id: "reglages", label: "Réglages", icon: Settings },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#F0ECE3" }}>
      <style>{`
        ${fontImport}
        * { font-family: 'Carlito', sans-serif; }
        body { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {biometricOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#1B1F1Ccc" }}>
          <div className="w-full max-w-sm rounded-lg p-5 space-y-3 text-center" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
            <div className="mx-auto flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: "#C08A3E1A" }}>
              <ScanLine size={22} style={{ color: "#C08A3E" }} />
            </div>
            <h3 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-base">Activer l'empreinte sur cet appareil ?</h3>
            <p className="text-xs" style={{ color: "#6B6558" }}>
              La prochaine fois, {biometricOffer.name} pourra se connecter sur ce téléphone en un geste, sans taper de code. Le code à 4 chiffres reste toujours disponible en secours.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setBiometricOffer(null)}
                className="flex-1 py-2.5 rounded-md text-sm"
                style={{ background: "#F0ECE3", color: "#6B6558" }}
              >
                Plus tard
              </button>
              <button
                onClick={async () => {
                  const ok = await enrollBiometric(biometricOffer.userKey, biometricOffer.name);
                  setBiometricOffer(null);
                  if (!ok) alert("L'activation a échoué ou a été annulée. Le code à 4 chiffres reste disponible.");
                }}
                className="flex-1 py-2.5 rounded-md text-sm font-medium"
                style={{ background: "#C08A3E", color: "#FFFFFF" }}
              >
                Activer
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-10 px-4 pt-5 pb-3" style={{ background: "#1B1F1Cee", backdropFilter: "blur(6px)" }}>
        <div className="max-w-lg md:max-w-6xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 shrink-0">
            {shopLogoUrl ? (
              <img src={shopLogoUrl} alt={shopName || "Logo du commerce"} className="rounded-lg object-cover shrink-0" style={{ width: 34, height: 34, border: "1px solid #DCD5C6" }} />
            ) : (
              <Logo size={34} />
            )}
            <div>
              <h1 style={{ fontFamily: "'Carlito', sans-serif", color: "#1B1F1C" }} className="text-xl leading-tight">KABATEC Consulting</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs" style={{ color: "#16A34A" }}>{BUSINESS_TYPES[businessType].icon} {currentUser.name}</p>
                {isOpenNow !== null && (
                  <span className="text-[10px] px-2 py-1 rounded-full" style={{
                    background: isOpenNow ? "#16A34A1A" : "#DC4C3C1A",
                    color: isOpenNow ? "#16A34A" : "#DC4C3C",
                    border: `1px solid ${isOpenNow ? "#16A34A55" : "#DC4C3C55"}`,
                  }}>
                    {isOpenNow ? `Ouvert · ferme à ${hours.close}` : `Fermé · ouvre à ${hours.open}`}
                  </span>
                )}
                <SyncBadge online={online} pendingCount={pendingRef.current.size} />
                {shopId && shopId.startsWith(DEMO_PREFIX) && (
                  <span className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1" style={{ background: "#C08A3E1A", color: "#C08A3E", border: "1px solid #C08A3E55" }}>
                    <Sparkles size={11} /> DÉMO{demoLeft != null ? ` · ${Math.floor(demoLeft / 3600000)}h${String(Math.floor((demoLeft % 3600000) / 60000)).padStart(2, "0")}` : ""}
                  </span>
                )}
                {isAdmin && lowStockCount > 0 && (
                  <button
                    onClick={() => setTab("stock")}
                    className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1"
                    style={{ background: "#DC4C3C1A", color: "#DC4C3C", border: "1px solid #DC4C3C55" }}
                  >
                    <AlertTriangle size={11} /> {lowStockCount} en stock bas
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Navigation horizontale — visible uniquement sur grand écran (bureau) */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap"
                style={{
                  background: tab === id ? "#C08A3E1A" : "transparent",
                  color: tab === id ? "#C08A3E" : "#6B6558",
                  fontWeight: tab === id ? 600 : 400,
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-sm" style={{ color: "#1B1F1C", fontFamily: "'Carlito', sans-serif" }}>{currentUser.name}</p>
              <p className="text-[11px]" style={{ color: "#6B6558" }}>{isAdmin ? "Gérant" : isStockKeeper ? "Magasinier" : currentUser.role === "caissier" ? "Caissier" : "Vendeur"}</p>
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
              {currentUser.name?.[0]?.toUpperCase() || "?"}
            </div>
          </div>

          {tab === "stock" && canStock && (
            <button onClick={() => setModalProduct({})} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 md:hidden" style={{ background: "#C08A3E", color: "#F0ECE3" }}>
              <Plus size={20} />
            </button>
          )}
        </div>
      </header>

      {subBlocked && (
        <div className="px-4 py-2.5 text-xs text-center" style={{ background: "#DC4C3C", color: "#F0ECE3" }}>
          ⚠️ Abonnement expiré — accès en lecture seule. Contactez Moïse Tech Énergie pour réactiver le compte.
        </div>
      )}

      <main className="max-w-lg md:max-w-3xl mx-auto px-4 pb-4">
        {tab === "stock" && <StockTab alertPhones={alertPhones} canEdit={canStock} depots={depots} categories={categories} products={products} isAdmin={isAdmin} onOpenProduct={setModalProduct} onRequestGerant={() => { setCurrentUser(null); requestGerantLogin(); }} />}
        {tab === "vente" && <VenteTab categories={categories} products={products} cart={cart} setCart={setCart} onValidate={validateSale} clients={clients} onAddClient={addClient} fedapayKey={fedapayKey} shopName={shopName} />}
        {tab === "clients" && <ClientsTab shopName={shopName} clients={clients} sales={sales} isAdmin={isAdmin} onAddClient={addClient} onUpdateClient={updateClient} onRemoveClient={removeClient} onRecordPayment={recordClientPayment} loyaltyRate={loyaltyRate} />}
        {tab === "inventaire" && <InventaireTab products={products} isAdmin={canStock} onRequestGerant={() => { setCurrentUser(null); requestGerantLogin(); }} onValidateInventory={validateInventory} />}
        {tab === "historique" && <HistoriqueTab sales={sales} />}
        {tab === "agenda" && <AgendaTab shifts={shifts} />}
        {tab === "paie" && (
          <PaieTab
            sales={sales}
            sellers={sellers}
            cashiers={cashiers}
            shifts={shifts}
            currentUser={currentUser}
            isAdmin={isAdmin}
            expenses={expenses}
            onAddExpense={(e) => setExpenses((prev) => [...prev, e])}
            onDeleteExpense={(id) => setExpenses((prev) => prev.filter((e) => e.id !== id))}
          />
        )}
        {tab === "dashboard" && isAdmin && <DashboardTab sales={sales} products={products} goal={salesGoal} setGoal={setSalesGoal} />}
        {tab === "reglages" && (
          <ReglagesTab
            lockMinutes={lockMinutes}
            setLockMinutes={setLockMinutes}
            backupInfo={backupInfo}
            onBackup={makeBackup}
            onRestore={restoreBackup}
            onUpdatePerson={updatePerson}
            depots={depots}
            onSaveDepots={setCustomDepots}
            onRenameDepot={renameDepot}
            categories={categories}
            onSaveCategories={setCustomCategories}
            onRenameCategory={renameCategory}
            businessType={businessType}
            setBusinessType={setBusinessType}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onLogout={() => setCurrentUser(null)}
            onEndService={() => setEndingService(true)}
            sellers={sellers}
            onAddSeller={requestCreateVendeur}
            onRemoveSeller={removeSeller}
            onRenameSeller={renameSeller}
            onUpdateCommission={updateSellerCommission}
            onUpdateSellerHourlyRate={updateSellerHourlyRate}
            onAddSellerLoan={addSellerLoan}
            onRepaySellerLoan={repaySellerLoan}
            cashiers={cashiers}
            onAddCashier={requestCreateCaissier}
            onRemoveCashier={removeCashier}
            onRenameCashier={renameCashier}
            onUpdateCashierHourlyRate={updateCashierHourlyRate}
            onAddCashierLoan={addCashierLoan}
            onRepayCashierLoan={repayCashierLoan}
            onReset={resetAll}
            hours={hours}
            setHours={setHours}
            shopLocation={shopLocation}
            setShopLocation={setShopLocation}
            shopLogoUrl={shopLogoUrl}
            setShopLogoUrl={setShopLogoUrl}
            shopId={shopId}
            shopName={shopName}
            setShopName={setShopName}
            onLeaveShop={leaveShop}
            fedapayKey={fedapayKey}
            setFedapayKey={setFedapayKey}
            gerantEmail={gerantEmail}
            setGerantEmail={setGerantEmail}
            alertPhones={alertPhones}
            setAlertPhones={setAlertPhones}
            sales={sales}
            products={products}
            expenses={expenses}
            loyaltyRate={loyaltyRate}
            setLoyaltyRate={setLoyaltyRate}
            receiptFormat={receiptFormat}
            setReceiptFormat={setReceiptFormat}
            purchases={purchases}
            onAddPurchase={addPurchase}
            onDeletePurchase={deletePurchase}
            closures={closures}
            onAddClosure={addClosure}
            clients={clients}
          />
        )}
      </main>

      {receiptData && <ReceiptModal receipt={receiptData} onClose={() => setReceiptData(null)} format={receiptFormat} />}

      <nav className="fixed bottom-0 left-0 right-0 z-10 md:hidden" style={{ background: "#FFFFFF", borderTop: "1px solid #DCD5C6" }}>
        <div className="max-w-lg mx-auto grid" style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className="flex flex-col items-center gap-1 py-2.5">
              <Icon size={17} style={{ color: tab === id ? "#C08A3E" : "#16A34A" }} />
              <span className="text-[9px]" style={{ color: tab === id ? "#C08A3E" : "#16A34A" }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {modalProduct !== null && (
        <ProductModal product={modalProduct.id ? modalProduct : null} canDelete={isAdmin} depots={depots} categories={categories} businessType={businessType} shopId={shopId} onSave={saveProduct} onDelete={deleteProduct} onClose={() => setModalProduct(null)} />
      )}

      {pinPrompt && (
        <PinPad
          title={pinPrompt === "create-vendeur" || pinPrompt === "create-caissier" ? `Code pour ${pinTarget?.name}` : "Code gérant"}
          subtitle={pinPrompt.startsWith("create") ? "4 chiffres, à ne partager qu'avec la bonne personne" : "Entre le code à 4 chiffres"}
          onSubmit={handlePinSubmit}
          onCancel={() => setPinPrompt(null)}
          error={pinError}
        />
      )}

      {showDailyReport && (
        <DailyReportModal sales={sales} products={products} expenses={expenses} gerantEmail={gerantEmail} alertPhones={alertPhones} onClose={() => setShowDailyReport(false)} />
      )}

      {endingService && currentUser && (
        <SignaturePad
          name={currentUser.name}
          title="Signature de fin de service"
          confirmLabel="Signer et terminer"
          onSign={confirmEndSignature}
          onCancel={() => setEndingService(false)}
        />
      )}
    </div>
  );
}

/* ---------- Écran d'accueil animé, affiché brièvement à l'ouverture ---------- */
function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{ background: "#1B1F1C" }}
    >
      <style>{`
        @keyframes wuriLogoIn {
          0% { opacity: 0; transform: scale(0.7); }
          60% { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes wuriTextIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .wuri-splash-logo { animation: wuriLogoIn 0.7s cubic-bezier(.34,1.56,.64,1) both; }
        .wuri-splash-text { animation: wuriTextIn 0.6s ease both; animation-delay: 0.5s; }
      `}</style>
      <div className="wuri-splash-logo">
        <Logo size={84} />
      </div>
      <p className="wuri-splash-text mt-5 text-lg" style={{ fontFamily: "'Carlito', sans-serif", color: "#F0ECE3" }}>
        Bienvenue chez KABATEC Consulting
      </p>
      <p className="wuri-splash-text mt-1 text-xs" style={{ color: "#8A6A2E" }}>
        Gestion de commerce, simplement
      </p>
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  return (
    <>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      <InstallBanner />
      <AppInner />
    </>
  );
}
