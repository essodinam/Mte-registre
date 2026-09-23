/**
 * Wuri
 * Application de gestion de stock et de ventes.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Minus, Trash2, Package, ShoppingCart, History, Settings, AlertTriangle, X, Check, Lock, LogOut, ClipboardList, WifiOff, RefreshCw, UserPlus, User, Clock, PenTool, Receipt, Wrench, Wine, ShoppingBag, Hammer, Users, Phone } from "lucide-react";
import { storage } from "./storage.js";

/* ---------- Design tokens ----------
Encre  : #F0ECE3 (fond)
Surface: #FFFFFF
Laiton : #C08A3E (accent primaire, prix / actions)
Sauge  : #16A34A (accent secondaire, validations)
Parchemin: #1B1F1C (texte principal)
Rouille: #DC4C3C (alertes / stock bas)
Display: 'Fraunces', serif — Mono: 'IBM Plex Mono' — Corps: 'Inter'
Signature : le "registre" — chaque ligne ressemble à une ligne de grand livre,
avec reliure cousue sur le bord gauche.
------------------------------------ */

const BUSINESS_TYPES = {
  boutique: { label: "Boutique", icon: "🛍️", categories: ["Vêtements", "Accessoires", "Divers"] },
  bar: { label: "Bar / Restauration", icon: "🍷", categories: ["Boissons", "Plats", "Snacks"] },
  menuiserie: { label: "Menuiserie", icon: "🪵", categories: ["Bois", "Panneaux", "Quincaillerie bois", "Outils"] },
  quincaillerie: { label: "Quincaillerie", icon: "🔩", categories: ["Outillage", "Fixations", "Peinture", "Électricité", "Plomberie"] },
};

/* ---------- Code d'accès pour créer un nouveau commerce ----------
   Personne ne peut créer son propre commerce sans ce code : c'est TOI (le gérant
   de Moïse Tech Énergie) qui le communique, une fois que tu as fait la démo et
   que le commerçant a confirmé vouloir s'abonner. Change cette valeur quand tu veux.
------------------------------------------------------------------- */
const OWNER_ACCESS_PIN = "0635Lemon@";

/* ---------- Espace développeur : voir tous les commerces créés ----------
   Code séparé du PIN gérant ci-dessus. Change-le aussi quand tu veux.
------------------------------------------------------------------- */
const DEV_ACCESS_PIN = "0635DevMTE@";
const SHOPS_REGISTRY_KEY = "shops_registry";
const TEST_SHOP_CODE = "TEST-MTE-DEV"; // commerce factice, réservé au développeur, jamais visible des clients

/* ---------- Version de l'application ----------
   Change cette valeur à chaque mise à jour que tu déploies (ex: "1.1", "1.2"...).
   Dès qu'un utilisateur rouvre l'app et que cette version ne correspond plus à
   celle qu'il avait la dernière fois, il est automatiquement déconnecté et
   renvoyé à l'écran de connexion — il voit alors la nouvelle version.
------------------------------------------------------------------- */
const APP_VERSION = "2.0";

const fmt = (n) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- Logo Moïse Tech Énergie ---------- */
function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="224" height="224" rx="44" fill="#1B1F1C" />
      <text
        x="120" y="165"
        textAnchor="middle"
        fontFamily="Georgia, 'Fraunces', serif"
        fontWeight="700"
        fontSize="138"
        fill="#F0ECE3"
      >
        W
      </text>
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
      <span className="text-xs w-6 text-right shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#16A34A" }}>
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
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">{title}</h3>
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
function PasswordGate({ title, subtitle, onSubmit, onCancel, error }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-6 space-y-4 text-center" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <Lock size={22} style={{ color: "#1B1F1C" }} className="mx-auto" />
        <div>
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: "#6B6558" }}>{subtitle}</p>}
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value) onSubmit(value); }}
          autoFocus
          className="w-full px-4 py-3 rounded-lg text-center outline-none text-lg"
          style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
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
        <button onClick={onCancel} className="text-xs" style={{ color: "#6B6558" }}>Annuler</button>
      </div>
    </div>
  );
}
function SignaturePad({ name, onSign, onCancel }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);

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
  const confirm = () => {
    if (empty) return;
    onSign(canvasRef.current.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }}>
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="text-center">
          <PenTool size={20} style={{ color: "#C08A3E" }} className="mx-auto" />
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg mt-1">Signature de prise de service</h3>
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
          <button onClick={clear} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>Effacer</button>
          <button
            disabled={empty}
            onClick={confirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "#C08A3E", color: "#F0ECE3" }}
          >
            Signer et commencer
          </button>
        </div>
        <button onClick={onCancel} className="w-full text-xs" style={{ color: "#6B6558" }}>Annuler</button>
      </div>
    </div>
  );
}

/* ---------- Vitrine des catégories de commerce (écran d'accueil) ---------- */
const IMG_MENUISERIE = "data:image/jpeg;base64,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BERAREQEREBERAREQEREBERAREQEREBERAREQEREHwgOBBAIO8Fc8x+jp6PaSZlPGImOZG8tbuvZ24cF0RUPakf7RSnthYP4XqfJ9VOP7IyYASZCLaA2He4KsbWRtOOVAOoIbe/qhWJj3TTmRzS0OMYAPdc3Vc2odmx6o7mgfwhQj1VFBgjkYG2AD22Hiv0W3zByX54aLzN77FfoZn9m3kF6MHn5fx6REW0RERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAVE2o/vG7lF8HK9qp7U4RWyVnl9NCZ4zkztYes3Lxtx8NVjOWz0px2TL2rMAcZGB3CTL7GqsbQuD9oKlw3ZiPYAFaQ6NlbTNaQQ7pHXB42VSxgj9M1Ov7QqE9PS04LvlgAHpAe9fohos0DuXG9mNisUxeoiqXxmmpGyB/SyCxeL36o489y7Kr4TUefkst9CIi2kIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiCJxPZyhxKQVGXoKpoOWeMa+I3HxUbheweHUdfJiFaRW1LnlzczLMZybrc81aEXNTt3d1p8AAFhoF9RF1wREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQf/9k=";
const IMG_BOUTIQUE = "data:image/jpeg;base64,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";
const IMG_BAR = "data:image/jpeg;base64,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";
const IMG_QUINCAILLERIE = "data:image/jpeg;base64,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";

