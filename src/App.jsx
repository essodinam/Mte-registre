/**
 * MTE Registre
 * Application de gestion de stock et de ventes.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Minus, Trash2, Package, ShoppingCart, History, Settings, AlertTriangle, X, Check, Lock, LogOut, ClipboardList, WifiOff, RefreshCw, UserPlus, User, Clock, PenTool, Receipt, Wrench, Wine, ShoppingBag, Hammer } from "lucide-react";
import { storage } from "./storage.js";

/* ---------- Design tokens ----------
Encre  : #1B1F1C (fond)
Surface: #242A25
Laiton : #C08A3E (accent primaire, prix / actions)
Sauge  : #6E8C77 (accent secondaire, validations)
Parchemin: #EDE6D6 (texte principal)
Rouille: #B5533C (alertes / stock bas)
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

const fmt = (n) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- Logo Moïse Tech Énergie ---------- */
function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E0A855" />
          <stop offset="100%" stopColor="#A9722F" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="112" fill="#1B1F1C" />
      <circle cx="120" cy="120" r="112" fill="none" stroke="#C08A3E" strokeWidth="2.5" opacity="0.55" />
      <g opacity="0.35">
        <line x1="20" y1="46" x2="20" y2="194" stroke="#C08A3E" strokeWidth="4" strokeDasharray="6 8" strokeLinecap="round" />
      </g>
      <g stroke="#6E8C77" strokeWidth="2" fill="none" opacity="0.8">
        <path d="M60,150 h20 M60,150 v14" />
        <path d="M180,95 h-18 M180,95 v-14" />
      </g>
      <circle cx="60" cy="164" r="3.5" fill="#6E8C77" />
      <circle cx="180" cy="81" r="3.5" fill="#6E8C77" />
      <path d="M138,42 L88,124 L112,124 L100,198 L156,110 L128,110 Z" fill="url(#boltGrad)" stroke="#EDE6D6" strokeWidth="1.5" strokeLinejoin="round" />
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
    <div className="relative rounded-lg overflow-hidden" style={{ background: "#242A25", border: "1px solid #37403A" }}>
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
    <div className="flex items-center gap-3 py-3 pr-3 border-b last:border-b-0" style={{ borderColor: "#37403A22" }}>
      <span className="text-xs w-6 text-right shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6E8C77" }}>
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
      background: online ? "#C08A3E1A" : "#B5533C1A",
      color: online ? "#C08A3E" : "#B5533C",
      border: `1px solid ${online ? "#C08A3E55" : "#B5533C55"}`,
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-6 space-y-4 text-center" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <Lock size={22} style={{ color: "#C08A3E" }} className="mx-auto" />
        <div>
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: "#9CA79E" }}>{subtitle}</p>}
        </div>
        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-3 h-3 rounded-full" style={{ background: i < pin.length ? "#C08A3E" : "#37403A" }} />
          ))}
        </div>
        {error && <p className="text-xs" style={{ color: "#B5533C" }}>{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((d, i) => (
            <button
              key={i}
              disabled={d === ""}
              onClick={() => (d === "⌫" ? setPin((p) => p.slice(0, -1)) : d && press(d))}
              className="py-3 rounded-lg text-sm"
              style={{ background: d === "" ? "transparent" : "#1B1F1C", color: "#EDE6D6", border: d === "" ? "none" : "1px solid #37403A" }}
            >
              {d}
            </button>
          ))}
        </div>
        <button onClick={onCancel} className="text-xs" style={{ color: "#9CA79E" }}>Annuler</button>
      </div>
    </div>
  );
}

/* ---------- Portail mot de passe libre (ex : Espace gérant) ---------- */
function PasswordGate({ title, subtitle, onSubmit, onCancel, error }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-6 space-y-4 text-center" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <Lock size={22} style={{ color: "#C08A3E" }} className="mx-auto" />
        <div>
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">{title}</h3>
          {subtitle && <p className="text-xs mt-1" style={{ color: "#9CA79E" }}>{subtitle}</p>}
        </div>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value) onSubmit(value); }}
          autoFocus
          className="w-full px-4 py-3 rounded-lg text-center outline-none text-lg"
          style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
        />
        {error && <p className="text-xs" style={{ color: "#B5533C" }}>{error}</p>}
        <button
          disabled={!value}
          onClick={() => onSubmit(value)}
          className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: "#C08A3E", color: "#1B1F1C" }}
        >
          Valider
        </button>
        <button onClick={onCancel} className="text-xs" style={{ color: "#9CA79E" }}>Annuler</button>
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
    ctx.strokeStyle = "#EDE6D6";
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
      <div className="w-full max-w-sm rounded-2xl p-5 space-y-4" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <div className="text-center">
          <PenTool size={20} style={{ color: "#C08A3E" }} className="mx-auto" />
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg mt-1">Signature de prise de service</h3>
          <p className="text-xs mt-1" style={{ color: "#9CA79E" }}>{name} — {new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <canvas
          ref={canvasRef}
          width={320}
          height={140}
          className="w-full rounded-lg touch-none"
          style={{ background: "#1B1F1C", border: "1px solid #37403A" }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <div className="flex gap-2">
          <button onClick={clear} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: "#37403A", color: "#EDE6D6" }}>Effacer</button>
          <button
            disabled={empty}
            onClick={confirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "#C08A3E", color: "#1B1F1C" }}
          >
            Signer et commencer
          </button>
        </div>
        <button onClick={onCancel} className="w-full text-xs" style={{ color: "#9CA79E" }}>Annuler</button>
      </div>
    </div>
  );
}

/* ---------- Vitrine des catégories de commerce (écran d'accueil) ---------- */
const CATEGORY_SHOWCASE = [
  { key: "quincaillerie", label: "Quincaillerie", Icon: Wrench, from: "#8A6A2E", to: "#C08A3E" },
  { key: "bar", label: "Bar / Restauration", Icon: Wine, from: "#6E8C77", to: "#3F5A47" },
  { key: "boutique", label: "Boutique", Icon: ShoppingBag, from: "#B5533C", to: "#7A3826" },
  { key: "menuiserie", label: "Menuiserie", Icon: Hammer, from: "#7A5A3E", to: "#4A3620" },
];

function CategoryShowcase() {
  return (
    <div className="grid grid-cols-2 gap-2.5 mb-1">
      {CATEGORY_SHOWCASE.map(({ key, label, Icon, from, to }) => (
        <div
          key={key}
          className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1.5 overflow-hidden relative"
          style={{ background: `linear-gradient(150deg, ${from}, ${to})`, border: "1px solid #37403A" }}
        >
          <Icon size={26} style={{ color: "#EDE6D6" }} strokeWidth={1.6} />
          <span
            className="text-[11px] text-center px-2 leading-tight"
            style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }}
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
  if (!subscriptionUntil) return { label: "Abonnement non défini", color: "#9CA79E" };
  const days = Math.ceil((new Date(subscriptionUntil) - new Date()) / 86400000);
  if (days < 0) return { label: `En retard depuis ${Math.abs(days)}j`, color: "#B5533C" };
  if (days <= 7) return { label: `Expire dans ${days}j`, color: "#C08A3E" };
  return { label: `À jour · jusqu'au ${new Date(subscriptionUntil).toLocaleDateString("fr-FR")}`, color: "#6E8C77" };
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
    const keys = ["products", "sales", "businessType", "shopName", "sellers", "cashiers", "hours", "shifts", "expenses"];
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
      <div className="w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-lg p-5 space-y-3" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">
            Commerces ({shops ? shops.length : 0})
          </h2>
          <button onClick={onClose} style={{ color: "#9CA79E" }}><X size={20} /></button>
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
                <span className="px-2 py-1 rounded-full" style={{ background: "#B5533C1A", color: "#B5533C" }}>
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
          <span className="flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: "#6E8C77" }}>
            <span className="text-2xl">🧪</span>
          </span>
          <span style={{ color: "#6E8C77" }} className="text-xs">Mode test</span>
        </button>
        {loadError && <p className="text-xs" style={{ color: "#B5533C" }}>{loadError}</p>}
        {shops && shops.length === 0 && !loadError && (
          <p className="text-xs" style={{ color: "#9CA79E" }}>Aucun commerce enregistré pour l'instant.</p>
        )}
        <div className="space-y-2">
          {shops && shops.map((s) => {
            const status = getSubscriptionStatus(s.subscriptionUntil);
            const isEditing = editingCode === s.code;
            return (
              <div key={s.code} className="rounded-lg p-3" style={{ background: "#1B1F1C", border: "1px solid #37403A" }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => onOpenShop(s.code)} className="text-left flex-1">
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E", letterSpacing: "0.1em" }} className="block text-sm">{s.code}</span>
                    <span className="text-xs block mt-0.5" style={{ color: "#9CA79E" }}>
                      {BUSINESS_TYPES[s.businessType]?.label || "Type non défini"}
                      {s.createdAt ? ` · créé le ${new Date(s.createdAt).toLocaleDateString("fr-FR")}` : ""}
                    </span>
                  </button>
                  <span style={{ color: "#6E8C77" }} className="text-xs shrink-0 ml-2">Ouvrir →</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: "1px solid #37403A" }}>
                  <span className="text-[11px]" style={{ color: status.color }}>{status.label}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => exportShopData(s.code)} className="text-[11px] px-2 py-1 rounded" style={{ background: "#242A25", border: "1px solid #37403A", color: "#9CA79E" }}>
                      Export
                    </button>
                    <button onClick={() => extendOneMonth(s)} className="text-[11px] px-2 py-1 rounded" style={{ background: "#6E8C771A", color: "#6E8C77" }}>
                      +1 mois
                    </button>
                    <button onClick={() => { setEditingCode(isEditing ? null : s.code); setEditDateValue(s.subscriptionUntil ? new Date(s.subscriptionUntil).toISOString().slice(0, 10) : ""); }} className="text-[11px] px-2 py-1 rounded" style={{ background: "#242A25", border: "1px solid #37403A", color: "#9CA79E" }}>
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
                      style={{ background: "#242A25", border: "1px solid #37403A", color: "#EDE6D6" }}
                    />
                    <button onClick={() => saveSubscription(s.code, editDateValue)} className="text-xs px-2 py-1.5 rounded" style={{ background: "#C08A3E", color: "#1B1F1C" }}>
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
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#1B1F1C" }}>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <Logo size={56} />
            <h1 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-2xl">MTE Registre</h1>
            <p className="text-sm mt-1" style={{ color: "#9CA79E" }}>Code de ton commerce</p>
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Ex : AB12-CD34"
            className="w-full px-4 py-3 rounded-lg text-center outline-none text-lg tracking-widest"
            style={{ background: "#242A25", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
          />
          <button
            disabled={!code.trim()}
            onClick={() => onJoin(code.trim())}
            className="w-full py-3 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "#C08A3E", color: "#1B1F1C" }}
          >
            Rejoindre ce commerce
          </button>
          <button onClick={() => setMode(null)} className="w-full text-xs" style={{ color: "#9CA79E" }}>Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#1B1F1C" }}>
      <div className="w-full max-w-sm space-y-5">
        <CategoryShowcase />
        <div className="text-center">
          <Logo size={60} />
          <h1 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-2xl">MTE Registre</h1>
          <p className="text-sm mt-1" style={{ color: "#9CA79E" }}>Bienvenue</p>
        </div>
        <div className="space-y-2">
          <button onClick={() => setMode("join")} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55", color: "#EDE6D6" }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: "#C08A3E", color: "#1B1F1C" }}><User size={16} /></span>
            <span>
              <span style={{ fontFamily: "'Fraunces', serif" }} className="block">Rejoindre un commerce</span>
              <span className="text-xs block mt-0.5" style={{ color: "#9CA79E" }}>J'ai déjà un code</span>
            </span>
          </button>
        </div>
        <button onClick={() => setOwnerGate(true)} className="w-full text-center text-xs pt-1" style={{ color: "#6E8C77" }}>
          Espace gérant — créer un commerce
        </button>
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setDevPanel(true)}
            aria-label="Espace développeur"
            className="flex items-center justify-center rounded-full"
            style={{ width: 34, height: 34, background: "#6E8C77" }}
          >
            <Lock size={14} color="#1B1F1C" />
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
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 text-center" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <Package size={22} style={{ color: "#C08A3E" }} className="mx-auto" />
        <div>
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">Ton commerce est créé</h3>
          <p className="text-xs mt-1" style={{ color: "#9CA79E" }}>Note ce code : il te servira à connecter tes autres appareils et employés à ce même registre.</p>
        </div>
        <div className="py-3 rounded-lg text-xl tracking-[0.3em]" style={{ background: "#1B1F1C", border: "1px solid #C08A3E55", color: "#C08A3E", fontFamily: "'IBM Plex Mono', monospace" }}>
          {code}
        </div>
        <p className="text-[10px]" style={{ color: "#6E8C77" }}>Tu pourras le retrouver plus tard dans Réglages.</p>
        <button onClick={onContinue} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: "#C08A3E", color: "#1B1F1C" }}>
          J'ai noté, continuer
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ sellers, cashiers, onPickGerant, onPickVendeur, onPickCaissier }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#1B1F1C" }}>
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <Logo size={56} />
          <h1 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-2xl">MTE Registre</h1>
          <p className="text-sm mt-1" style={{ color: "#9CA79E" }}>Qui utilise l'application ?</p>
        </div>
        <div className="space-y-2">
          <button onClick={onPickGerant} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55", color: "#EDE6D6" }}>
            <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#C08A3E", color: "#1B1F1C" }}><Lock size={16} /></span>
            <span style={{ fontFamily: "'Fraunces', serif" }}>Gérant</span>
          </button>
          {sellers.map((s) => (
            <button key={s.id} onClick={() => onPickVendeur(s)} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#242A25", border: "1px solid #37403A", color: "#EDE6D6" }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#37403A", color: "#EDE6D6" }}><User size={16} /></span>
              <span style={{ fontFamily: "'Fraunces', serif" }}>{s.name}</span>
            </button>
          ))}
          {cashiers.map((c) => (
            <button key={c.id} onClick={() => onPickCaissier(c)} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#242A25", border: "1px solid #37403A", color: "#EDE6D6" }}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#37403A", color: "#EDE6D6" }}><Receipt size={16} /></span>
              <span style={{ fontFamily: "'Fraunces', serif" }}>{c.name} <span className="text-[10px]" style={{ color: "#6E8C77" }}>· caissier</span></span>
            </button>
          ))}
        </div>
        {sellers.length === 0 && cashiers.length === 0 && (
          <p className="text-xs text-center" style={{ color: "#6E8C77" }}>Le gérant peut créer des accès vendeur ou caissier depuis Réglages.</p>
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
        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: "#B5533C1A", border: "1px solid #B5533C55" }}>
          <AlertTriangle size={18} style={{ color: "#B5533C" }} className="shrink-0 mt-0.5" />
          <div style={{ color: "#EDE6D6" }} className="text-sm">
            <span className="font-semibold" style={{ color: "#B5533C" }}>{lowStock.length} article{lowStock.length > 1 ? "s" : ""}</span> en stock bas : {lowStock.map((p) => p.name).join(", ")}
          </div>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un article…"
        className="w-full px-4 py-2.5 rounded-lg outline-none text-sm"
        style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }}
      />

      <Ledger>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#6E8C7799" }}>
            Aucun article. {isAdmin ? "Ajoute ton premier produit avec le bouton +." : "Le gérant n'a pas encore ajouté d'articles."}
          </div>
        ) : (
          filtered.map((p, i) => (
            <Row key={p.id} n={i + 1}>
              <button onClick={() => isAdmin && onOpenProduct(p)} className="flex-1 flex items-center justify-between text-left">
                <div>
                  <div style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{p.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#9CA79E" }}>{p.category}</div>
                </div>
                <div className="text-right">
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: p.stock <= p.threshold ? "#B5533C" : "#EDE6D6" }} className="text-sm">
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
        <button onClick={onRequestGerant} className="w-full flex items-center justify-center gap-2 text-xs py-2" style={{ color: "#6E8C77" }}>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <div className="flex items-center justify-between">
          <h3 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">{isNew ? "Nouvel article" : "Modifier l'article"}</h3>
          <button onClick={onClose}><X size={20} style={{ color: "#9CA79E" }} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs" style={{ color: "#9CA79E" }}>Nom</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }} placeholder="Ex : Vis 4x40, Planche chêne…" />
          </div>

          <div>
            <label className="text-xs" style={{ color: "#9CA79E" }}>Catégorie</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }}>
              {BUSINESS_TYPES[businessType].categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "#9CA79E" }}>Prix de vente (FCFA)</label>
              <input type="number" value={form.price} onChange={(e) => set("price", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "#9CA79E" }}>Unité</label>
              <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="u, kg, m…" className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs" style={{ color: "#9CA79E" }}>Quantité en stock</label>
              <input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
            <div>
              <label className="text-xs" style={{ color: "#9CA79E" }}>Seuil d'alerte</label>
              <input type="number" value={form.threshold} onChange={(e) => set("threshold", e.target.value)} className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          {!isNew && (
            <button onClick={() => onDelete(form.id)} className="px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm" style={{ background: "#B5533C1A", color: "#B5533C", border: "1px solid #B5533C55" }}>
              <Trash2 size={16} /> Supprimer
            </button>
          )}
          <button
            disabled={!valid}
            onClick={() => onSave({ ...form, price: parseFloat(form.price) || 0, stock: parseInt(form.stock) || 0, threshold: parseInt(form.threshold) || 0 })}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
            style={{ background: "#C08A3E", color: "#1B1F1C" }}
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
  const { shopName, businessTypeLabel, items, total, date, cashierName } = receipt;
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