const CATEGORY_SHOWCASE = [
  { key: "quincaillerie", label: "Quincaillerie", image: IMG_QUINCAILLERIE },
  { key: "bar", label: "Bar / Restauration", image: IMG_BAR },
  { key: "boutique", label: "Boutique", image: IMG_BOUTIQUE },
  { key: "menuiserie", label: "Menuiserie", image: IMG_MENUISERIE },
];

function CategoryShowcase() {
  return (
    <div className="grid grid-cols-2 gap-2.5 mb-1">
      {CATEGORY_SHOWCASE.map(({ key, label, image }) => (
        <div
          key={key}
          className="aspect-square rounded-xl overflow-hidden relative"
          style={{ border: "1px solid #DCD5C6" }}
        >
          <img
            src={image}
            alt={label}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, transparent 40%, #1B1F1CCC 100%)" }}
          />
          <span
            className="absolute bottom-0 left-0 right-0 text-[11px] text-center px-2 py-2 leading-tight"
            style={{ color: "#F0ECE3", fontFamily: "'Fraunces', serif" }}
          >
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

  const handlePin = async (pin) => {
    if (pin !== DEV_ACCESS_PIN) { setError("Code incorrect."); return; }
    setGate(false);
    setError("");
    try {
      const res = await storage.get(SHOPS_REGISTRY_KEY, true);
      const list = res ? JSON.parse(res.value) : [];
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setShops(list);
    } catch (e) {
      setLoadError("Impossible de charger la liste des commerces.");
      setShops([]);
    }
  };

  const saveSubscription = async (code, dateValue) => {
    const iso = dateValue ? new Date(dateValue).toISOString() : null;
    const next = shops.map((s) => (s.code === code ? { ...s, subscriptionUntil: iso } : s));
    setShops(next);
    setEditingCode(null);
    try {
      await storage.set(SHOPS_REGISTRY_KEY, JSON.stringify(next), true);
    } catch (e) {}
  };

  const extendOneMonth = (s) => {
    const base = s.subscriptionUntil && new Date(s.subscriptionUntil) > new Date() ? new Date(s.subscriptionUntil) : new Date();
    base.setMonth(base.getMonth() + 1);
    saveSubscription(s.code, base.toISOString().slice(0, 10));
  };

  const exportShopData = async (code) => {
    const keys = ["products", "sales", "businessType", "shopName", "sellers", "cashiers", "clients", "hours", "shifts", "expenses"];
    const data = { code, exportedAt: new Date().toISOString() };
    for (const name of keys) {
      try {
        const res = await storage.get(`${name}:${code}`, true);
        data[name] = res ? JSON.parse(res.value) : null;
      } catch (e) {
        data[name] = null;
      }
    }
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
        onCancel={onClose}
        error={error}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#1B1F1Ccc" }}>
      <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-lg p-5 space-y-3" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">
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
        {loadError && <p className="text-xs" style={{ color: "#DC4C3C" }}>{loadError}</p>}
        {shops && shops.length === 0 && !loadError && (
          <p className="text-xs" style={{ color: "#6B6558" }}>Aucun commerce enregistré pour l'instant.</p>
        )}
        <div className="space-y-2">
          {shops && shops.map((s) => {
            const status = getSubscriptionStatus(s.subscriptionUntil);
            const isEditing = editingCode === s.code;
            return (
              <div key={s.code} className="rounded-lg p-3" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => onOpenShop(s.code)} className="text-left flex-1">
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E", letterSpacing: "0.1em" }} className="block text-sm">{s.code}</span>
                    <span className="text-xs block mt-0.5" style={{ color: "#6B6558" }}>
                      {BUSINESS_TYPES[s.businessType]?.label || "Type non défini"}
                      {s.createdAt ? ` · créé le ${new Date(s.createdAt).toLocaleDateString("fr-FR")}` : ""}
                    </span>
                  </button>
                  <span style={{ color: "#16A34A" }} className="text-xs shrink-0 ml-2">Ouvrir →</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #DCD5C6" }}>
                  <span className="text-[11px]" style={{ color: status.color }}>{status.label}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => exportShopData(s.code)} className="text-[11px] px-2 py-1 rounded" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#6B6558" }}>
                      Export
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
function ShopScreen({ onCreate, onJoin, onDevOpen }) {
  const [mode, setMode] = useState(null); // null | 'join'
  const [code, setCode] = useState("");
  const [ownerGate, setOwnerGate] = useState(false);
  const [ownerError, setOwnerError] = useState("");
  const [devPanel, setDevPanel] = useState(false);

  const handleOwnerPin = (pin) => {
    if (pin === OWNER_ACCESS_PIN) {
      setOwnerGate(false);
      setOwnerError("");
      onCreate();
    } else {
      setOwnerError("Code incorrect.");
    }
  };

  if (mode === "join") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <Logo size={56} />
            <h1 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-2xl">Wuri</h1>
            <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Code de ton commerce</p>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex : AB12-CD34"
            className="w-full px-4 py-3 rounded-lg text-center outline-none text-lg tracking-widest"
            style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
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
        <div className="text-center">
          <Logo size={60} />
          <h1 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-2xl">Wuri</h1>
          <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Bienvenue</p>
        </div>
        <div className="space-y-2">
          <button onClick={() => setMode("join")} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55", color: "#1B1F1C" }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#1B1F1C", color: "#F0ECE3" }}><User size={16} /></span>
            <span>
              <span style={{ fontFamily: "'Fraunces', serif" }} className="block">Rejoindre un commerce</span>
              <span className="text-xs block mt-0.5" style={{ color: "#6B6558" }}>J'ai déjà un code</span>
            </span>
          </button>
        </div>
        <button onClick={() => setOwnerGate(true)} className="w-full text-center text-xs pt-1" style={{ color: "#8A6A2E" }}>
          Espace gérant — créer un commerce
        </button>
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
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">Ton commerce est créé</h3>
          <p className="text-xs mt-1" style={{ color: "#6B6558" }}>Note ce code : il te servira à connecter tes autres appareils et employés à ce même registre.</p>
        </div>
        <div className="py-3 rounded-lg text-xl tracking-[0.3em]" style={{ background: "#F0ECE3", border: "1px solid #C08A3E55", color: "#8A6A2E", fontFamily: "'IBM Plex Mono', monospace" }}>
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

function LoginScreen({ sellers, cashiers, onPickGerant, onPickVendeur, onPickCaissier }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F0ECE3" }}>
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <Logo size={56} />
          <h1 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-2xl">Wuri</h1>
          <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Qui utilise l'application ?</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onPickGerant}
            className="aspect-square rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center"
            style={{ background: "#C08A3E1A", border: "2px solid #C08A3E", color: "#1B1F1C" }}
          >
            <Lock size={22} style={{ color: "#8A6A2E" }} />
            <span style={{ fontFamily: "'Fraunces', serif" }} className="text-sm font-semibold">Gérant</span>
          </button>
          {sellers.map((s) => (
            <button
              key={s.id}
              onClick={() => onPickVendeur(s)}
              className="aspect-square rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center"
              style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
            >
              <User size={22} style={{ color: "#6B6558" }} />
              <span style={{ fontFamily: "'Fraunces', serif" }} className="text-sm font-semibold">{s.name}</span>
            </button>
          ))}
          {cashiers.map((c) => (
            <button
              key={c.id}
              onClick={() => onPickCaissier(c)}
              className="aspect-square rounded-xl flex flex-col items-center justify-center gap-2 p-3 text-center"
              style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
            >
              <Receipt size={22} style={{ color: "#6B6558" }} />
              <span style={{ fontFamily: "'Fraunces', serif" }} className="text-sm font-semibold">{c.name}</span>
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
function StockTab({ products, isAdmin, onOpenProduct, onRequestGerant }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [products, query]
  );
  const lowStock = products.filter((p) => p.stock <= p.threshold);

  return (
    <div className="space-y-4">
      {lowStock.length > 0 && (
        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: "#DC4C3C1A", border: "1px solid #DC4C3C55" }}>
          <AlertTriangle size={18} style={{ color: "#DC4C3C" }} className="shrink-0 mt-0.5" />
          <div style={{ color: "#1B1F1C" }} className="text-sm">
            <span className="font-semibold" style={{ color: "#DC4C3C" }}>{lowStock.length} article{lowStock.length > 1 ? "s" : ""}</span> en stock bas : {lowStock.map((p) => p.name).join(", ")}
          </div>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un article…"
        className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
        style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}
      />

      <Ledger>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>
            Aucun article. {isAdmin ? "Ajoute ton premier produit avec le bouton +." : "Le gérant n'a pas encore ajouté d'articles."}
          </div>
        ) : (
          filtered.map((p, i) => (
            <Row key={p.id} n={i + 1}>
              <button onClick={() => isAdmin && onOpenProduct(p)} className="flex-1 flex items-center justify-between text-left">
                <div>
                  <div style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{p.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{p.category}</div>
                </div>
                <div className="text-right">
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: p.stock <= p.threshold ? "#DC4C3C" : "#1B1F1C" }} className="text-sm">
                    {p.stock} {p.unit}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }} className="text-xs mt-0.5">
                    {fmt(p.price)} FCFA
                  </div>
                </div>
              </button>
            </Row>
          ))
        )}
      </Ledger>

      {!isAdmin && (
        <button onClick={onRequestGerant} className="w-full flex items-center justify-center gap-2 text-xs py-2" style={{ color: "#16A34A" }}>
          <Lock size={12} /> Ajout et modification réservés au gérant
        </button>
      )}
    </div>
  );
}

function ProductModal({ product, businessType, onSave, onDelete, onClose }) {
  const isNew = !product?.id;
  const [form, setForm] = useState(
    product || { id: uid(), name: "", category: BUSINESS_TYPES[businessType].categories[0], price: "", stock: "", unit: "u", threshold: 3 }
  );
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.price !== "" && form.stock !== "";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "#00000088" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">{isNew ? "Nouvel article" : "Modifier l'article"}</h3>
          <button onClick={onClose}><X size={20} style={{ color: "#6B6558" }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Nom</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} placeholder="Ex : Vis 4x40, Planche chêne…" />
          </div>

          <div>
            <label className="text-xs" style={{ color: "#6B6558" }}>Catégorie</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>
              {BUSINESS_TYPES[businessType].categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Prix de vente (FCFA)</label>
              <input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Unité</label>
              <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="u, kg, m…" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C" }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Quantité en stock</label>
              <input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "#6B6558" }}>Seuil d'alerte</label>
              <input type="number" value={form.threshold} onChange={(e) => set("threshold", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          {!isNew && (
            <button onClick={() => onDelete(form.id)} className="px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm" style={{ background: "#DC4C3C1A", color: "#DC4C3C", border: "1px solid #DC4C3C55" }}>
              <Trash2 size={16} /> Supprimer
            </button>
          )}
          <button
            disabled={!valid}
            onClick={() => onSave({ ...form, price: parseFloat(form.price) || 0, stock: parseInt(form.stock) || 0, threshold: parseInt(form.threshold) || 0 })}
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
function ReceiptModal({ receipt, onClose }) {
  const { shopName, businessTypeLabel, items, total, date, cashierName, clientName } = receipt;
  const d = new Date(date);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={onClose}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .mte-receipt, .mte-receipt * { visibility: visible; }
          .mte-receipt { position: fixed; inset: 0; margin: auto; }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mte-receipt w-full max-w-xs rounded-xl p-5 space-y-3"
        style={{ background: "#EDE6D6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
      >
        <div className="text-center space-y-0.5">
          <p className="text-base font-semibold" style={{ fontFamily: "'Fraunces', serif" }}>{shopName || "Mon commerce"}</p>
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
        </div>
        <p className="text-[9px] text-center opacity-60 pt-1">Merci de votre confiance</p>

        <div className="flex gap-2 pt-2" style={{ colorScheme: "light" }}>
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
function ClientDetail({ client, sales, isAdmin, onUpdate, onRemove, onClose }) {
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone || "");
  const [notes, setNotes] = useState(client.notes || "");
  const [confirming, setConfirming] = useState(false);

  const purchases = sales.filter((s) => s.clientId === client.id).sort((a, b) => b.date - a.date);
  const totalSpent = purchases.reduce((s, p) => s + p.total, 0);

  const save = () => {
    onUpdate(client.id, { name: name.trim() || client.name, phone: phone.trim(), notes: notes.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "#00000099" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">Fiche client</h3>
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
            <p style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-base">{client.name}</p>
            {client.phone && <p className="text-sm mt-0.5 flex items-center gap-1.5" style={{ color: "#6B6558" }}><Phone size={12} /> {client.phone}</p>}
          </div>
        )}

        <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#C08A3E1A" }}>
          <span className="text-sm" style={{ color: "#1B1F1C" }}>Total dépensé</span>
          <span style={{ fontFamily: "'Fraunces', serif", color: "#C08A3E" }} className="text-lg">{fmt(totalSpent)} FCFA</span>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6B6558" }}>Historique d'achats ({purchases.length})</p>
          <div className="space-y-2">
            {purchases.length === 0 && <p className="text-xs" style={{ color: "#6B6558" }}>Aucun achat enregistré pour ce client.</p>}
            {purchases.map((s) => (
              <div key={s.id} className="p-2.5 rounded-lg text-sm" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
                <div className="flex items-center justify-between">
                  <span style={{ color: "#1B1F1C" }}>{new Date(s.date).toLocaleDateString("fr-FR")}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }}>{fmt(s.total)} FCFA</span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{s.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
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

function ClientsTab({ clients, sales, isAdmin, onAddClient, onUpdateClient, onRemoveClient }) {
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
                  <div style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{c.name}</div>
                  {c.phone && <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{c.phone}</div>}
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }} className="text-sm">{fmt(spentByClient[c.id] || 0)} FCFA</span>
              </button>
            </Row>
          ))
        )}
      </Ledger>

      {openClient && (
        <ClientDetail
          client={openClient}
          sales={sales}
          isAdmin={isAdmin}
          onUpdate={onUpdateClient}
          onRemove={onRemoveClient}
          onClose={() => setOpenClient(null)}
        />
      )}
    </div>
  );
}

function VenteTab({ products, cart, setCart, onValidate, clients, onAddClient }) {
  const [clientId, setClientId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");

  const add = (p) => setCart((c) => {
    const existing = c.find((i) => i.id === p.id);
    if (existing) {
      if (existing.qty >= p.stock) return c;
      return c.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
    }
    return p.stock > 0 ? [...c, { id: p.id, name: p.name, price: p.price, unit: p.unit, qty: 1 }] : c;
  });
  const dec = (id) => setCart((c) => c.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0));
  const inc = (id) => setCart((c) => {
    const product = products.find((p) => p.id === id);
    if (!product) return c;
    return c.map((i) => (i.id === id ? { ...i, qty: i.qty < product.stock ? i.qty + 1 : i.qty } : i));
  });
  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
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

  const handleValidate = () => {
    onValidate(cart, total, clientId);
    setClientId(null);
  };

  return (
    <div className="space-y-4 pb-24">
      <Ledger>
        {products.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#16A34A99" }}>Le gérant n'a pas encore ajouté d'articles.</div>
        ) : (
          products.map((p, i) => (
            <Row key={p.id} n={i + 1}>
              <button onClick={() => add(p)} disabled={p.stock === 0} className="flex-1 flex items-center justify-between text-left disabled:opacity-30">
                <div>
                  <div style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{p.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{p.stock} {p.unit} dispo</div>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }} className="text-sm">{fmt(p.price)} FCFA</span>
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
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span style={{ color: "#1B1F1C" }}>{i.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => dec(i.id)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#DCD5C6", color: "#1B1F1C" }}><Minus size={12} /></button>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B1F1C" }} className="w-5 text-center">{i.qty}</span>
                  <button onClick={() => inc(i.id)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#DCD5C6", color: "#1B1F1C" }}><Plus size={12} /></button>
                </div>
              </div>
            ))}

            <button onClick={() => setPickerOpen(true)} className="w-full flex items-center justify-between py-1.5 text-sm" style={{ color: "#6B6558" }}>
              <span className="flex items-center gap-1.5"><Users size={13} /> Client</span>
              <span style={{ color: selectedClient ? "#C08A3E" : "#6B6558" }}>{selectedClient ? selectedClient.name : "Anonyme ›"}</span>
            </button>

            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#DCD5C6" }}>
              <span style={{ color: "#6B6558" }} className="text-sm">Total</span>
              <span style={{ fontFamily: "'Fraunces', serif", color: "#C08A3E" }} className="text-xl">{fmt(total)} FCFA</span>
            </div>
            <button onClick={handleValidate} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2" style={{ background: "#16A34A", color: "#F0ECE3" }}>
              <Check size={16} /> Valider la vente
            </button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6" style={{ background: "#00000099" }} onClick={() => setPickerOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-5 space-y-3" style={{ background: "#FFFFFF" }}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">Choisir un client</h3>
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
    </div>
  );
}

/* ---------- Inventaire ---------- */
function InventaireTab({ products, isAdmin, onRequestGerant, onValidateInventory }) {
  const [counts, setCounts] = useState({});
  const [started, setStarted] = useState(false);

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
        <button onClick={begin} className="text-sm px-5 py-2.5 rounded-lg" style={{ background: "#C08A3E", color: "#F0ECE3" }}>Commencer l'inventaire</button>
      </div>
    );
  }

  const diffs = products.map((p) => {
    const counted = counts[p.id] === "" ? 0 : parseInt(counts[p.id] ?? p.stock) || 0;
    return { ...p, counted, diff: counted - p.stock };
  });
  const changed = diffs.filter((d) => d.diff !== 0);

  return (
    <div className="space-y-4 pb-6">
      <Ledger>
        {diffs.map((p, i) => (
          <Row key={p.id} n={i + 1}>
            <div className="flex-1 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }} className="text-[15px] truncate">{p.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>Enregistré : {p.stock} {p.unit}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={counts[p.id] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                  className="w-16 px-2 py-1.5 rounded-md text-sm text-right outline-none"
                  style={{ background: "#F0ECE3", border: `1px solid ${p.diff !== 0 ? "#C08A3E" : "#DCD5C6"}`, color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
                />
                {p.diff !== 0 && (
                  <span className="text-xs w-10 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: p.diff > 0 ? "#16A34A" : "#DC4C3C" }}>
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
    const header = ["Date", "Heure", "Vendeur", "Articles", "Total"];
    const rows = [...sales].sort((a, b) => a.date - b.date).map((s) => {
      const d = new Date(s.date);
      const articles = s.items.map((it) => `${it.qty}x ${it.name}`).join(" | ");
      return [
        d.toLocaleDateString("fr-FR"),
        d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        s.sellerName,
        articles,
        s.total,
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
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }} className="text-xs">{fmt(dayTotal)} FCFA</span>
            </div>
            <Ledger>
              {list.map((s, i) => (
                <Row key={s.id} n={i + 1}>
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <div style={{ color: "#1B1F1C" }} className="text-sm">{s.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>{new Date(s.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {s.sellerName}</div>
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B1F1C" }} className="text-sm">{fmt(s.total)} FCFA</span>
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
                    <div style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{s.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>
                      {s.role === "gerant" ? "Gérant" : "Vendeur"} · connecté à {new Date(s.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
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
  const { seller, salesCount, total, commission, amount } = data;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "#00000088" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">Bulletin de paie</h3>
            <p className="text-xs mt-0.5 capitalize" style={{ color: "#6B6558" }}>{monthLabel(year, month)}</p>
          </div>
          <button onClick={onClose}><X size={20} style={{ color: "#6B6558" }} /></button>
        </div>

        <Ledger>
          <Row n={1}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#6B6558" }}>Vendeur</span>
              <span style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }}>{seller.name}</span>
            </div>
          </Row>
          <Row n={2}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#6B6558" }}>Ventes réalisées</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B1F1C" }}>{salesCount}</span>
            </div>
          </Row>
          <Row n={3}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#6B6558" }}>Chiffre d'affaires généré</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B1F1C" }}>{fmt(total)} FCFA</span>
            </div>
          </Row>
          <Row n={4}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#6B6558" }}>Taux de commission</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#1B1F1C" }}>{commission}%</span>
            </div>
          </Row>
        </Ledger>

        <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55" }}>
          <span className="text-sm" style={{ color: "#1B1F1C" }}>Montant à verser</span>
          <span style={{ fontFamily: "'Fraunces', serif", color: "#C08A3E" }} className="text-xl">{fmt(amount)} FCFA</span>
        </div>

        <p className="text-[10px]" style={{ color: "#16A34A" }}>
          Calcul basé sur les ventes enregistrées dans Wuri pour la période sélectionnée — document indicatif à intégrer dans ta comptabilité.
        </p>

        <button onClick={() => window.print()} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>
          Imprimer / Exporter en PDF
        </button>
      </div>
    </div>
  );
}

function PaieTab({ sales, sellers, currentUser, isAdmin, expenses, onAddExpense, onDeleteExpense }) {
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

  const rows = useMemo(() => {
    const list = isAdmin ? sellers : sellers.filter((s) => s.id === currentUser?.id);
    return list.map((s) => {
      const own = periodSales.filter((sale) => (sale.sellerId ? sale.sellerId === s.id : sale.sellerName === s.name));
      const total = own.reduce((sum, sale) => sum + sale.total, 0);
      const commission = s.commission || 0;
      return { seller: s, salesCount: own.length, total, commission, amount: (total * commission) / 100 };
    });
  }, [sellers, periodSales, isAdmin, currentUser]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "#FFFFFF", color: "#1B1F1C", border: "1px solid #DCD5C6" }}>‹</button>
        <span style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-sm capitalize">{monthLabel(year, month)}</span>
        <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "#FFFFFF", color: "#1B1F1C", border: "1px solid #DCD5C6" }}>›</button>
      </div>

      {isAdmin && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "#6B6558" }}>Ventes du mois</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#16A34A" }}>{fmt(totalSalesPeriod)} FCFA</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "#6B6558" }}>Dépenses du mois</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#DC4C3C" }}>− {fmt(totalExpensesPeriod)} FCFA</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2" style={{ borderTop: "1px solid #DCD5C6" }}>
            <span style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }}>Bilan net</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }}>{fmt(totalSalesPeriod - totalExpensesPeriod)} FCFA</span>
          </div>
        </div>
      )}

      {sellers.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: "#16A34A99" }}>Aucun vendeur enregistré pour l'instant.</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: "#16A34A99" }}>Aucun accès vendeur à afficher.</div>
      ) : (
        <Ledger>
          {rows.map((r, i) => (
            <Row key={r.seller.id} n={i + 1}>
              <button onClick={() => setOpenSlip(r)} className="flex-1 flex items-center justify-between text-left">
                <div>
                  <div style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{r.seller.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#6B6558" }}>
                    {r.salesCount} vente{r.salesCount > 1 ? "s" : ""} · {fmt(r.total)} FCFA vendus · {r.commission}%
                  </div>
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }} className="text-sm">{fmt(r.amount)} FCFA</div>
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
              style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
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
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#DC4C3C" }} className="text-sm">{fmt(e.amount)} FCFA</span>
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

/* ---------- Réglages ---------- */
function ReglagesTab({ businessType, setBusinessType, isAdmin, currentUser, onLogout, sellers, onAddSeller, onRemoveSeller, onRenameSeller, onUpdateCommission, cashiers, onAddCashier, onRemoveCashier, onRenameCashier, onReset, hours, setHours, shopId, shopName, setShopName, onLeaveShop, sales, products, expenses }) {
  const [confirming, setConfirming] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCommission, setNewCommission] = useState("");
  const [newCashierName, setNewCashierName] = useState("");
  const [reportPeriod, setReportPeriod] = useState(null);

  return (
    <div className="space-y-6">
      <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "#1B1F1C" }}>
          <User size={16} style={{ color: "#C08A3E" }} />
          Connecté en tant que <span style={{ fontFamily: "'Fraunces', serif" }}>{currentUser?.name}</span>
        </div>
        <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded-md flex items-center gap-1" style={{ background: "#DCD5C6", color: "#1B1F1C" }}>
          <LogOut size={12} /> Changer
        </button>
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
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E", letterSpacing: "0.15em" }} className="text-sm">{shopId}</span>
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
                style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs" style={{ color: "#6B6558" }}>Fermeture</label>
              <input
                type="time"
                value={hours?.close || "18:00"}
                onChange={(e) => setHours((h) => ({ ...(h || {}), close: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
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
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
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
                      style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
                    />
                    <span className="text-xs" style={{ color: "#6B6558" }}>%</span>
                  </div>
                  <button onClick={() => onRemoveSeller(s.id)} className="text-xs" style={{ color: "#DC4C3C" }}><Trash2 size={14} /></button>
                </div>
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
              style={{ background: "#F0ECE3", border: "1px solid #DCD5C6", color: "#1B1F1C", fontFamily: "'IBM Plex Mono', monospace" }}
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
          <p className="text-[10px] mt-1.5" style={{ color: "#6B6558" }}>Le pourcentage définit la commission de ce vendeur sur ses propres ventes, utilisée dans l'onglet Paie.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#16A34A" }}>Espace caisse</div>
          <div className="space-y-2 mb-3">
            {cashiers.length === 0 && <p className="text-xs" style={{ color: "#6B6558" }}>Aucun caissier pour l'instant.</p>}
            {cashiers.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#F0ECE3", border: "1px solid #DCD5C6" }}>
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
        <DailyReportModal sales={sales} products={products} expenses={expenses} period={reportPeriod} onClose={() => setReportPeriod(null)} />
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
          <p className="text-sm font-semibold leading-tight" style={{ fontFamily: "'Fraunces', serif" }}>
            Installe Wuri sur ton téléphone
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
            <h3 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">Installer sur iPhone</h3>
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

function DailyReportModal({ sales, products, expenses, period = "day", onClose }) {
  const { start, label } = periodRange(period);
  const inRange = (t) => new Date(t) >= start;
  const todaySales = sales.filter((s) => inRange(s.date));
  const todayExpenses = (expenses || []).filter((e) => inRange(e.date));
  const total = todaySales.reduce((s, v) => s + v.total, 0);
  const totalExpenses = todayExpenses.reduce((s, v) => s + v.amount, 0);
  const productCount = {};
  todaySales.forEach((s) => s.items.forEach((it) => { productCount[it.name] = (productCount[it.name] || 0) + it.qty; }));
  const top = Object.entries(productCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const lowStock = products.filter((p) => p.stock <= p.threshold);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#1B1F1Ccc" }}>
      <div className="w-full max-w-sm rounded-lg p-5 space-y-4" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6" }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-lg">Rapport {label}</h2>
          <button onClick={onClose} style={{ color: "#6B6558" }}><X size={20} /></button>
        </div>
        <div className="text-center py-3">
          <div style={{ fontFamily: "'Fraunces', serif", color: "#C08A3E" }} className="text-3xl">{fmt(total - totalExpenses)} FCFA</div>
          <div className="text-xs mt-1" style={{ color: "#6B6558" }}>Bilan net · {todaySales.length} vente{todaySales.length > 1 ? "s" : ""}, {fmt(total)} vendus, {fmt(totalExpenses)} dépensés</div>
        </div>
        {top.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "#16A34A" }}>Top produits</p>
            <div className="space-y-1">
              {top.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between text-sm" style={{ color: "#1B1F1C" }}>
                  <span>{name}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6B6558" }}>{qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {lowStock.length > 0 && (
          <div className="p-2.5 rounded-lg text-xs flex items-start gap-2" style={{ background: "#DC4C3C1A", color: "#DC4C3C" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{lowStock.length} article{lowStock.length > 1 ? "s" : ""} en stock bas : {lowStock.map((p) => p.name).join(", ")}</span>
          </div>
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
  useEffect(() => {
    if (!shopId || shopId === TEST_SHOP_CODE) { setSubBlocked(false); return; }
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
  }, [shopId]);
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
  const [adminPin, setAdminPin, pinLoaded] = useShared(k("adminPin"), null, pendingRef, bumpSync);
  const [sellers, setSellers, sellersLoaded] = useShared(k("sellers"), [], pendingRef, bumpSync);
  const [cashiers, setCashiers, cashiersLoaded] = useShared(k("cashiers"), [], pendingRef, bumpSync);
  const [clients, setClients, clientsLoaded] = useShared(k("clients"), [], pendingRef, bumpSync);
  const [hours, setHours, hoursLoaded] = useShared(k("hours"), { open: "08:00", close: "18:00" }, pendingRef, bumpSync);
  const [shifts, setShifts, shiftsLoaded] = useShared(k("shifts"), [], pendingRef, bumpSync);
  const [expenses, setExpenses, expensesLoaded] = useShared(k("expenses"), [], pendingRef, bumpSync);

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
  const ready = shopIdLoaded && !!shopId && productsLoaded && salesLoaded && btLoaded && shopNameLoaded && pinLoaded && sellersLoaded && cashiersLoaded && clientsLoaded && hoursLoaded && shiftsLoaded;

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

    const publish = async () => {
      try { await storage.set("latestAppVersion", JSON.stringify(APP_VERSION), true); } catch (e) {}
    };
    publish();

    const checkForUpdate = async () => {
      try {
        const res = await storage.get("latestAppVersion", true);
        const latest = res ? JSON.parse(res.value) : null;
        if (!cancelled && latest && latest !== APP_VERSION) {
          window.location.reload();
        }
      } catch (e) {}
    };

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
    if (shopId && businessType && shopId !== TEST_SHOP_CODE) registerShopInRegistry(shopId, businessType);
  }, [shopId, businessType, registerShopInRegistry]);

  const joinShop = async (code) => {
    setShopId(code);
    try { await storage.set("shopId", code, false); } catch (e) {}
  };

  const leaveShop = async () => {
    setCurrentUser(null);
    setPendingUser(null);
    setShopId(null);
    try { await storage.delete("shopId", false); } catch (e) {}
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

  const lowStockCount = useMemo(() => products.filter((p) => p.stock <= p.threshold).length, [products]);

  const confirmSignature = (signature) => {
    setShifts((prev) => [...prev, { id: uid(), name: pendingUser.name, role: pendingUser.role, time: Date.now(), signature }]);
    setCurrentUser(pendingUser);
    setLoginDate(new Date().toDateString());
    setPendingUser(null);
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

  const validateSale = (cartItems, total, clientId = null) => {
    if (subBlocked) return;
    const saleDate = Date.now();
    setSales((prev) => [...prev, { id: uid(), items: cartItems, total, date: saleDate, sellerName: currentUser?.name || "?", sellerId: currentUser?.id || null, clientId: clientId || null }]);
    setProducts((prev) => prev.map((p) => {
      const item = cartItems.find((i) => i.id === p.id);
      return item ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p;
    }));
    const client = clientId ? clients.find((c) => c.id === clientId) : null;
    setReceiptData({
      shopName: shopName,
      businessTypeLabel: businessType ? BUSINESS_TYPES[businessType].label : "",
      items: cartItems,
      total,
      date: saleDate,
      cashierName: currentUser?.name || "?",
      clientName: client ? client.name : null,
    });
    setCart([]);
  };

  const addClient = (client) => setClients((prev) => [...prev, client]);
  const updateClient = (id, patch) => setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeClient = (id) => setClients((prev) => prev.filter((c) => c.id !== id));

  const validateInventory = (diffs) => {
    setProducts((prev) => prev.map((p) => {
      const d = diffs.find((x) => x.id === p.id);
      return d ? { ...p, stock: d.counted } : p;
    }));
  };

  const resetAll = () => { setProducts([]); setSales([]); };

  const requestGerantLogin = () => { setPinError(""); setPinTarget(null); setPinPrompt("login-gerant"); };
  const requestVendeurLogin = (seller) => { setPinError(""); setPinTarget(seller); setPinPrompt("login-vendeur"); };
  const requestCreateGerant = () => { setPinError(""); setPinPrompt("create-gerant"); };
  const requestCreateVendeur = (name, commission) => { setPinError(""); setPinTarget({ name, commission }); setPinPrompt("create-vendeur"); };

  const requestCaissierLogin = (cashier) => { setPinError(""); setPinTarget(cashier); setPinPrompt("login-caissier"); };
  const requestCreateCaissier = (name) => { setPinError(""); setPinTarget({ name }); setPinPrompt("create-caissier"); };
  const removeCashier = (id) => setCashiers((prev) => prev.filter((c) => c.id !== id));
  const renameCashier = (id, name) => setCashiers((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));

  const removeSeller = (id) => setSellers((prev) => prev.filter((s) => s.id !== id));
  const updateSellerCommission = (id, commission) => setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, commission } : s)));
  const renameSeller = (id, name) => setSellers((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));

  const handlePinSubmit = (code) => {
    if (pinPrompt === "create-gerant") {
      setAdminPin(code);
      setPendingUser({ role: "gerant", name: "Gérant" });
      setPinPrompt(null);
    } else if (pinPrompt === "login-gerant") {
      if (code === adminPin) { setPendingUser({ role: "gerant", name: "Gérant" }); setPinPrompt(null); }
      else setPinError("Code incorrect");
    } else if (pinPrompt === "login-vendeur") {
      if (code === pinTarget.pin) { setPendingUser({ role: "vendeur", name: pinTarget.name, id: pinTarget.id }); setPinPrompt(null); }
      else setPinError("Code incorrect");
    } else if (pinPrompt === "create-vendeur") {
      const seller = { id: uid(), name: pinTarget.name, pin: code, commission: pinTarget.commission || 0 };
      setSellers((prev) => [...prev, seller]);
      setPinPrompt(null);
    } else if (pinPrompt === "login-caissier") {
      if (code === pinTarget.pin) { setPendingUser({ role: "caissier", name: pinTarget.name, id: pinTarget.id }); setPinPrompt(null); }
      else setPinError("Code incorrect");
    } else if (pinPrompt === "create-caissier") {
      const cashier = { id: uid(), name: pinTarget.name, pin: code };
      setCashiers((prev) => [...prev, cashier]);
      setPinPrompt(null);
    }
  };

  if (!shopIdLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0ECE3" }}>
        <div style={{ color: "#16A34A", fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm animate-pulse">Ouverture du registre…</div>
      </div>
    );
  }

  if (!shopId) {
    return <ShopScreen onCreate={createShop} onJoin={joinShop} onDevOpen={joinShop} />;
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F0ECE3" }}>
        <div style={{ color: "#16A34A", fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm animate-pulse">Ouverture du registre…</div>
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
            <h1 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-2xl">Wuri</h1>
            <p className="text-sm mt-1" style={{ color: "#6B6558" }}>Choisis ton type de commerce pour commencer</p>
          </div>
          <div className="space-y-2">
            {Object.entries(BUSINESS_TYPES).map(([key, v]) => (
              <button key={key} onClick={() => { setBusinessType(key); requestCreateGerant(); }} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#FFFFFF", border: "1px solid #DCD5C6", color: "#1B1F1C" }}>
                <span className="text-xl">{v.icon}</span>
                <span style={{ fontFamily: "'Fraunces', serif" }}>{v.label}</span>
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
            <h1 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-xl">Abonnement requis</h1>
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
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <style>{fontImport}</style>
        <LoginScreen sellers={sellers} cashiers={cashiers} onPickGerant={requestGerantLogin} onPickVendeur={requestVendeurLogin} onPickCaissier={requestCaissierLogin} />
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
    { id: "reglages", label: "Réglages", icon: Settings },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#F0ECE3" }}>
      <style>{`
        ${fontImport}
        * { font-family: 'Inter', sans-serif; }
        body { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <header className="sticky top-0 z-10 px-4 pt-5 pb-3" style={{ background: "#1B1F1Cee", backdropFilter: "blur(6px)" }}>
        <div className="max-w-lg md:max-w-6xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 shrink-0">
            <Logo size={34} />
            <div>
              <h1 style={{ fontFamily: "'Fraunces', serif", color: "#1B1F1C" }} className="text-xl leading-tight">Wuri</h1>
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
              <p className="text-sm" style={{ color: "#1B1F1C", fontFamily: "'Fraunces', serif" }}>{currentUser.name}</p>
              <p className="text-[11px]" style={{ color: "#6B6558" }}>{isAdmin ? "Gérant" : currentUser.role === "caissier" ? "Caissier" : "Vendeur"}</p>
            </div>
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold" style={{ background: "#C08A3E", color: "#FFFFFF" }}>
              {currentUser.name?.[0]?.toUpperCase() || "?"}
            </div>
          </div>

          {tab === "stock" && isAdmin && (
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
        {tab === "stock" && <StockTab products={products} isAdmin={isAdmin} onOpenProduct={setModalProduct} onRequestGerant={() => { setCurrentUser(null); requestGerantLogin(); }} />}
        {tab === "vente" && <VenteTab products={products} cart={cart} setCart={setCart} onValidate={validateSale} clients={clients} onAddClient={addClient} />}
        {tab === "clients" && <ClientsTab clients={clients} sales={sales} isAdmin={isAdmin} onAddClient={addClient} onUpdateClient={updateClient} onRemoveClient={removeClient} />}
        {tab === "inventaire" && <InventaireTab products={products} isAdmin={isAdmin} onRequestGerant={() => { setCurrentUser(null); requestGerantLogin(); }} onValidateInventory={validateInventory} />}
        {tab === "historique" && <HistoriqueTab sales={sales} />}
        {tab === "agenda" && <AgendaTab shifts={shifts} />}
        {tab === "paie" && (
          <PaieTab
            sales={sales}
            sellers={sellers}
            currentUser={currentUser}
            isAdmin={isAdmin}
            expenses={expenses}
            onAddExpense={(e) => setExpenses((prev) => [...prev, e])}
            onDeleteExpense={(id) => setExpenses((prev) => prev.filter((e) => e.id !== id))}
          />
        )}
        {tab === "reglages" && (
          <ReglagesTab
            businessType={businessType}
            setBusinessType={setBusinessType}
            isAdmin={isAdmin}
            currentUser={currentUser}
            onLogout={() => setCurrentUser(null)}
            sellers={sellers}
            onAddSeller={requestCreateVendeur}
            onRemoveSeller={removeSeller}
            onRenameSeller={renameSeller}
            onUpdateCommission={updateSellerCommission}
            cashiers={cashiers}
            onAddCashier={requestCreateCaissier}
            onRemoveCashier={removeCashier}
            onRenameCashier={renameCashier}
            onReset={resetAll}
            hours={hours}
            setHours={setHours}
            shopId={shopId}
            shopName={shopName}
            setShopName={setShopName}
            onLeaveShop={leaveShop}
            sales={sales}
            products={products}
            expenses={expenses}
          />
        )}
      </main>

      {receiptData && <ReceiptModal receipt={receiptData} onClose={() => setReceiptData(null)} />}

      <nav className="fixed bottom-0 left-0 right-0 z-10 md:hidden" style={{ background: "#FFFFFF", borderTop: "1px solid #DCD5C6" }}>
        <div className="max-w-lg mx-auto grid grid-cols-8">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className="flex flex-col items-center gap-1 py-2.5">
              <Icon size={17} style={{ color: tab === id ? "#C08A3E" : "#16A34A" }} />
              <span className="text-[9px]" style={{ color: tab === id ? "#C08A3E" : "#16A34A" }}>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {modalProduct !== null && (
        <ProductModal product={modalProduct.id ? modalProduct : null} businessType={businessType} onSave={saveProduct} onDelete={deleteProduct} onClose={() => setModalProduct(null)} />
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
        <DailyReportModal sales={sales} products={products} expenses={expenses} onClose={() => setShowDailyReport(false)} />
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
      <p className="wuri-splash-text mt-5 text-lg" style={{ fontFamily: "'Fraunces', serif", color: "#F0ECE3" }}>
        Bienvenue chez Wuri
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