function VenteTab({ products, cart, setCart, onValidate }) {
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

  return (
    <div className="space-y-4 pb-24">
      <Ledger>
        {products.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "#6E8C7799" }}>Le gérant n'a pas encore ajouté d'articles.</div>
        ) : (
          products.map((p, i) => (
            <Row key={p.id} n={i + 1}>
              <button onClick={() => add(p)} disabled={p.stock === 0} className="flex-1 flex items-center justify-between text-left disabled:opacity-30">
                <div>
                  <div style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{p.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#9CA79E" }}>{p.stock} {p.unit} dispo</div>
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
        <div className="fixed bottom-16 left-0 right-0 mx-auto max-w-lg px-4">
          <div className="rounded-xl p-4 space-y-2" style={{ background: "#242A25", border: "1px solid #C08A3E55", boxShadow: "0 -8px 24px #00000055" }}>
            {cart.map((i) => (
              <div key={i.id} className="flex items-center justify-between text-sm">
                <span style={{ color: "#EDE6D6" }}>{i.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => dec(i.id)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#37403A", color: "#EDE6D6" }}><Minus size={12} /></button>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#EDE6D6" }} className="w-5 text-center">{i.qty}</span>
                  <button onClick={() => inc(i.id)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#37403A", color: "#EDE6D6" }}><Plus size={12} /></button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "#37403A" }}>
              <span style={{ color: "#9CA79E" }} className="text-sm">Total</span>
              <span style={{ fontFamily: "'Fraunces', serif", color: "#C08A3E" }} className="text-xl">{fmt(total)} FCFA</span>
            </div>
            <button onClick={() => onValidate(cart, total)} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2" style={{ background: "#6E8C77", color: "#1B1F1C" }}>
              <Check size={16} /> Valider la vente
            </button>
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
        <Lock size={22} style={{ color: "#6E8C77" }} className="mx-auto" />
        <p className="text-sm" style={{ color: "#9CA79E" }}>L'inventaire est réservé au gérant.</p>
        <button onClick={onRequestGerant} className="text-sm px-4 py-2 rounded-lg" style={{ background: "#C08A3E22", color: "#C08A3E" }}>Se connecter en gérant</button>
      </div>
    );
  }

  if (products.length === 0) {
    return <div className="py-10 text-center text-sm" style={{ color: "#6E8C7799" }}>Ajoute des articles avant de faire un inventaire.</div>;
  }

  if (!started) {
    return (
      <div className="py-10 text-center space-y-3">
        <ClipboardList size={24} style={{ color: "#C08A3E" }} className="mx-auto" />
        <p className="text-sm" style={{ color: "#9CA79E" }}>Compte chaque article physiquement, puis saisis la quantité réelle trouvée.</p>
        <button onClick={begin} className="text-sm px-5 py-2.5 rounded-lg" style={{ background: "#C08A3E", color: "#1B1F1C" }}>Commencer l'inventaire</button>
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
                <div style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }} className="text-[15px] truncate">{p.name}</div>
                <div className="text-xs mt-0.5" style={{ color: "#9CA79E" }}>Enregistré : {p.stock} {p.unit}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={counts[p.id] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                  className="w-16 px-2 py-1.5 rounded-md text-sm text-right outline-none"
                  style={{ background: "#1B1F1C", border: `1px solid ${p.diff !== 0 ? "#C08A3E" : "#37403A"}`, color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
                />
                {p.diff !== 0 && (
                  <span className="text-xs w-10 text-right" style={{ fontFamily: "'IBM Plex Mono', monospace", color: p.diff > 0 ? "#6E8C77" : "#B5533C" }}>
                    {p.diff > 0 ? "+" : ""}{p.diff}
                  </span>
                )}
              </div>
            </div>
          </Row>
        ))}
      </Ledger>

      <div className="rounded-lg p-3 text-sm" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#9CA79E" }}>
        {changed.length === 0 ? "Aucun écart pour l'instant." : `${changed.length} article${changed.length > 1 ? "s" : ""} avec écart.`}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setStarted(false)} className="px-4 py-2.5 rounded-lg text-sm" style={{ background: "#37403A", color: "#EDE6D6" }}>Annuler</button>
        <button
          onClick={() => { onValidateInventory(diffs); setStarted(false); }}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: "#6E8C77", color: "#1B1F1C" }}
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
    return <div className="py-10 text-center text-sm" style={{ color: "#6E8C7799" }}>Aucune vente enregistrée pour l'instant.</div>;
  }

  return (
    <div className="space-y-5">
      <button
        onClick={exportCsv}
        className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
        style={{ background: "#242A25", border: "1px solid #37403A", color: "#C08A3E" }}
      >
        <Receipt size={15} /> Exporter les ventes en CSV
      </button>
      {Object.entries(byDay).map(([day, list]) => {
        const dayTotal = list.reduce((s, v) => s + v.total, 0);
        return (
          <div key={day}>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs uppercase tracking-wide" style={{ color: "#6E8C77" }}>{day}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }} className="text-xs">{fmt(dayTotal)} FCFA</span>
            </div>
            <Ledger>
              {list.map((s, i) => (
                <Row key={s.id} n={i + 1}>
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <div style={{ color: "#EDE6D6" }} className="text-sm">{s.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#9CA79E" }}>{new Date(s.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {s.sellerName}</div>
                    </div>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#EDE6D6" }} className="text-sm">{fmt(s.total)} FCFA</span>
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
    return <div className="py-10 text-center text-sm" style={{ color: "#6E8C7799" }}>Aucune prise de service enregistrée pour l'instant.</div>;
  }

  return (
    <div className="space-y-5">
      {Object.entries(byDay).map(([day, list]) => (
        <div key={day}>
          <div className="mb-2 px-1 text-xs uppercase tracking-wide" style={{ color: "#6E8C77" }}>{day}</div>
          <Ledger>
            {list.map((s, i) => (
              <Row key={s.id} n={i + 1}>
                <div className="flex-1 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{s.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#9CA79E" }}>
                      {s.role === "gerant" ? "Gérant" : "Vendeur"} · connecté à {new Date(s.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  {s.signature && (
                    <img
                      src={s.signature}
                      alt={`Signature de ${s.name}`}
                      className="h-8 w-16 object-contain rounded shrink-0"
                      style={{ background: "#1B1F1C", border: "1px solid #37403A" }}
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
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">Bulletin de paie</h3>
            <p className="text-xs mt-0.5 capitalize" style={{ color: "#9CA79E" }}>{monthLabel(year, month)}</p>
          </div>
          <button onClick={onClose}><X size={20} style={{ color: "#9CA79E" }} /></button>
        </div>

        <Ledger>
          <Row n={1}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#9CA79E" }}>Vendeur</span>
              <span style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }}>{seller.name}</span>
            </div>
          </Row>
          <Row n={2}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#9CA79E" }}>Ventes réalisées</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#EDE6D6" }}>{salesCount}</span>
            </div>
          </Row>
          <Row n={3}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#9CA79E" }}>Chiffre d'affaires généré</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#EDE6D6" }}>{fmt(total)} FCFA</span>
            </div>
          </Row>
          <Row n={4}>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#9CA79E" }}>Taux de commission</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#EDE6D6" }}>{commission}%</span>
            </div>
          </Row>
        </Ledger>

        <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "#C08A3E1A", border: "1px solid #C08A3E55" }}>
          <span className="text-sm" style={{ color: "#EDE6D6" }}>Montant à verser</span>
          <span style={{ fontFamily: "'Fraunces', serif", color: "#C08A3E" }} className="text-xl">{fmt(amount)} FCFA</span>
        </div>

        <p className="text-[10px]" style={{ color: "#6E8C77" }}>
          Calcul basé sur les ventes enregistrées dans MTE Registre pour la période sélectionnée — document indicatif à intégrer dans ta comptabilité.
        </p>

        <button onClick={() => window.print()} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: "#37403A", color: "#EDE6D6" }}>
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
        <button onClick={() => shiftMonth(-1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "#242A25", color: "#EDE6D6", border: "1px solid #37403A" }}>‹</button>
        <span style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-sm capitalize">{monthLabel(year, month)}</span>
        <button onClick={() => shiftMonth(1)} className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "#242A25", color: "#EDE6D6", border: "1px solid #37403A" }}>›</button>
      </div>

      {isAdmin && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: "#1B1F1C", border: "1px solid #37403A" }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "#9CA79E" }}>Ventes du mois</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#6E8C77" }}>{fmt(totalSalesPeriod)} FCFA</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "#9CA79E" }}>Dépenses du mois</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B5533C" }}>− {fmt(totalExpensesPeriod)} FCFA</span>
          </div>
          <div className="flex items-center justify-between text-sm pt-2" style={{ borderTop: "1px solid #37403A" }}>
            <span style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }}>Bilan net</span>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E" }}>{fmt(totalSalesPeriod - totalExpensesPeriod)} FCFA</span>
          </div>
        </div>
      )}

      {sellers.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: "#6E8C7799" }}>Aucun vendeur enregistré pour l'instant.</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: "#6E8C7799" }}>Aucun accès vendeur à afficher.</div>
      ) : (
        <Ledger>
          {rows.map((r, i) => (
            <Row key={r.seller.id} n={i + 1}>
              <button onClick={() => setOpenSlip(r)} className="flex-1 flex items-center justify-between text-left">
                <div>
                  <div style={{ color: "#EDE6D6", fontFamily: "'Fraunces', serif" }} className="text-[15px]">{r.seller.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#9CA79E" }}>
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
          <p className="text-xs uppercase tracking-wide px-1" style={{ color: "#6E8C77" }}>Dépenses</p>
          <div className="flex gap-2">
            <input
              value={expLabel}
              onChange={(e) => setExpLabel(e.target.value)}
              placeholder="Ex. Achat marchandise, loyer…"
              className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }}
            />
            <input
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              type="number"
              placeholder="Montant"
              className="w-28 px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
            />
            <button onClick={addExpense} className="px-3 rounded-md" style={{ background: "#C08A3E", color: "#1B1F1C" }}>
              <Plus size={16} />
            </button>
          </div>
          {periodExpenses.length > 0 && (
            <Ledger>
              {periodExpenses.map((e, i) => (
                <Row key={e.id} n={i + 1}>
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <div style={{ color: "#EDE6D6" }} className="text-sm">{e.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: "#9CA79E" }}>{new Date(e.date).toLocaleDateString("fr-FR")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#B5533C" }} className="text-sm">{fmt(e.amount)} FCFA</span>
                      <button onClick={() => onDeleteExpense(e.id)} style={{ color: "#6E8C77" }}><Trash2 size={14} /></button>
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
      <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#1B1F1C", border: "1px solid #37403A" }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: "#EDE6D6" }}>
          <User size={16} style={{ color: "#C08A3E" }} />
          Connecté en tant que <span style={{ fontFamily: "'Fraunces', serif" }}>{currentUser?.name}</span>
        </div>
        <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded-md flex items-center gap-1" style={{ background: "#37403A", color: "#EDE6D6" }}>
          <LogOut size={12} /> Changer
        </button>
      </div>

      {isAdmin && (
        <div>
          <p className="text-xs uppercase tracking-wide mb-2 px-1" style={{ color: "#6E8C77" }}>Rapports</p>
          <div className="flex gap-2">
            {[["day", "Jour"], ["week", "Semaine"], ["month", "Mois"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setReportPeriod(id)}
                className="flex-1 py-2 rounded-lg text-sm"
                style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#C08A3E" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6E8C77" }}>Code de ce commerce</div>
          <div className="rounded-lg p-3 flex items-center justify-between" style={{ background: "#1B1F1C", border: "1px solid #37403A" }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#C08A3E", letterSpacing: "0.15em" }} className="text-sm">{shopId}</span>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#9CA79E" }}>Donne ce code à tes employés ou utilise-le sur un autre appareil pour rejoindre ce même registre.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6E8C77" }}>Nom du commerce</div>
          <input
            value={shopName || ""}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="Ex : Quincaillerie Kodjo"
            className="w-full px-3 py-2.5 rounded-md text-sm outline-none"
            style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }}
          />
          <p className="text-[10px] mt-1.5" style={{ color: "#9CA79E" }}>Ce nom apparaîtra en haut des tickets de caisse imprimés.</p>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6E8C77" }}>Type de commerce</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(BUSINESS_TYPES).map(([key, v]) => (
            <button
              key={key}
              disabled={!isAdmin}
              onClick={() => setBusinessType(key)}
              className="p-3 rounded-lg text-left text-sm flex items-center gap-2 disabled:opacity-40"
              style={{ background: businessType === key ? "#C08A3E22" : "#1B1F1C", border: `1px solid ${businessType === key ? "#C08A3E" : "#37403A"}`, color: "#EDE6D6" }}
            >
              <span>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6E8C77" }}>Heures d'ouverture</div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs" style={{ color: "#9CA79E" }}>Ouverture</label>
              <input
                type="time"
                value={hours?.open || "08:00"}
                onChange={(e) => setHours((h) => ({ ...(h || {}), open: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs" style={{ color: "#9CA79E" }}>Fermeture</label>
              <input
                type="time"
                value={hours?.close || "18:00"}
                onChange={(e) => setHours((h) => ({ ...(h || {}), close: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
              />
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6E8C77" }}>Accès vendeurs</div>
          <div className="space-y-2 mb-3">
            {sellers.length === 0 && <p className="text-xs" style={{ color: "#9CA79E" }}>Aucun vendeur pour l'instant.</p>}
            {sellers.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#1B1F1C", border: "1px solid #37403A" }}>
                <span className="text-sm flex items-center gap-2 flex-1 min-w-0">
                  <User size={14} style={{ color: "#6E8C77" }} className="shrink-0" />
                  <input
                    value={s.name}
                    onChange={(e) => onRenameSeller(s.id, e.target.value)}
                    className="bg-transparent outline-none min-w-0 flex-1"
                    style={{ color: "#EDE6D6" }}
                  />
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={s.commission ?? 0}
                      onChange={(e) => onUpdateCommission(s.id, parseFloat(e.target.value) || 0)}
                      className="w-14 px-2 py-1 rounded-md text-sm text-right outline-none"
                      style={{ background: "#242A25", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
                    />
                    <span className="text-xs" style={{ color: "#9CA79E" }}>%</span>
                  </div>
                  <button onClick={() => onRemoveSeller(s.id)} className="text-xs" style={{ color: "#B5533C" }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nom du vendeur" className="flex-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }} />
            <input
              type="number"
              value={newCommission}
              onChange={(e) => setNewCommission(e.target.value)}
              placeholder="%"
              className="w-16 px-2 py-2 rounded-md text-sm text-right outline-none"
              style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6", fontFamily: "'IBM Plex Mono', monospace" }}
            />
            <button
              disabled={!newName.trim()}
              onClick={() => { onAddSeller(newName.trim(), parseFloat(newCommission) || 0); setNewName(""); setNewCommission(""); }}
              className="px-3 py-2 rounded-md text-sm flex items-center gap-1 disabled:opacity-40"
              style={{ background: "#C08A3E", color: "#1B1F1C" }}
            >
              <UserPlus size={14} /> Créer
            </button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#9CA79E" }}>Le pourcentage définit la commission de ce vendeur sur ses propres ventes, utilisée dans l'onglet Paie.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "#6E8C77" }}>Espace caisse</div>
          <div className="space-y-2 mb-3">
            {cashiers.length === 0 && <p className="text-xs" style={{ color: "#9CA79E" }}>Aucun caissier pour l'instant.</p>}
            {cashiers.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "#1B1F1C", border: "1px solid #37403A" }}>
                <span className="text-sm flex items-center gap-2 flex-1 min-w-0">
                  <Receipt size={14} style={{ color: "#6E8C77" }} className="shrink-0" />
                  <input
                    value={c.name}
                    onChange={(e) => onRenameCashier(c.id, e.target.value)}
                    className="bg-transparent outline-none min-w-0 flex-1"
                    style={{ color: "#EDE6D6" }}
                  />
                </span>
                <button onClick={() => onRemoveCashier(c.id)} className="text-xs" style={{ color: "#B5533C" }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={newCashierName} onChange={(e) => setNewCashierName(e.target.value)} placeholder="Nom du caissier" className="flex-1 px-3 py-2 rounded-md text-sm outline-none" style={{ background: "#1B1F1C", border: "1px solid #37403A", color: "#EDE6D6" }} />
            <button
              disabled={!newCashierName.trim()}
              onClick={() => { onAddCashier(newCashierName.trim()); setNewCashierName(""); }}
              className="px-3 py-2 rounded-md text-sm flex items-center gap-1 disabled:opacity-40"
              style={{ background: "#C08A3E", color: "#1B1F1C" }}
            >
              <UserPlus size={14} /> Créer
            </button>
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#9CA79E" }}>Le caissier peut valider les ventes et imprimer les tickets ; son nom apparaît sur chaque ticket.</p>
        </div>
      )}

      {isAdmin && (
        <div>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="text-sm flex items-center gap-2" style={{ color: "#B5533C" }}>
              <Trash2 size={14} /> Réinitialiser le stock et l'historique
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: "#EDE6D6" }}>Sûr ?</span>
              <button onClick={() => { onReset(); setConfirming(false); }} className="text-sm px-3 py-1 rounded-md" style={{ background: "#B5533C", color: "#EDE6D6" }}>Oui, effacer</button>
              <button onClick={() => setConfirming(false)} className="text-sm px-3 py-1 rounded-md" style={{ background: "#37403A", color: "#EDE6D6" }}>Annuler</button>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <button onClick={onLeaveShop} className="text-sm flex items-center gap-2" style={{ color: "#9CA79E" }}>
          <LogOut size={14} /> Changer de commerce
        </button>
      )}

      <p className="text-xs" style={{ color: "#9CA79E" }}>Le stock et l'historique sont partagés entre tous les appareils. Chaque vente enregistrée garde la trace du vendeur qui l'a faite.</p>

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
        style={{ background: "#C08A3E", color: "#1B1F1C" }}
      >
        <Package size={20} className="shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight" style={{ fontFamily: "'Fraunces', serif" }}>
            Installe MTE Registre sur ton téléphone
          </p>
          <p className="text-[11px] leading-tight opacity-80">Accès plus rapide, fonctionne même hors connexion</p>
        </div>
        <button
          onClick={handleInstallClick}
          className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ background: "#1B1F1C", color: "#EDE6D6" }}
        >
          Installer
        </button>
        <button onClick={() => setDismissed(true)} className="shrink-0" style={{ color: "#1B1F1C" }}>
          <X size={18} />
        </button>
      </div>

      {showIOSHelp && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6" style={{ background: "#00000099" }} onClick={() => setShowIOSHelp(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl p-6 space-y-3 text-center" style={{ background: "#242A25", border: "1px solid #37403A" }}>
            <Package size={22} style={{ color: "#C08A3E" }} className="mx-auto" />
            <h3 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">Installer sur iPhone</h3>
            <p className="text-sm text-left" style={{ color: "#EDE6D6" }}>
              1. Appuie sur l'icône <strong>Partager</strong> en bas de Safari (le carré avec la flèche)<br /><br />
              2. Fais défiler et choisis <strong>"Sur l'écran d'accueil"</strong><br /><br />
              3. Appuie sur <strong>"Ajouter"</strong> en haut à droite
            </p>
            <button onClick={() => setShowIOSHelp(false)} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: "#C08A3E", color: "#1B1F1C" }}>
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
      <div className="w-full max-w-sm rounded-lg p-5 space-y-4" style={{ background: "#242A25", border: "1px solid #37403A" }}>
        <div className="flex items-center justify-between">
          <h2 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-lg">Rapport {label}</h2>
          <button onClick={onClose} style={{ color: "#9CA79E" }}><X size={20} /></button>
        </div>
        <div className="text-center py-3">
          <div style={{ fontFamily: "'Fraunces', serif", color: "#C08A3E" }} className="text-3xl">{fmt(total - totalExpenses)} FCFA</div>
          <div className="text-xs mt-1" style={{ color: "#9CA79E" }}>Bilan net · {todaySales.length} vente{todaySales.length > 1 ? "s" : ""}, {fmt(total)} vendus, {fmt(totalExpenses)} dépensés</div>
        </div>
        {top.length > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wide mb-1.5" style={{ color: "#6E8C77" }}>Top produits</p>
            <div className="space-y-1">
              {top.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between text-sm" style={{ color: "#EDE6D6" }}>
                  <span>{name}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#9CA79E" }}>{qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {lowStock.length > 0 && (
          <div className="p-2.5 rounded-lg text-xs flex items-start gap-2" style={{ background: "#B5533C1A", color: "#B5533C" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{lowStock.length} article{lowStock.length > 1 ? "s" : ""} en stock bas : {lowStock.map((p) => p.name).join(", ")}</span>
          </div>
        )}
        <button onClick={onClose} className="w-full py-2.5 rounded-lg text-sm" style={{ background: "#C08A3E", color: "#1B1F1C" }}>
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

  // Vérifie le statut d'abonnement du commerce (bloque en lecture seule après 15 jours de retard).
  useEffect(() => {
    if (!shopId || shopId === TEST_SHOP_CODE) { setSubBlocked(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await storage.get(SHOPS_REGISTRY_KEY, true);
        const list = res ? JSON.parse(res.value) : [];
        const entry = list.find((s) => s.code === shopId);
        if (cancelled) return;
        if (entry?.subscriptionUntil) {
          const daysLate = Math.floor((new Date() - new Date(entry.subscriptionUntil)) / 86400000);
          setSubBlocked(daysLate > 15);
        } else {
          setSubBlocked(false);
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
  const ready = shopIdLoaded && !!shopId && productsLoaded && salesLoaded && btLoaded && shopNameLoaded && pinLoaded && sellersLoaded && cashiersLoaded && hoursLoaded && shiftsLoaded;

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
      const next = existing
        ? list.map((s) => (s.code === code ? { ...s, businessType: type ?? s.businessType } : s))
        : [...list, { code, businessType: type ?? null, createdAt: new Date().toISOString() }];
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

  const validateSale = (cartItems, total) => {
    if (subBlocked) return;
    setSales((prev) => [...prev, { id: uid(), items: cartItems, total, date: Date.now(), sellerName: currentUser?.name || "?", sellerId: currentUser?.id || null }]);
    setProducts((prev) => prev.map((p) => {
      const item = cartItems.find((i) => i.id === p.id);
      return item ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p;
    }));
    setReceiptData({
      shopName: shopName,
      businessTypeLabel: businessType ? BUSINESS_TYPES[businessType].label : "",
      items: cartItems,
      total,
      date: Date.now(),
      cashierName: currentUser?.name || "?",
    });
    setCart([]);
  };

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1B1F1C" }}>
        <div style={{ color: "#6E8C77", fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm animate-pulse">Ouverture du registre…</div>
      </div>
    );
  }

  if (!shopId) {
    return <ShopScreen onCreate={createShop} onJoin={joinShop} onDevOpen={joinShop} />;
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#1B1F1C" }}>
        <div style={{ color: "#6E8C77", fontFamily: "'IBM Plex Mono', monospace" }} className="text-sm animate-pulse">Ouverture du registre…</div>
      </div>
    );
  }

  const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500&display=swap');`;

  if (newShopCode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#1B1F1C" }}>
        <style>{fontImport}</style>
        <ShopCodeReveal code={newShopCode} onContinue={() => setNewShopCode(null)} />
      </div>
    );
  }

  if (!businessType) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#1B1F1C" }}>
        <style>{fontImport}</style>
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <Logo size={60} />
            <h1 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-2xl">MTE Registre</h1>
            <p className="text-sm mt-1" style={{ color: "#9CA79E" }}>Choisis ton type de commerce pour commencer</p>
          </div>
          <div className="space-y-2">
            {Object.entries(BUSINESS_TYPES).map(([key, v]) => (
              <button key={key} onClick={() => { setBusinessType(key); requestCreateGerant(); }} className="w-full p-4 rounded-lg text-left flex items-center gap-3" style={{ background: "#242A25", border: "1px solid #37403A", color: "#EDE6D6" }}>
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
    { id: "inventaire", label: "Inventaire", icon: ClipboardList },
    { id: "historique", label: "Historique", icon: History },
    { id: "agenda", label: "Agenda", icon: Clock },
    { id: "paie", label: "Paie", icon: Receipt },
    { id: "reglages", label: "Réglages", icon: Settings },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#1B1F1C" }}>
      <style>{`
        ${fontImport}
        * { font-family: 'Inter', sans-serif; }
        body { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <header className="sticky top-0 z-10 px-4 pt-5 pb-3" style={{ background: "#1B1F1Cee", backdropFilter: "blur(6px)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <div>
              <h1 style={{ fontFamily: "'Fraunces', serif", color: "#EDE6D6" }} className="text-xl leading-tight">MTE Registre</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs" style={{ color: "#6E8C77" }}>{BUSINESS_TYPES[businessType].icon} {currentUser.name}</p>
                {isOpenNow !== null && (
                  <span className="text-[10px] px-2 py-1 rounded-full" style={{
                    background: isOpenNow ? "#6E8C771A" : "#B5533C1A",
                    color: isOpenNow ? "#6E8C77" : "#B5533C",
                    border: `1px solid ${isOpenNow ? "#6E8C7755" : "#B5533C55"}`,
                  }}>
                    {isOpenNow ? `Ouvert · ferme à ${hours.close}` : `Fermé · ouvre à ${hours.open}`}
                  </span>
                )}
                <SyncBadge online={online} pendingCount={pendingRef.current.size} />
                {isAdmin && lowStockCount > 0 && (
                  <button
                    onClick={() => setTab("stock")}
                    className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1"
                    style={{ background: "#B5533C1A", color: "#B5533C", border: "1px solid #B5533C55" }}
                  >
                    <AlertTriangle size={11} /> {lowStockCount} en stock bas
                  </button>
                )}
              </div>
            </div>
          </div>
          {tab === "stock" && isAdmin && (
            <button onClick={() => setModalProduct({})} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#C08A3E", color: "#1B1F1C" }}>
              <Plus size={20} />
            </button>
          )}
        </div>
      </header>

      {subBlocked && (
        <div className="px-4 py-2.5 text-xs text-center" style={{ background: "#B5533C", color: "#1B1F1C" }}>
          ⚠️ Abonnement expiré — accès en lecture seule. Contactez Moïse Tech Énergie pour réactiver le compte.
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 pb-4">
        {tab === "stock" && <StockTab products={products} isAdmin={isAdmin} onOpenProduct={setModalProduct} onRequestGerant={() => { setCurrentUser(null); requestGerantLogin(); }} />}
        {tab === "vente" && <VenteTab products={products} cart={cart} setCart={setCart} onValidate={validateSale} />}
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

      <nav className="fixed bottom-0 left-0 right-0 z-10" style={{ background: "#242A25", borderTop: "1px solid #37403A" }}>
        <div className="max-w-lg mx-auto grid grid-cols-7">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className="flex flex-col items-center gap-1 py-2.5">
              <Icon size={17} style={{ color: tab === id ? "#C08A3E" : "#6E8C77" }} />
              <span className="text-[9px]" style={{ color: tab === id ? "#C08A3E" : "#6E8C77" }}>{label}</span>
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

export default function App() {
  return (
    <>
      <InstallBanner />
      <AppInner />
    </>
  );
}
