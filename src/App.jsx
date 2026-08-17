import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Plus, Trash2, TrendingUp, PieChart as PieIcon, ListOrdered, Layers,
  Download, Upload, FileText, LogOut, Calculator, Landmark, Briefcase,
  Bitcoin, Wallet, ChevronDown, X, Wallet2, LayoutDashboard, ArrowRight,
  Check, RefreshCw, Target, Copy, ArrowUp, ArrowDown, ChevronUp, ArrowUpDown,
  FileSpreadsheet, Moon, Sun, HelpCircle, Keyboard, GripVertical,
} from "lucide-react";
import ProfileGate from "./ProfileGate.jsx";
import { saveProfileData } from "./profiles.js";
import { exportJSON, exportPDF, exportCSV, importJSONFile } from "./export.js";
import { fetchCryptoPrices, fetchCryptoHistory } from "./cryptoPrices.js";
import { fetchUsdToEurRate } from "./fx.js";

// ---------- Design tokens ----------
const COLORS = {
  bg: "var(--pea-bg, #F4F5F1)",
  card: "var(--pea-card, #FFFFFF)",
  cardAlt: "var(--pea-card-alt, #FCFCFA)",
  navy: "#10233B",
  navyLight: "#1B3A5C",
  gold: "#B8873A",
  goldLight: "#E8D5B0",
  green: "#2F7D5E",
  red: "#B5484D",
  border: "var(--pea-border, #E3E1D8)",
  text: "var(--pea-text, #1C2530)",
  muted: "var(--pea-muted, #6B7280)",
};
const PALETTE = ["#B8873A", "#2F6E7A", "#7A4E3A", "#5B7A4E", "#8A5B7A", "#4E6B7A", "#A3673A"];

const KIND_META = {
  PEA: { label: "PEA", icon: Landmark },
  CTO: { label: "Compte-titres", icon: Briefcase },
  Crypto: { label: "Crypto", icon: Bitcoin },
  Autre: { label: "Autre", icon: Wallet },
};
const KIND_ACCENT = {
  PEA: "#B8873A",
  CTO: "#2F6E7A",
  Crypto: "#0ECB81",
  Autre: "#6B7280",
};
const KIND_HEADER_BG = {
  PEA: "#10233B",
  CTO: "#0F2E33",
  Crypto: "#0A2B20",
  Autre: "#262A30",
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtMoney(n, min = 2, max = 2) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: min, maximumFractionDigits: max }) + " €";
}
function fmtCost(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
function fmtQty(n, fractional) {
  const v = Number.isFinite(n) ? n : 0;
  return fractional
    ? v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 6 })
    : v.toLocaleString("fr-FR", { maximumFractionDigits: 0 });
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function pctReturn(diff, base) {
  if (!base || Math.abs(base) < 0.005) return null;
  return (diff / Math.abs(base)) * 100;
}
function fmtPct(p) {
  if (p === null || p === undefined || !Number.isFinite(p)) return "—";
  return (p >= 0 ? "+" : "") + p.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
}
function pieTooltip(total) {
  return (value, name) => {
    const pct = total ? ((value / total) * 100).toFixed(1) : "0.0";
    return [`${fmtMoney(value)} (${pct} %)`, name];
  };
}
const PIE_LABEL_RADIAN = Math.PI / 180;
function renderPiePercentLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.04) return null; // évite d'encombrer les toutes petites parts
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * PIE_LABEL_RADIAN);
  const y = cy + radius * Math.sin(-midAngle * PIE_LABEL_RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: "IBM Plex Mono", fontSize: 11, fontWeight: 700, pointerEvents: "none" }}>
      {(percent * 100).toFixed(0)}%
    </text>
  );
}
function monthKey(iso) {
  return iso ? iso.slice(0, 7) : "";
}
function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function signedTx(t) {
  const q = Number(t.quantity) || 0;
  const c = Number(t.cost) || 0;
  const sign = t.type === "vente" ? -1 : 1;
  return { qty: sign * q, amount: sign * q * c };
}
function signedVersement(v) {
  const a = Number(v.amount) || 0;
  return v.type === "retrait" ? -a : a;
}
function computeAccountAssetStats(account) {
  const map = {};
  account.transactions.forEach((t) => {
    if (!t.etf) return;
    if (!map[t.etf]) map[t.etf] = { qty: 0, montant: 0 };
    const s = signedTx(t);
    map[t.etf].qty += s.qty;
    map[t.etf].montant += s.amount;
  });
  return map;
}
function accountAssetPieData(account) {
  const stats = computeAccountAssetStats(account);
  return Object.entries(stats)
    .map(([name, s]) => ({ name, value: s.montant }))
    .filter((d) => d.value > 0);
}

function makeAccount(name, kind) {
  return {
    id: uid(),
    name,
    kind,
    transactions: [],
    versements: [],
    valorisations: [],
    allocationTargets: [],
    objectifs: [],
    sellTargets: [],
  };
}

// Compatibilité avec les anciennes sauvegardes (format à plat, un seul compte "PEA")
function normalizeData(raw) {
  if (raw && Array.isArray(raw.accounts) && raw.accounts.length > 0) {
    const accounts = raw.accounts.map((a) => ({
      allocationTargets: [],
      valorisations: [],
      objectifs: [],
      sellTargets: [],
      kind: "Autre",
      ...a,
      versements: (a.versements || []).map((v) => ({ type: "depot", ...v })),
      transactions: (a.transactions || []).map((t) => ({ type: "achat", ...t })),
    }));
    const activeAccountId = accounts.some((a) => a.id === raw.activeAccountId)
      ? raw.activeAccountId
      : accounts[0].id;
    return { accounts, activeAccountId };
  }
  if (raw && Array.isArray(raw.transactions)) {
    const acc = makeAccount("PEA", "PEA");
    acc.transactions = raw.transactions.map((t) => ({ type: "achat", ...t }));
    acc.versements = (raw.versements || []).map((v) => ({ type: "depot", ...v }));
    acc.valorisations = raw.valorisations || [];
    acc.allocationTargets = raw.allocationTargets || [];
    return { accounts: [acc], activeAccountId: acc.id };
  }
  const acc = makeAccount("PEA", "PEA");
  return { accounts: [acc], activeAccountId: acc.id };
}

function useScrollToRow(id, prefix) {
  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(`${prefix}-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [id, prefix]);
}

function useFontsLoaded() {
  useEffect(() => {
    if (document.getElementById("pea-tracker-fonts")) return;
    const link = document.createElement("link");
    link.id = "pea-tracker-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

function SectionCard({ children, style }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `4px solid var(--accent, ${COLORS.gold})`,
        borderRadius: 10,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
function StatChip({ label, value, accent }) {
  return (
    <div style={{ background: COLORS.navyLight, borderRadius: 8, padding: "10px 16px", minWidth: 130 }}>
      <div style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: 0.6, color: "#B8C4D4", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 18, fontWeight: 600, color: accent || "#FFFFFF", marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
function RowActions({ onDelete, deleteLabel }) {
  const [flash, setFlash] = useState(false);
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
      <button
        type="button"
        title="Ligne enregistrée"
        className="pea-row-btn"
        onClick={() => {
          setFlash(true);
          setTimeout(() => setFlash(false), 1100);
        }}
        style={{
          background: flash ? COLORS.green : "#EAF3EE",
          border: "none", borderRadius: 6, width: 28, height: 28,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          transition: "background 0.15s",
        }}
      >
        <Check size={14} color={flash ? "#fff" : COLORS.green} />
      </button>
      <button
        type="button"
        title="Supprimer"
        className="pea-row-btn"
        onClick={() => {
          if (window.confirm(`Supprimer ${deleteLabel || "cette ligne"} ? Cette action est irréversible.`)) onDelete();
        }}
        style={{
          background: "#FBEAEA", border: "none", borderRadius: 6, width: 28, height: 28,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}
      >
        <Trash2 size={14} color={COLORS.red} />
      </button>
    </div>
  );
}
function SortableTh({ col, label, align, sortCol, sortDir, onSort }) {
  const active = sortCol === col;
  return (
    <th style={{ ...th, textAlign: align || "left", cursor: "pointer", userSelect: "none" }} onClick={() => onSort(col)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        {active ? (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
      </span>
    </th>
  );
}
function MiniStat({ label, value }) {
  return (
    <div style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px" }}>
      <div style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.muted }}>
        {label}
      </div>
      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 17, fontWeight: 600, color: COLORS.text, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

const inputStyle = {
  fontFamily: "IBM Plex Mono", fontSize: 13.5, border: `1px solid ${COLORS.border}`,
  borderRadius: 5, padding: "5px 7px", width: "100%", color: COLORS.text, background: COLORS.cardAlt,
};
const selectStyle = { ...inputStyle, fontFamily: "Inter" };
const th = {
  fontFamily: "Inter", fontSize: 11.5, letterSpacing: 0.4, textTransform: "uppercase",
  color: COLORS.muted, textAlign: "left", padding: "8px 10px", borderBottom: `2px solid ${COLORS.navy}`,
};
const td = { padding: "6px 10px", borderBottom: `1px solid ${COLORS.border}` };
const addBtnStyleBase = {
  display: "flex", alignItems: "center", gap: 5, background: COLORS.navy, color: "#fff",
  border: "none", borderRadius: 6, padding: "7px 12px", fontFamily: "Inter", fontWeight: 600, fontSize: 12.5, cursor: "pointer",
};
const addBtnStyleOutline = {
  display: "flex", alignItems: "center", gap: 5, background: "transparent", color: COLORS.text,
  border: `1px solid ${COLORS.text}`, borderRadius: 6, padding: "7px 12px", fontFamily: "Inter", fontWeight: 600, fontSize: 12.5, cursor: "pointer",
};
const miniIconBtnStyle = {
  background: COLORS.goldLight, border: "none", borderRadius: 5, width: 22, height: 22,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
};

function TutorialModal({ onClose }) {
  const sections = [
    { title: "Vue d'ensemble", text: "Ton patrimoine total tous comptes confondus, un résumé du jour, et un camembert cliquable pour rejoindre un compte." },
    { title: "Opérations", text: "Tes achats et ventes. Remplis la quantité ou le prix, puis le montant total en € — l'autre se calcule tout seul. Trie les colonnes, clone ou réordonne les lignes." },
    { title: "Versements", text: "Tes dépôts et retraits, avec un graphique mensuel et ta régularité de versement." },
    { title: "Par ETF / Par actif", text: "Le détail d'un actif précis : quantité, PRU, et pour la crypto le prix en direct, le gain latent et tes paliers de vente." },
    { title: "Calculateur", text: "Indique un montant à verser : il se répartit automatiquement entre tes actifs selon tes allocations cibles." },
    { title: "Objectifs", text: "Définis un ou plusieurs objectifs d'épargne avec une barre de progression." },
    { title: "Valorisation", text: "Le suivi manuel de la valeur totale du compte dans le temps, comparée à tes versements." },
    { title: "Répartition", text: "Un camembert par compte, et la répartition globale de ton patrimoine." },
  ];
  return (
    <div className="pea-modal-overlay" onClick={onClose}>
      <div className="pea-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontFamily: "Fraunces", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Guide rapide</div>
          <button onClick={onClose} className="pea-modal-close"><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 16 }}>
          Un tour rapide de chaque onglet et des raccourcis disponibles. Rouvre ce guide à tout moment avec le bouton "Aide" ou la touche <strong>?</strong>.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {sections.map((s) => (
            <div key={s.title}>
              <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, color: COLORS.text }}>{s.title}</div>
              <div style={{ fontFamily: "Inter", fontSize: 12.5, color: COLORS.text }}>{s.text}</div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: "Fraunces", fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>
          Raccourcis & astuces
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: COLORS.text, display: "flex", flexDirection: "column", gap: 4 }}>
          <li><strong>N</strong> — nouvelle ligne (dans Opérations ou Versements)</li>
          <li><strong>Ctrl+Z</strong> (ou Cmd+Z) — annuler la dernière modification</li>
          <li><strong>?</strong> — rouvrir ce guide</li>
          <li>Glisser une ligne vers la gauche sur mobile — révèle la suppression</li>
          <li>Glisser-déposer une ligne (⠿) sur ordinateur — pour la réordonner</li>
          <li>Bouton "Mode sombre" en haut — pour un affichage adapté au soir</li>
          <li>Pense à faire un "Export JSON" régulièrement — tes données restent uniquement sur cet appareil</li>
        </ul>
        <button onClick={onClose} style={{ ...addBtnStyleBase, background: COLORS.navy, marginTop: 20, width: "100%", justifyContent: "center", padding: "10px" }}>
          Compris, fermer
        </button>
      </div>
    </div>
  );
}

function parseCsvText(text) {
  const firstLine = (text.split(/\r?\n/)[0] || "");
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows = lines.map((line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        cells.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  });
  return { delimiter, rows };
}
function parseDateToIso(raw, format) {
  const s = (raw || "").trim();
  if (!s) return "";
  if (format === "iso") {
    const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  } else if (format === "dmy") {
    const m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  } else if (format === "mdy") {
    const m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return "";
}
function parseCsvNum(raw, decimalSep) {
  if (raw === undefined || raw === null || raw === "") return "";
  let s = String(raw).trim().replace(/\s/g, "").replace(/€|\$/g, "");
  if (decimalSep === ",") s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : "";
}
function parseCsvType(raw) {
  const s = (raw || "").toLowerCase();
  if (s.includes("vente") || s.includes("sell") || s.includes("sale")) return "vente";
  return "achat";
}

const CSV_FIELDS = [
  { id: "ignore", label: "Ignorer" },
  { id: "date", label: "Date" },
  { id: "type", label: "Type (achat/vente)" },
  { id: "etf", label: "Actif" },
  { id: "isin", label: "Code / ISIN" },
  { id: "quantity", label: "Quantité" },
  { id: "cost", label: "Prix unitaire" },
];
function guessField(headerLabel) {
  const s = (headerLabel || "").toLowerCase();
  if (/date/.test(s)) return "date";
  if (/type/.test(s)) return "type";
  if (/actif|etf|nom|titre|libell/.test(s)) return "etf";
  if (/isin|code/.test(s)) return "isin";
  if (/quantit|qty|nombre/.test(s)) return "quantity";
  if (/prix|cours|cout|coût/.test(s)) return "cost";
  return "ignore";
}

function ImportCsvModal({ onClose, onImport }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [dateFormat, setDateFormat] = useState("dmy");
  const [decimalSep, setDecimalSep] = useState("comma");
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { rows: parsed } = parseCsvText(String(reader.result));
        if (parsed.length === 0) throw new Error("Fichier vide.");
        setRows(parsed);
        const headerRow = parsed[0];
        const guessed = {};
        headerRow.forEach((h, i) => { guessed[i] = guessField(h); });
        setMapping(guessed);
      } catch (err) {
        setError(err.message || "Impossible de lire ce fichier.");
      }
    };
    reader.onerror = () => setError("Impossible de lire ce fichier.");
    reader.readAsText(file, "utf-8");
  };

  const dataRows = rows ? (hasHeader ? rows.slice(1) : rows) : [];
  const colCount = rows ? rows[0].length : 0;

  const transformed = useMemo(() => {
    if (!rows) return [];
    const idxOf = (field) => Object.keys(mapping).find((k) => mapping[k] === field);
    const dateIdx = idxOf("date");
    const typeIdx = idxOf("type");
    const etfIdx = idxOf("etf");
    const isinIdx = idxOf("isin");
    const qtyIdx = idxOf("quantity");
    const costIdx = idxOf("cost");
    return dataRows.map((row) => ({
      id: uid(),
      date: dateIdx !== undefined ? parseDateToIso(row[dateIdx], dateFormat) : "",
      type: typeIdx !== undefined ? parseCsvType(row[typeIdx]) : "achat",
      etf: etfIdx !== undefined ? row[etfIdx] : "",
      isin: isinIdx !== undefined ? (row[isinIdx] || "").toUpperCase() : "",
      quantity: qtyIdx !== undefined ? parseCsvNum(row[qtyIdx], decimalSep === "comma" ? "," : ".") : "",
      cost: costIdx !== undefined ? parseCsvNum(row[costIdx], decimalSep === "comma" ? "," : ".") : "",
    }));
  }, [rows, dataRows, mapping, dateFormat, decimalSep]);

  const validCount = transformed.filter((t) => t.date && t.etf).length;

  return (
    <div className="pea-modal-overlay" onClick={onClose}>
      <div className="pea-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontFamily: "Fraunces", fontSize: 20, fontWeight: 700, color: COLORS.text }}>Importer un CSV</div>
          <button onClick={onClose} className="pea-modal-close"><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 16 }}>
          Un export de courtier (Excel/CSV), semicolons ou virgules, marche généralement tel quel. Associe chaque colonne au bon champ ci-dessous.
        </div>

        {!rows && (
          <div>
            <label
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                border: `2px dashed ${COLORS.border}`, borderRadius: 10, padding: 30, cursor: "pointer",
              }}
            >
              <Upload size={22} color={COLORS.muted} />
              <span style={{ fontSize: 13, color: COLORS.muted }}>Clique pour choisir un fichier .csv</span>
              <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
            {error && <div style={{ color: COLORS.red, fontSize: 12.5, marginTop: 10 }}>{error}</div>}
          </div>
        )}

        {rows && (
          <>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
              Fichier : <strong>{fileName}</strong> — {dataRows.length} ligne(s) de données détectée(s)
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                La 1ère ligne est un en-tête
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
                Format de date :
                <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} style={{ ...inputStyle, fontFamily: "Inter", width: "auto" }}>
                  <option value="dmy">JJ/MM/AAAA</option>
                  <option value="mdy">MM/JJ/AAAA</option>
                  <option value="iso">AAAA-MM-JJ</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5 }}>
                Séparateur décimal :
                <select value={decimalSep} onChange={(e) => setDecimalSep(e.target.value)} style={{ ...inputStyle, fontFamily: "Inter", width: "auto" }}>
                  <option value="comma">Virgule (1,50)</option>
                  <option value="point">Point (1.50)</option>
                </select>
              </label>
            </div>

            <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 12.5, color: COLORS.muted, textTransform: "uppercase", marginBottom: 6 }}>
              Correspondance des colonnes
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16, maxHeight: 180, overflowY: "auto" }}>
              {Array.from({ length: colCount }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={mapping[i] || "ignore"}
                    onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}
                    style={{ ...inputStyle, fontFamily: "Inter", width: 160 }}
                  >
                    {CSV_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                  <span style={{ fontSize: 12, color: COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {hasHeader ? `« ${rows[0][i]} » — ` : ""}ex. {dataRows[0]?.[i] ?? ""}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 12.5, color: COLORS.muted, textTransform: "uppercase", marginBottom: 6 }}>
              Aperçu ({validCount} / {transformed.length} lignes complètes)
            </div>
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Type</th>
                    <th style={th}>Actif</th>
                    <th style={{ ...th, textAlign: "right" }}>Quantité</th>
                    <th style={{ ...th, textAlign: "right" }}>Prix</th>
                  </tr>
                </thead>
                <tbody>
                  {transformed.slice(0, 5).map((t) => (
                    <tr key={t.id}>
                      <td style={{ ...td, color: t.date ? COLORS.text : COLORS.red }}>{t.date || "—"}</td>
                      <td style={td}>{t.type}</td>
                      <td style={{ ...td, color: t.etf ? COLORS.text : COLORS.red }}>{t.etf || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{t.quantity}</td>
                      <td style={{ ...td, textAlign: "right" }}>{t.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setRows(null); setMapping({}); }} style={addBtnStyleOutline}>Changer de fichier</button>
              <button
                onClick={() => { onImport(transformed.filter((t) => t.date && t.etf)); onClose(); }}
                style={{ ...addBtnStyleBase, background: COLORS.navy, flex: 1, justifyContent: "center" }}
                disabled={validCount === 0}
              >
                Importer {validCount} ligne(s)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Dashboard({ profileName, profileKey, initialData, onLogout, dark, setDark }) {
  useFontsLoaded();
  const [data, setData] = useState(() => normalizeData(initialData));
  const [tab, setTab] = useState("vue");
  const [selectedEtf, setSelectedEtf] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importError, setImportError] = useState("");
  const [amountToInvest, setAmountToInvest] = useState("");
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccKind, setNewAccKind] = useState("PEA");
  const [cryptoPrices, setCryptoPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState("");
  const [cryptoHistory, setCryptoHistory] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDays, setHistoryDays] = useState(30);
  const [usdRate, setUsdRate] = useState(null);
  const [usdRateLoading, setUsdRateLoading] = useState(false);
  const [usdRateError, setUsdRateError] = useState("");
  const [costCcyMap, setCostCcyMap] = useState({});
  const [costUsdDraftMap, setCostUsdDraftMap] = useState({});
  const [versCcyMap, setVersCcyMap] = useState({});
  const [versUsdDraftMap, setVersUsdDraftMap] = useState({});
  const [targetCcyMap, setTargetCcyMap] = useState({});
  const [targetUsdDraftMap, setTargetUsdDraftMap] = useState({});
  const [txSortCol, setTxSortCol] = useState(null);
  const [txSortDir, setTxSortDir] = useState("asc");
  const [txSearch, setTxSearch] = useState("");
  const [showIsinCol, setShowIsinCol] = useState(true);
  const [selectedTxIds, setSelectedTxIds] = useState(() => new Set());
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState(null);
  const [selectedVersId, setSelectedVersId] = useState(null);
  const [dragRowId, setDragRowId] = useState(null);
  const dragIdRef = useRef(null);
  const [showAnalyseMenu, setShowAnalyseMenu] = useState(false);
  const analyseMenuRef = useRef(null);
  const analyseBtnRef = useRef(null);
  const [analyseMenuPos, setAnalyseMenuPos] = useState({ top: 0, left: 0 });
  const toggleAnalyseMenu = () => {
    if (!showAnalyseMenu && analyseBtnRef.current) {
      const rect = analyseBtnRef.current.getBoundingClientRect();
      setAnalyseMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setShowAnalyseMenu((s) => !s);
  };
  useEffect(() => {
    if (!showAnalyseMenu) return;
    const onClickOutside = (e) => {
      if (analyseMenuRef.current && analyseMenuRef.current.contains(e.target)) return;
      if (analyseBtnRef.current && analyseBtnRef.current.contains(e.target)) return;
      setShowAnalyseMenu(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showAnalyseMenu]);
  const [swipeConfirm, setSwipeConfirm] = useState(null);
  const touchStartXRef = useRef(null);
  const touchDeltaRef = useRef(0);
  const handleTxTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchDeltaRef.current = 0;
  };
  const handleTxTouchMove = (e) => {
    if (touchStartXRef.current === null) return;
    const dx = e.touches[0].clientX - touchStartXRef.current;
    if (dx < 0) {
      touchDeltaRef.current = Math.max(dx, -90);
      e.currentTarget.style.transform = `translateX(${touchDeltaRef.current}px)`;
    }
  };
  const handleTxTouchEnd = (e, t) => {
    const rowEl = e.currentTarget;
    const dx = touchDeltaRef.current;
    rowEl.style.transition = "transform 0.2s ease";
    rowEl.style.transform = "translateX(0)";
    setTimeout(() => { if (rowEl) rowEl.style.transition = ""; }, 220);
    if (dx < -55) {
      setSwipeConfirm({ kind: "transaction", id: t.id, label: `${t.type === "vente" ? "Vente" : "Achat"} ${t.etf || ""} du ${fmtDate(t.date)}` });
    }
    touchStartXRef.current = null;
    touchDeltaRef.current = 0;
  };
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return localStorage.getItem("peaTracker.tutorialSeen") !== "1";
    } catch {
      return false;
    }
  });
  const dismissTutorial = () => {
    setShowTutorial(false);
    try { localStorage.setItem("peaTracker.tutorialSeen", "1"); } catch {}
  };
  const [lastExportAt, setLastExportAt] = useState(() => {
    try { return localStorage.getItem("peaTracker.lastExportAt"); } catch { return null; }
  });
  const markExported = () => {
    const now = new Date().toISOString();
    setLastExportAt(now);
    try { localStorage.setItem("peaTracker.lastExportAt", now); } catch {}
  };
  const daysSinceExport = lastExportAt ? Math.floor((new Date() - new Date(lastExportAt)) / 86400000) : null;
  const hasAnyData = data.accounts.some((a) => a.transactions.length > 0 || a.versements.length > 0);
  useScrollToRow(selectedTxId, "tx-row");
  useScrollToRow(selectedVersId, "vers-row");

  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const previousDataRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);

  const persist = useCallback(
    async (next) => {
      previousDataRef.current = dataRef.current;
      setCanUndo(true);
      setData(next);
      setSaving(true);
      try {
        await saveProfileData(profileName, profileKey, next);
      } catch (e) {
        console.error("Erreur de sauvegarde", e);
      } finally {
        setSaving(false);
      }
    },
    [profileName, profileKey]
  );

  const undoLastChange = useCallback(() => {
    if (!previousDataRef.current) return;
    const restore = previousDataRef.current;
    previousDataRef.current = null;
    setCanUndo(false);
    persist(restore);
  }, [persist]);

  const activeAccount = data.accounts.find((a) => a.id === data.activeAccountId) || data.accounts[0];
  const isCrypto = activeAccount.kind === "Crypto";
  const accent = KIND_ACCENT[activeAccount.kind] || COLORS.gold;
  const headerBg = KIND_HEADER_BG[activeAccount.kind] || COLORS.navy;
  const addBtnStyle = { ...addBtnStyleBase, background: accent };

  const refreshPrices = async (symbols) => {
    const list = symbols.filter(Boolean);
    if (list.length === 0) return {};
    setPricesLoading(true);
    setPricesError("");
    try {
      const { prices, unknown } = await fetchCryptoPrices(list);
      setCryptoPrices((prev) => ({ ...prev, ...prices }));
      if (unknown.length) {
        setPricesError(`Symbole(s) non reconnu(s), à saisir manuellement : ${unknown.join(", ")}`);
      }
      return prices;
    } catch (e) {
      setPricesError(e.message || "Impossible de récupérer les prix.");
      return {};
    } finally {
      setPricesLoading(false);
    }
  };

  const loadCryptoHistory = async (symbol, days) => {
    if (!symbol) return;
    setHistoryLoading(true);
    setPricesError("");
    try {
      const points = await fetchCryptoHistory(symbol, days);
      setCryptoHistory((prev) => ({ ...prev, [symbol.toUpperCase()]: points || [] }));
    } catch (e) {
      setPricesError(e.message || "Impossible de récupérer l'historique.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const ensureUsdRate = async () => {
    if (usdRate) return usdRate;
    setUsdRateLoading(true);
    setUsdRateError("");
    try {
      const r = await fetchUsdToEurRate();
      setUsdRate(r);
      return r;
    } catch (e) {
      setUsdRateError(e.message || "Impossible de récupérer le taux de change.");
      return null;
    } finally {
      setUsdRateLoading(false);
    }
  };

  const patchActiveAccount = (patch) => {
    persist({
      ...data,
      accounts: data.accounts.map((a) => (a.id === activeAccount.id ? { ...a, ...patch } : a)),
    });
  };
  const switchAccount = (id) => persist({ ...data, activeAccountId: id });
  const createAccount = () => {
    if (!newAccName.trim()) return;
    const acc = makeAccount(newAccName.trim(), newAccKind);
    persist({ ...data, accounts: [...data.accounts, acc], activeAccountId: acc.id });
    setNewAccName("");
    setNewAccKind("PEA");
    setShowNewAccount(false);
  };
  const deleteAccount = (id) => {
    if (data.accounts.length <= 1) return;
    const acc = data.accounts.find((a) => a.id === id);
    if (!window.confirm(`Supprimer le compte "${acc.name}" et toutes ses données ? Action irréversible.`)) return;
    const remaining = data.accounts.filter((a) => a.id !== id);
    persist({
      ...data,
      accounts: remaining,
      activeAccountId: data.activeAccountId === id ? remaining[0].id : data.activeAccountId,
    });
  };

  const goToAccount = (id) => {
    switchAccount(id);
    setTab("operations");
  };

  const overview = useMemo(() => {
    const rows = data.accounts.map((a) => {
      const netVerse = a.versements.reduce((s, v) => s + signedVersement(v), 0);
      const netInvested = a.transactions.reduce((s, t) => s + signedTx(t).amount, 0);
      const sortedValo = [...a.valorisations].sort((x, y) => x.date.localeCompare(y.date));
      const hasValo = sortedValo.length > 0;
      const value = hasValo ? Number(sortedValo[sortedValo.length - 1].value) || 0 : netInvested;
      return {
        id: a.id, name: a.name, kind: a.kind,
        netVerse, netInvested, value,
        diff: value - netVerse, estimated: !hasValo,
      };
    });
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    const totalVerseAll = rows.reduce((s, r) => s + r.netVerse, 0);
    return { rows, totalValue, totalVerseAll, totalDiff: totalValue - totalVerseAll };
  }, [data.accounts]);

  const perAccountPies = useMemo(
    () =>
      data.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        pieData: accountAssetPieData(a),
      })),
    [data.accounts]
  );

  const todaySummary = useMemo(() => {
    const currentMonth = todayISO().slice(0, 7);
    let versementsThisMonth = 0;
    let lastDate = null;
    let palierAtteints = 0;
    let palierTotal = 0;
    data.accounts.forEach((a) => {
      a.versements.forEach((v) => {
        if (monthKey(v.date) === currentMonth) versementsThisMonth++;
        if (!lastDate || v.date > lastDate) lastDate = v.date;
      });
      if (a.kind === "Crypto") {
        const stats = computeAccountAssetStats(a);
        (a.sellTargets || []).forEach((s) => {
          palierTotal++;
          const st = stats[s.etf];
          const pru = st && st.qty ? st.montant / st.qty : 0;
          const targetPrice = pru * (1 + (Number(s.gainPct) || 0) / 100);
          const live = cryptoPrices[(s.etf || "").toUpperCase()];
          if (live && targetPrice > 0 && live >= targetPrice) palierAtteints++;
        });
      }
    });
    const daysSince = lastDate ? Math.floor((new Date(todayISO()) - new Date(lastDate)) / 86400000) : null;
    return { versementsThisMonth, daysSince, palierAtteints, palierTotal };
  }, [data.accounts, cryptoPrices]);

  const comparisonData = useMemo(() => {
    const allDates = new Set();
    data.accounts.forEach((a) => a.valorisations.forEach((v) => { if (v.date) allDates.add(v.date); }));
    const dates = Array.from(allDates).sort();
    const byAccount = data.accounts.map((a) => ({
      id: a.id, name: a.name, kind: a.kind,
      sorted: [...a.valorisations].sort((x, y) => x.date.localeCompare(y.date)),
    }));
    const rows = dates.map((date) => {
      const row = { date: fmtDate(date) };
      byAccount.forEach((a) => {
        const upto = a.sorted.filter((v) => v.date <= date);
        row[a.name] = upto.length ? Number(upto[upto.length - 1].value) || 0 : null;
      });
      return row;
    });
    const series = byAccount
      .filter((a) => a.sorted.length > 0)
      .map((a) => ({ name: a.name, color: KIND_ACCENT[a.kind] || COLORS.gold }));
    return { rows, series };
  }, [data.accounts]);

  // ---------- Dérivés du compte actif ----------
  const etfList = useMemo(() => {
    const set = new Set(activeAccount.transactions.map((t) => t.etf).filter(Boolean));
    return Array.from(set);
  }, [activeAccount.transactions]);

  const isinByEtf = useMemo(() => {
    const map = {};
    activeAccount.transactions.forEach((t) => {
      if (t.etf && t.isin && !map[t.etf]) map[t.etf] = t.isin;
    });
    return map;
  }, [activeAccount.transactions]);

  const totalQty = activeAccount.transactions.reduce((s, t) => s + signedTx(t).qty, 0);
  const totalInvesti = activeAccount.transactions.reduce((s, t) => s + signedTx(t).amount, 0);
  const totalVerse = activeAccount.versements.reduce((s, v) => s + signedVersement(v), 0);
  const solde = totalVerse - totalInvesti;

  const perEtf = useMemo(() => {
    const map = {};
    activeAccount.transactions.forEach((t) => {
      if (!t.etf) return;
      if (!map[t.etf]) map[t.etf] = { qty: 0, montant: 0 };
      const s = signedTx(t);
      map[t.etf].qty += s.qty;
      map[t.etf].montant += s.amount;
    });
    return map;
  }, [activeAccount.transactions]);

  const displayedTransactions = useMemo(() => {
    const withIdx = activeAccount.transactions.map((t, i) => ({ ...t, _idx: i }));
    let arr = withIdx;
    const q = txSearch.trim().toLowerCase();
    if (q) {
      arr = arr.filter((t) =>
        (t.etf || "").toLowerCase().includes(q) ||
        (t.isin || "").toLowerCase().includes(q) ||
        (t.type === "vente" ? "vente" : "achat").includes(q)
      );
    }
    if (!txSortCol) return arr;
    const dir = txSortDir === "asc" ? 1 : -1;
    arr = [...arr];
    arr.sort((a, b) => {
      let av, bv;
      if (txSortCol === "montant") {
        av = (Number(a.quantity) || 0) * (Number(a.cost) || 0);
        bv = (Number(b.quantity) || 0) * (Number(b.cost) || 0);
      } else if (txSortCol === "quantity" || txSortCol === "cost") {
        av = Number(a[txSortCol]) || 0;
        bv = Number(b[txSortCol]) || 0;
      } else {
        av = (a[txSortCol] || "").toString().toLowerCase();
        bv = (b[txSortCol] || "").toString().toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return arr;
  }, [activeAccount.transactions, txSortCol, txSortDir, txSearch]);

  const toggleTxSort = (col) => {
    if (txSortCol === col) {
      if (txSortDir === "asc") setTxSortDir("desc");
      else { setTxSortCol(null); setTxSortDir("asc"); }
    } else {
      setTxSortCol(col);
      setTxSortDir("asc");
    }
  };

  // ---------- Sélection multiple (actions groupées) ----------
  const toggleTxSelected = (id) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAllTx = () => {
    setSelectedTxIds((prev) =>
      prev.size === displayedTransactions.length ? new Set() : new Set(displayedTransactions.map((t) => t.id))
    );
  };
  const bulkDeleteTx = () => {
    if (selectedTxIds.size === 0) return;
    if (!window.confirm(`Supprimer les ${selectedTxIds.size} lignes sélectionnées ? Cette action est irréversible.`)) return;
    patchActiveAccount({ transactions: activeAccount.transactions.filter((t) => !selectedTxIds.has(t.id)) });
    setSelectedTxIds(new Set());
  };
  const bulkCloneTx = () => {
    if (selectedTxIds.size === 0) return;
    const toClone = activeAccount.transactions.filter((t) => selectedTxIds.has(t.id));
    const clones = toClone.map((t) => ({ ...t, id: uid() }));
    patchActiveAccount({ transactions: [...activeAccount.transactions, ...clones] });
    setSelectedTxIds(new Set());
  };

  const sortedVersements = [...activeAccount.versements].sort((a, b) => a.date.localeCompare(b.date));
  const versementCumuleAt = (dateIso) =>
    sortedVersements.filter((v) => v.date <= dateIso).reduce((s, v) => s + signedVersement(v), 0);

  const valoRows = [...activeAccount.valorisations]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((v) => {
      const cumule = versementCumuleAt(v.date);
      return { ...v, cumule, diff: (Number(v.value) || 0) - cumule };
    });
  const chartLineData = valoRows.map((r) => ({
    date: fmtDate(r.date),
    Valorisation: Number(r.value) || 0,
    "Versements cumulés": r.cumule,
  }));
  const chartBarData = valoRows.map((r) => ({ date: fmtDate(r.date), diff: Number(r.diff.toFixed(2)) }));

  // ---------- Suivi des versements (mensuel) ----------
  const versementMonthly = useMemo(() => {
    const map = {};
    activeAccount.versements.forEach((v) => {
      const k = monthKey(v.date);
      if (!k) return;
      map[k] = (map[k] || 0) + signedVersement(v);
    });
    return Object.keys(map)
      .sort()
      .map((k) => ({ key: k, label: monthLabel(k), net: Number(map[k].toFixed(2)) }));
  }, [activeAccount.versements]);

  const distinctMonthsCount = versementMonthly.length;
  const avgMonthlyVersement = distinctMonthsCount
    ? versementMonthly.reduce((s, m) => s + m.net, 0) / distinctMonthsCount
    : 0;
  const lastVersementDate = sortedVersements.length ? sortedVersements[sortedVersements.length - 1].date : null;
  const daysSinceLastVersement = lastVersementDate
    ? Math.floor((new Date(todayISO()) - new Date(lastVersementDate)) / 86400000)
    : null;

  // ---------- Mutateurs : transactions ----------
  const addTransaction = () => {
    const newTx = { id: uid(), date: todayISO(), etf: etfList[0] || "", isin: etfList[0] ? isinByEtf[etfList[0]] || "" : "", type: "achat", quantity: "", cost: "" };
    patchActiveAccount({ transactions: [...activeAccount.transactions, newTx] });
    setSelectedTxId(newTx.id);
  };
  const updateTransaction = (id, field, value) => {
    patchActiveAccount({
      transactions: activeAccount.transactions.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    });
  };
  const deleteTransaction = (id) => {
    patchActiveAccount({ transactions: activeAccount.transactions.filter((t) => t.id !== id) });
  };
  const cloneTransaction = (id) => {
    const idx = activeAccount.transactions.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const clone = { ...activeAccount.transactions[idx], id: uid() };
    const next = [...activeAccount.transactions];
    next.splice(idx + 1, 0, clone);
    patchActiveAccount({ transactions: next });
    setSelectedTxId(clone.id);
  };
  const moveTransaction = (id, dir) => {
    const idx = activeAccount.transactions.findIndex((t) => t.id === id);
    const swapWith = idx + dir;
    if (idx === -1 || swapWith < 0 || swapWith >= activeAccount.transactions.length) return;
    const next = [...activeAccount.transactions];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    patchActiveAccount({ transactions: next });
  };
  const reorderTransactionByDrop = (fromId, toId) => {
    if (fromId === toId) return;
    const arr = [...activeAccount.transactions];
    const fromIdx = arr.findIndex((t) => t.id === fromId);
    const toIdx = arr.findIndex((t) => t.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    patchActiveAccount({ transactions: arr });
  };
  // Permet de ne renseigner que 2 des 3 valeurs (quantité / prix unitaire / montant total) :
  // la troisième se déduit automatiquement — pratique pour la crypto ("j'ai mis 100€ dedans").
  const handleMontantChange = (id, val) => {
    const t = activeAccount.transactions.find((x) => x.id === id);
    if (!t || val === "") return;
    const m = Number(val);
    if (!Number.isFinite(m)) return;
    const q = Number(t.quantity) || 0;
    const p = Number(t.cost) || 0;
    if (q > 0 && !(p > 0)) {
      updateTransaction(id, "cost", m / q);
    } else if (p > 0 && !(q > 0)) {
      updateTransaction(id, "quantity", m / p);
    } else if (q > 0 && p > 0) {
      updateTransaction(id, "cost", m / q);
    }
  };

  // ---------- Mutateurs : versements ----------
  const addVersement = () => {
    const newVers = { id: uid(), date: todayISO(), type: "depot", amount: "" };
    patchActiveAccount({ versements: [...activeAccount.versements, newVers] });
    setSelectedVersId(newVers.id);
  };
  const updateVersement = (id, field, value) => {
    patchActiveAccount({ versements: activeAccount.versements.map((v) => (v.id === id ? { ...v, [field]: value } : v)) });
  };
  const deleteVersement = (id) => {
    patchActiveAccount({ versements: activeAccount.versements.filter((v) => v.id !== id) });
  };

  // ---------- Mutateurs : valorisations ----------
  const addValorisation = () => {
    patchActiveAccount({ valorisations: [...activeAccount.valorisations, { id: uid(), date: todayISO(), value: "" }] });
  };
  const updateValorisation = (id, field, value) => {
    patchActiveAccount({ valorisations: activeAccount.valorisations.map((v) => (v.id === id ? { ...v, [field]: value } : v)) });
  };
  const deleteValorisation = (id) => {
    patchActiveAccount({ valorisations: activeAccount.valorisations.filter((v) => v.id !== id) });
  };

  // ---------- Calculateur de répartition ----------
  const targets = activeAccount.allocationTargets || [];
  const persistTargets = (nextTargets) => patchActiveAccount({ allocationTargets: nextTargets });
  const addTarget = () => persistTargets([...targets, { id: uid(), etf: "", isin: "", targetPct: "", price: "" }]);
  const updateTarget = (id, field, value) => persistTargets(targets.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  const deleteTarget = (id) => persistTargets(targets.filter((t) => t.id !== id));
  const importFromPortfolio = () => {
    const existingNames = new Set(targets.map((t) => t.etf));
    const toAdd = etfList
      .filter((e) => !existingNames.has(e))
      .map((e) => ({ id: uid(), etf: e, isin: isinByEtf[e] || "", targetPct: "", price: "" }));
    if (toAdd.length) persistTargets([...targets, ...toAdd]);
  };
  const totalTargetPct = targets.reduce((s, t) => s + (Number(t.targetPct) || 0), 0);

  const allocationResult = useMemo(() => {
    const amt = Number(amountToInvest) || 0;
    let working = targets.map((t) => {
      const pct = Number(t.targetPct) || 0;
      const price = Number(t.price) || 0;
      const idealAmount = amt * (pct / 100);
      const qty = price > 0 ? (isCrypto ? idealAmount / price : Math.floor(idealAmount / price)) : 0;
      return { ...t, pct, price, idealAmount, qty, spent: qty * price };
    });
    let leftover = amt - working.reduce((s, r) => s + r.spent, 0);
    if (!isCrypto) {
      let safety = 0;
      while (safety < 1000) {
        safety++;
        let best = null;
        for (const r of working) {
          if (r.price > 0 && r.price <= leftover + 1e-9) {
            const gap = r.idealAmount - r.spent;
            if (!best || gap > best.gap) best = { row: r, gap };
          }
        }
        if (!best) break;
        best.row.qty += 1;
        best.row.spent += best.row.price;
        leftover -= best.row.price;
      }
    }
    return { rows: working, leftover, totalSpent: amt - leftover };
  }, [targets, amountToInvest, isCrypto]);

  const applyAllocationToOperations = () => {
    const newTx = allocationResult.rows
      .filter((r) => r.qty > 0)
      .map((r) => ({ id: uid(), date: todayISO(), etf: r.etf, isin: r.isin, type: "achat", quantity: r.qty, cost: r.price }));
    const newVersement = { id: uid(), date: todayISO(), type: "depot", amount: Number(amountToInvest) || 0 };
    patchActiveAccount({
      transactions: [...activeAccount.transactions, ...newTx],
      versements: [...activeAccount.versements, newVersement],
    });
    setAmountToInvest("");
  };

  // ---------- Objectifs d'épargne ----------
  const objectifs = activeAccount.objectifs || [];
  const addObjectif = () => {
    patchActiveAccount({ objectifs: [...objectifs, { id: uid(), label: "", targetAmount: "", targetDate: "" }] });
  };
  const updateObjectif = (id, field, value) => {
    patchActiveAccount({ objectifs: objectifs.map((o) => (o.id === id ? { ...o, [field]: value } : o)) });
  };
  const deleteObjectif = (id) => {
    patchActiveAccount({ objectifs: objectifs.filter((o) => o.id !== id) });
  };

  // ---------- Paliers de vente (crypto) ----------
  const sellTargets = activeAccount.sellTargets || [];
  const addSellTarget = (etf) => {
    patchActiveAccount({ sellTargets: [...sellTargets, { id: uid(), etf: etf || "", gainPct: "", sellPct: "" }] });
  };
  const updateSellTarget = (id, field, value) => {
    patchActiveAccount({ sellTargets: sellTargets.map((s) => (s.id === id ? { ...s, [field]: value } : s)) });
  };
  const deleteSellTarget = (id) => {
    patchActiveAccount({ sellTargets: sellTargets.filter((s) => s.id !== id) });
  };

  // ---------- Import / export ----------
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    try {
      const imported = await importJSONFile(file);
      const normalized = normalizeData(imported);
      persist(normalized);
    } catch (err) {
      setImportError(err.message);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target && e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "select" || tag === "textarea";
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoLastChange();
        return;
      }
      if (typing) return;
      if (e.key === "?") {
        setShowTutorial(true);
        return;
      }
      if (e.key.toLowerCase() === "n") {
        if (tab === "operations") addTransaction();
        else if (tab === "versements") addVersement();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data, tab, undoLastChange]);

  const PRIMARY_TABS = [
    { id: "vue", label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: "operations", label: "Opérations", icon: ListOrdered },
    { id: "versements", label: "Versements", icon: Wallet2 },
    { id: "parEtf", label: isCrypto ? "Par actif" : "Par ETF", icon: Layers },
  ];
  const ANALYSE_TABS = [
    { id: "calculateur", label: "Calculateur", icon: Calculator },
    { id: "objectifs", label: "Objectifs", icon: Target },
    { id: "valorisation", label: "Valorisation", icon: TrendingUp },
    { id: "repartition", label: "Répartition", icon: PieIcon },
  ];
  const isAnalyseTab = ANALYSE_TABS.some((t) => t.id === tab);

  const assetLabel = isCrypto ? "actif" : "ETF / titre";

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", fontFamily: "Inter", color: COLORS.text, "--accent": accent }}>
      {/* Header */}
      <div style={{ background: headerBg, padding: "18px 20px 14px", transition: "background 0.35s ease" }}>
        <div className="pea-header-row">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 26, color: "#FFFFFF" }}>
                Suivi de portefeuille
              </div>
              <span
                style={{
                  fontFamily: "IBM Plex Mono", fontSize: 11.5, fontWeight: 700, letterSpacing: 0.8,
                  color: headerBg, background: accent, padding: "3px 9px", borderRadius: 5,
                  textTransform: "uppercase",
                }}
              >
                {(KIND_META[activeAccount.kind] || KIND_META.Autre).label}
              </span>
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#9BB0C4", marginTop: 4 }}>
              Profil : {profileName} · {activeAccount.name} {saving ? "· enregistrement…" : ""}
            </div>
          </div>
          <div className="pea-stats">
            <StatChip label="Total versé" value={fmtMoney(totalVerse)} />
            <StatChip label="Total investi" value={fmtMoney(totalInvesti)} />
            <StatChip label="Liquidités" value={fmtMoney(solde)} accent={solde < 0 ? "#E8A2A2" : "#E8D5B0"} />
          </div>
        </div>

        {/* Sélecteur de comptes */}
        <div className="pea-accounts">
          {data.accounts.map((a) => {
            const Meta = KIND_META[a.kind] || KIND_META.Autre;
            const Icon = Meta.icon;
            const active = a.id === activeAccount.id;
            return (
              <div key={a.id} className={active ? "pea-acc-chip active" : "pea-acc-chip"}>
                <button className="pea-acc-btn" onClick={() => switchAccount(a.id)}>
                  <Icon size={13} /> {a.name}
                </button>
                {data.accounts.length > 1 && (
                  <button className="pea-acc-del" onClick={() => deleteAccount(a.id)} title="Supprimer ce compte">
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
          <button className="pea-acc-add" onClick={() => setShowNewAccount((s) => !s)}>
            <Plus size={13} /> Compte
          </button>
        </div>
        {showNewAccount && (
          <div className="pea-acc-form">
            <input
              className="gate-input"
              style={{ maxWidth: 180 }}
              placeholder="Nom (ex. Binance)"
              value={newAccName}
              onChange={(e) => setNewAccName(e.target.value)}
            />
            <select className="gate-input" style={{ maxWidth: 160 }} value={newAccKind} onChange={(e) => setNewAccKind(e.target.value)}>
              {Object.entries(KIND_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </select>
            <button style={addBtnStyle} onClick={createAccount}>Créer</button>
          </div>
        )}

        <div className="pea-toolbar">
          {canUndo && (
            <button className="pea-toolbtn" onClick={undoLastChange} title="Annuler la dernière modification (Ctrl+Z)">
              <ArrowUp size={13} style={{ transform: "rotate(-90deg)" }} /> Annuler
            </button>
          )}
          <button className="pea-toolbtn" onClick={() => { exportJSON(profileName, data); markExported(); }}>
            <Download size={13} /> Export JSON (tout)
          </button>
          <button className="pea-toolbtn" onClick={() => { exportPDF(profileName, activeAccount.name, activeAccount); markExported(); }}>
            <FileText size={13} /> Export PDF ({activeAccount.name})
          </button>
          <button className="pea-toolbtn" onClick={() => { exportCSV(profileName, activeAccount.name, activeAccount); markExported(); }}>
            <FileSpreadsheet size={13} /> Export CSV ({activeAccount.name})
          </button>
          <label className="pea-toolbtn" style={{ cursor: "pointer" }}>
            <Upload size={13} /> Importer
            <input type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />
          </label>
          <button className="pea-toolbtn" onClick={onLogout}>
            <LogOut size={13} /> Changer de profil
          </button>
          <button className="pea-toolbtn" onClick={() => setShowTutorial(true)} title="Aide et tutoriel">
            <HelpCircle size={13} /> Aide
          </button>
          <button className="pea-toolbtn" onClick={() => setDark((d) => !d)} title={dark ? "Mode clair" : "Mode sombre"}>
            {dark ? <Sun size={13} /> : <Moon size={13} />} {dark ? "Mode clair" : "Mode sombre"}
          </button>
        </div>
        {importError && <div style={{ color: "#E8A2A2", fontSize: 12, marginTop: 6 }}>{importError}</div>}
      </div>

      {/* Tabs */}
      <div className="pea-tabs">
        {PRIMARY_TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={active ? "pea-tab active" : "pea-tab"}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
        <div className="pea-analyse-wrap">
          <button
            ref={analyseBtnRef}
            onClick={toggleAnalyseMenu}
            className={isAnalyseTab ? "pea-tab active" : "pea-tab"}
          >
            <Layers size={15} /> {isAnalyseTab ? ANALYSE_TABS.find((t) => t.id === tab)?.label : "Analyse"}
            <ChevronDown size={13} style={{ transform: showAnalyseMenu ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        </div>
      </div>
      {showAnalyseMenu &&
        createPortal(
          <div
            ref={analyseMenuRef}
            className="pea-analyse-menu"
            style={{ position: "fixed", top: analyseMenuPos.top, left: analyseMenuPos.left }}
          >
            {ANALYSE_TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  className={active ? "pea-analyse-item active" : "pea-analyse-item"}
                  onClick={() => { setTab(t.id); setShowAnalyseMenu(false); }}
                >
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}

      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
        {tab === "vue" && (
          <>
            <SectionCard style={{ padding: "14px 20px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 22px", alignItems: "center", fontFamily: "Inter", fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: COLORS.text }}>Aujourd'hui</span>
                <span style={{ color: COLORS.text }}>
                  <strong style={{ fontFamily: "IBM Plex Mono" }}>{todaySummary.versementsThisMonth}</strong> versement{todaySummary.versementsThisMonth > 1 ? "s" : ""} ce mois-ci
                </span>
                <span style={{ color: COLORS.text }}>
                  Dernier versement :{" "}
                  <strong style={{ fontFamily: "IBM Plex Mono" }}>
                    {todaySummary.daysSince === null ? "aucun" : todaySummary.daysSince === 0 ? "aujourd'hui" : `il y a ${todaySummary.daysSince} j`}
                  </strong>
                </span>
                {todaySummary.palierTotal > 0 && (
                  <span style={{ color: COLORS.text }}>
                    Paliers de vente :{" "}
                    <strong style={{ fontFamily: "IBM Plex Mono", color: todaySummary.palierAtteints > 0 ? COLORS.green : COLORS.text }}>
                      {todaySummary.palierAtteints}/{todaySummary.palierTotal} atteint{todaySummary.palierAtteints > 1 ? "s" : ""}
                    </strong>
                  </span>
                )}
              </div>
            </SectionCard>

            {hasAnyData && (daysSinceExport === null || daysSinceExport > 30) && (
              <SectionCard style={{ padding: "12px 20px", background: "#FBF3E3", borderLeft: `4px solid ${COLORS.gold}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontFamily: "Inter", fontSize: 13 }}>
                  <Download size={15} color={COLORS.gold} />
                  <span>
                    {daysSinceExport === null
                      ? "Tu n'as encore jamais exporté tes données."
                      : `Ton dernier export remonte à ${daysSinceExport} jours.`}{" "}
                    Pense à faire une sauvegarde (bouton "Export JSON" en haut) — tes données ne sont stockées que sur cet appareil.
                  </span>
                </div>
              </SectionCard>
            )}

            <SectionCard>
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
                Vue d'ensemble
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 14 }}>
                Patrimoine total, tous comptes confondus. Quand aucune valorisation n'est renseignée pour un
                compte, son montant net investi est utilisé comme estimation (marqué "≈").
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <MiniStat label="Patrimoine total" value={fmtMoney(overview.totalValue)} />
                <MiniStat label="Total versé (tous comptes)" value={fmtMoney(overview.totalVerseAll)} />
                <MiniStat
                  label="+/- value globale"
                  value={(overview.totalDiff >= 0 ? "+" : "") + fmtMoney(overview.totalDiff)}
                />
                <MiniStat label="Rendement global" value={fmtPct(pctReturn(overview.totalDiff, overview.totalVerseAll))} />
              </div>
            </SectionCard>

            <SectionCard>
              <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 14 }}>
                Mes comptes
              </div>
              <div className="pea-overview-grid">
                {overview.rows.map((r) => {
                  const Meta = KIND_META[r.kind] || KIND_META.Autre;
                  const Icon = Meta.icon;
                  return (
                    <button key={r.id} className="pea-overview-card" onClick={() => goToAccount(r.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div className="pea-overview-icon"><Icon size={15} /></div>
                        <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 14.5, color: COLORS.text }}>
                          {r.name}
                        </div>
                        <ArrowRight size={14} color={COLORS.muted} style={{ marginLeft: "auto" }} />
                      </div>
                      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 20, fontWeight: 700, color: COLORS.text }}>
                        {r.estimated ? "≈ " : ""}{fmtMoney(r.value)}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, fontFamily: "IBM Plex Mono", color: COLORS.muted }}>
                        <span>Versé : {fmtMoney(r.netVerse)}</span>
                        <span style={{ color: r.diff >= 0 ? COLORS.green : COLORS.red, fontWeight: 600 }}>
                          {r.diff >= 0 ? "+" : ""}{fmtMoney(r.diff)} ({fmtPct(pctReturn(r.diff, r.netVerse))})
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            {comparisonData.series.length > 0 && comparisonData.rows.length > 1 && (
              <SectionCard>
                <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  Comparateur de comptes
                </div>
                <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
                  Évolution de la valorisation de chaque compte dans le temps (nécessite des entrées dans l'onglet Valorisation).
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={comparisonData.rows}>
                    <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Inter" }} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
                    <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }} />
                    <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12.5 }} />
                    {comparisonData.series.map((s) => (
                      <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            <SectionCard>
              <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                Répartition par compte
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                Clique sur une part (ou un compte dans la légende) pour l'ouvrir directement.
              </div>
              {overview.rows.filter((r) => r.value > 0).length === 0 ? (
                <div style={{ color: COLORS.muted, padding: 20 }}>Pas encore de données à répartir.</div>
              ) : (
                <div className="pea-pie-wrap">
                  <div className="pea-pie-chart">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={overview.rows.filter((r) => r.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={65}
                          outerRadius={120}
                          paddingAngle={2}
                          label={renderPiePercentLabel}
                          labelLine={false}
                        >
                          {overview.rows
                            .filter((r) => r.value > 0)
                            .map((r, i) => (
                              <Cell
                                key={r.id}
                                fill={PALETTE[i % PALETTE.length]}
                                cursor="pointer"
                                onClick={() => goToAccount(r.id)}
                              />
                            ))}
                        </Pie>
                        <Tooltip formatter={pieTooltip(overview.totalValue)} contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {overview.rows.filter((r) => r.value > 0).map((r, i) => (
                      <button key={r.id} className="pea-legend-row" onClick={() => goToAccount(r.id)}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                        <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, width: 140, textAlign: "left" }}>{r.name}</div>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 13.5 }}>{fmtMoney(r.value)}</div>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12.5, color: COLORS.muted }}>
                          {overview.totalValue ? ((r.value / overview.totalValue) * 100).toFixed(1) : "0.0"}%
                        </div>
                        <ArrowRight size={13} color={COLORS.muted} style={{ marginLeft: "auto" }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          </>
        )}

        {tab === "operations" && (
          <SectionCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>
                Achats & ventes {isCrypto ? "de cryptos" : "de titres"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setShowImportCsv(true)} style={addBtnStyleOutline}><Upload size={14} /> Import CSV</button>
                <button onClick={addTransaction} style={addBtnStyle}><Plus size={14} /> Ligne</button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder="Rechercher un actif, un code, achat/vente…"
                style={{ ...inputStyle, fontFamily: "Inter", maxWidth: 280 }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: COLORS.muted, cursor: "pointer" }}>
                <input type="checkbox" checked={showIsinCol} onChange={(e) => setShowIsinCol(e.target.checked)} />
                Afficher le code / ISIN
              </label>
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
              Astuce : pour une ligne, remplis la quantité <em>ou</em> le prix unitaire, puis le montant total en € —
              l'autre se calcule automatiquement. Clique sur un en-tête de colonne pour trier ; les flèches ▲▼ ne
              réordonnent manuellement que lorsqu'aucun tri n'est actif.
              {txSortCol && (
                <button
                  onClick={() => { setTxSortCol(null); setTxSortDir("asc"); }}
                  style={{ marginLeft: 8, border: "none", background: "none", color: COLORS.text, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                >
                  Réinitialiser le tri
                </button>
              )}
            </div>
            {selectedTxIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: COLORS.goldLight, borderRadius: 8, padding: "8px 12px", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.navy }}>{selectedTxIds.size} ligne(s) sélectionnée(s)</span>
                <button onClick={bulkCloneTx} style={{ ...addBtnStyleOutline, padding: "5px 10px", fontSize: 11.5 }}><Copy size={12} /> Dupliquer</button>
                <button onClick={bulkDeleteTx} style={{ ...addBtnStyleOutline, padding: "5px 10px", fontSize: 11.5, color: COLORS.red, borderColor: COLORS.red }}><Trash2 size={12} /> Supprimer</button>
                <button onClick={() => setSelectedTxIds(new Set())} style={{ border: "none", background: "none", color: COLORS.muted, fontSize: 11.5, cursor: "pointer", marginLeft: "auto" }}>Annuler la sélection</button>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="pea-card-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead className="pea-sticky-thead">
                  <tr>
                    <th style={{ ...th, width: 20 }}></th>
                    <th style={{ ...th, width: 24 }}>
                      <input
                        type="checkbox"
                        checked={displayedTransactions.length > 0 && selectedTxIds.size === displayedTransactions.length}
                        onChange={toggleSelectAllTx}
                        title="Tout sélectionner"
                      />
                    </th>
                    <th style={th}>#</th>
                    <SortableTh col="date" label="Date" sortCol={txSortCol} sortDir={txSortDir} onSort={toggleTxSort} />
                    <SortableTh col="type" label="Type" sortCol={txSortCol} sortDir={txSortDir} onSort={toggleTxSort} />
                    <SortableTh col="etf" label={isCrypto ? "Actif" : "ETF / titre"} sortCol={txSortCol} sortDir={txSortDir} onSort={toggleTxSort} />
                    {showIsinCol && <SortableTh col="isin" label="Code / ISIN" sortCol={txSortCol} sortDir={txSortDir} onSort={toggleTxSort} />}
                    <SortableTh col="quantity" label="Quantité" align="right" sortCol={txSortCol} sortDir={txSortDir} onSort={toggleTxSort} />
                    <SortableTh col="cost" label="Prix unitaire" align="right" sortCol={txSortCol} sortDir={txSortDir} onSort={toggleTxSort} />
                    <SortableTh col="montant" label="Montant" align="right" sortCol={txSortCol} sortDir={txSortDir} onSort={toggleTxSort} />
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTransactions.map((t, i) => {
                    const ccy = costCcyMap[t.id] || "EUR";
                    const montantVal = (Number(t.quantity) || 0) * (Number(t.cost) || 0);
                    const isSelected = selectedTxId === t.id;
                    return (
                      <tr
                        key={t.id}
                        id={`tx-row-${t.id}`}
                        onClick={() => setSelectedTxId(t.id)}
                        onTouchStart={handleTxTouchStart}
                        onTouchMove={handleTxTouchMove}
                        onTouchEnd={(e) => handleTxTouchEnd(e, t)}
                        onDragOver={(e) => { if (!txSortCol) e.preventDefault(); }}
                        onDrop={(e) => {
                          if (txSortCol) return;
                          e.preventDefault();
                          const fromId = dragIdRef.current;
                          if (fromId) reorderTransactionByDrop(fromId, t.id);
                          dragIdRef.current = null;
                          setDragRowId(null);
                        }}
                        style={{
                          background: isSelected ? COLORS.goldLight : "transparent",
                          boxShadow: isSelected ? `inset 3px 0 0 0 ${accent}` : "none",
                          opacity: dragRowId === t.id ? 0.4 : 1,
                          transition: "background 0.2s",
                        }}
                      >
                        <td
                          style={{ ...td, textAlign: "center", cursor: txSortCol ? "default" : "grab", opacity: txSortCol ? 0.3 : 1 }}
                          draggable={!txSortCol}
                          onDragStart={(e) => {
                            if (txSortCol) return;
                            dragIdRef.current = t.id;
                            setDragRowId(t.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => { dragIdRef.current = null; setDragRowId(null); }}
                          title={txSortCol ? "Désactive le tri pour réordonner" : "Glisser pour réordonner"}
                        >
                          <GripVertical size={14} color={COLORS.muted} />
                        </td>
                        <td data-label="Sélection" style={td} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedTxIds.has(t.id)} onChange={() => toggleTxSelected(t.id)} />
                        </td>
                        <td data-label="#" style={{ ...td, color: COLORS.muted, fontFamily: "IBM Plex Mono", fontSize: 12 }}>{i + 1}</td>
                        <td data-label="Date" style={td}>
                          <input type="date" value={t.date} onChange={(e) => updateTransaction(t.id, "date", e.target.value)} style={inputStyle} />
                        </td>
                        <td data-label="Type" style={td}>
                          <select value={t.type || "achat"} onChange={(e) => updateTransaction(t.id, "type", e.target.value)} style={{ ...selectStyle, minWidth: 90 }}>
                            <option value="achat">Achat</option>
                            <option value="vente">Vente</option>
                          </select>
                        </td>
                        <td data-label="Actif" style={td}>
                          <input list="etf-names" value={t.etf} onChange={(e) => updateTransaction(t.id, "etf", e.target.value)} style={{ ...inputStyle, fontFamily: "Inter", minWidth: 130 }} placeholder={isCrypto ? "Ex. BTC" : "Ex. MSCI World"} />
                        </td>
                        {showIsinCol && (
                          <td data-label="Code / ISIN" style={td}>
                            <input value={t.isin || ""} onChange={(e) => updateTransaction(t.id, "isin", e.target.value.toUpperCase())} style={{ ...inputStyle, letterSpacing: 0.5, minWidth: 110 }} placeholder={isCrypto ? "Ex. BTC" : "Ex. FR0013412020"} maxLength={16} />
                          </td>
                        )}
                        <td data-label="Quantité" style={{ ...td, textAlign: "right" }}>
                          <input type="number" step="any" value={t.quantity} onChange={(e) => updateTransaction(t.id, "quantity", e.target.value)} style={{ ...inputStyle, textAlign: "right", minWidth: 90 }} placeholder={isCrypto ? "Ex. 0.05" : "Ex. 10"} />
                        </td>
                        <td data-label="Prix unitaire" style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              {ccy === "EUR" ? (
                                <input type="number" step="0.0001" value={t.cost} onChange={(e) => updateTransaction(t.id, "cost", e.target.value)} style={{ ...inputStyle, textAlign: "right", width: 92 }} placeholder="Ex. 45.20" />
                              ) : (
                                <input
                                  type="number" step="0.0001"
                                  value={costUsdDraftMap[t.id] ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCostUsdDraftMap((prev) => ({ ...prev, [t.id]: v }));
                                    if (usdRate && v !== "") updateTransaction(t.id, "cost", Number(v) * usdRate);
                                  }}
                                  style={{ ...inputStyle, textAlign: "right", width: 92 }}
                                  placeholder="Ex. 49.00"
                                />
                              )}
                              <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 5, overflow: "hidden", flexShrink: 0 }}>
                                <button type="button" onClick={() => setCostCcyMap((p) => ({ ...p, [t.id]: "EUR" }))} style={{ border: "none", padding: "4px 6px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", background: ccy === "EUR" ? COLORS.navy : "#fff", color: ccy === "EUR" ? "#fff" : COLORS.muted }}>€</button>
                                <button type="button" onClick={async () => { setCostCcyMap((p) => ({ ...p, [t.id]: "USD" })); await ensureUsdRate(); }} style={{ border: "none", padding: "4px 6px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", background: ccy === "USD" ? COLORS.navy : "#fff", color: ccy === "USD" ? "#fff" : COLORS.muted }}>$</button>
                              </div>
                            </div>
                            {ccy === "USD" && (
                              <div style={{ fontSize: 10.5, color: COLORS.muted }}>
                                {usdRateLoading ? (
                                  "Taux…"
                                ) : usdRate ? (
                                  `≈ ${fmtMoney(Number(t.cost) || 0, 2, 4)}`
                                ) : (
                                  <span style={{ color: COLORS.red }}>
                                    {usdRateError || "Taux indisponible"} <button type="button" onClick={ensureUsdRate} style={{ border: "none", background: "none", color: COLORS.text, textDecoration: "underline", cursor: "pointer", fontSize: 10.5, padding: 0 }}>réessayer</button>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td data-label="Montant" style={{ ...td, textAlign: "right" }}>
                          <input
                            type="number" step="0.01"
                            value={montantVal ? montantVal : ""}
                            onChange={(e) => handleMontantChange(t.id, e.target.value)}
                            style={{ ...inputStyle, textAlign: "right", minWidth: 95, fontWeight: 600, color: t.type === "vente" ? COLORS.red : COLORS.text }}
                            placeholder="Ex. 100"
                          />
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 3, justifyContent: "center" }}>
                            <button
                              type="button" title="Monter"
                              disabled={!!txSortCol || i === 0}
                              onClick={() => moveTransaction(t.id, -1)}
                              style={{ ...miniIconBtnStyle, opacity: !!txSortCol || i === 0 ? 0.3 : 1, cursor: !!txSortCol || i === 0 ? "default" : "pointer" }}
                            ><ChevronUp size={13} color={COLORS.navy} /></button>
                            <button
                              type="button" title="Descendre"
                              disabled={!!txSortCol || i === displayedTransactions.length - 1}
                              onClick={() => moveTransaction(t.id, 1)}
                              style={{ ...miniIconBtnStyle, opacity: !!txSortCol || i === displayedTransactions.length - 1 ? 0.3 : 1, cursor: !!txSortCol || i === displayedTransactions.length - 1 ? "default" : "pointer" }}
                            ><ChevronDown size={13} color={COLORS.navy} /></button>
                            <button type="button" title="Dupliquer cette ligne" onClick={() => cloneTransaction(t.id)} style={miniIconBtnStyle}>
                              <Copy size={13} color={COLORS.navy} />
                            </button>
                            <RowActions onDelete={() => deleteTransaction(t.id)} deleteLabel="cette opération" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>Total net</td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    {showIsinCol && <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>}
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700 }}>
                      {fmtQty(totalQty, isCrypto)}
                    </td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700, color: COLORS.gold }}>
                      {fmtMoney(totalInvesti)}
                    </td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                  </tr>
                </tbody>
              </table>
              <datalist id="etf-names">
                {etfList.map((e) => <option key={e} value={e} />)}
              </datalist>
            </div>
          </SectionCard>
        )}

        {tab === "versements" && (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <MiniStat label="Total net" value={fmtMoney(totalVerse)} />
              <MiniStat label="Moyenne mensuelle" value={distinctMonthsCount ? fmtMoney(avgMonthlyVersement) : "—"} />
              <MiniStat label="Dernier versement" value={daysSinceLastVersement === null ? "—" : `il y a ${daysSinceLastVersement} j`} />
            </div>

            {versementMonthly.length > 0 && (
              <SectionCard>
                <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                  Versements par mois
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={versementMonthly}>
                    <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "Inter" }} />
                    <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
                    <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }} />
                    <Bar dataKey="net" radius={[3, 3, 0, 0]}>
                      {versementMonthly.map((d, i) => (
                        <Cell key={i} fill={d.net >= 0 ? COLORS.green : COLORS.red} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </SectionCard>
            )}

            <SectionCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>Dépôts & retraits</div>
                <button onClick={addVersement} style={addBtnStyle}><Plus size={14} /> Versement</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 520 }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={th}>Type</th>
                      <th style={{ ...th, textAlign: "right" }}>Montant</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVersements.map((v) => (
                      <tr
                        key={v.id}
                        id={`vers-row-${v.id}`}
                        onClick={() => setSelectedVersId(v.id)}
                        style={{
                          background: selectedVersId === v.id ? COLORS.goldLight : "transparent",
                          boxShadow: selectedVersId === v.id ? `inset 3px 0 0 0 ${accent}` : "none",
                          transition: "background 0.2s",
                        }}
                      >
                        <td style={td}>
                          <input type="date" value={v.date} onChange={(e) => updateVersement(v.id, "date", e.target.value)} style={inputStyle} />
                        </td>
                        <td style={td}>
                          <select value={v.type || "depot"} onChange={(e) => updateVersement(v.id, "type", e.target.value)} style={{ ...selectStyle, minWidth: 90 }}>
                            <option value="depot">Dépôt</option>
                            <option value="retrait">Retrait</option>
                          </select>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              {(versCcyMap[v.id] || "EUR") === "EUR" ? (
                                <input type="number" step="0.01" value={v.amount} onChange={(e) => updateVersement(v.id, "amount", e.target.value)} style={{ ...inputStyle, textAlign: "right", width: 100 }} placeholder="Ex. 200" />
                              ) : (
                                <input
                                  type="number" step="0.01"
                                  value={versUsdDraftMap[v.id] ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setVersUsdDraftMap((prev) => ({ ...prev, [v.id]: val }));
                                    if (usdRate && val !== "") updateVersement(v.id, "amount", Number(val) * usdRate);
                                  }}
                                  style={{ ...inputStyle, textAlign: "right", width: 100 }}
                                  placeholder="Ex. 220"
                                />
                              )}
                              <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 5, overflow: "hidden", flexShrink: 0 }}>
                                <button type="button" onClick={() => setVersCcyMap((p) => ({ ...p, [v.id]: "EUR" }))} style={{ border: "none", padding: "4px 6px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", background: (versCcyMap[v.id] || "EUR") === "EUR" ? COLORS.navy : "#fff", color: (versCcyMap[v.id] || "EUR") === "EUR" ? "#fff" : COLORS.muted }}>€</button>
                                <button type="button" onClick={async () => { setVersCcyMap((p) => ({ ...p, [v.id]: "USD" })); await ensureUsdRate(); }} style={{ border: "none", padding: "4px 6px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", background: versCcyMap[v.id] === "USD" ? COLORS.navy : "#fff", color: versCcyMap[v.id] === "USD" ? "#fff" : COLORS.muted }}>$</button>
                              </div>
                            </div>
                            {versCcyMap[v.id] === "USD" && (
                              <div style={{ fontSize: 10.5, color: COLORS.muted }}>
                                {usdRateLoading ? (
                                  "Taux…"
                                ) : usdRate ? (
                                  `≈ ${fmtMoney(Number(v.amount) || 0)}`
                                ) : (
                                  <span style={{ color: COLORS.red }}>
                                    {usdRateError || "Taux indisponible"} <button type="button" onClick={ensureUsdRate} style={{ border: "none", background: "none", color: COLORS.text, textDecoration: "underline", cursor: "pointer", fontSize: 10.5, padding: 0 }}>réessayer</button>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <RowActions onDelete={() => deleteVersement(v.id)} deleteLabel="ce versement" />
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>Total net</td>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700, color: COLORS.gold }}>
                        {fmtMoney(totalVerse)}
                      </td>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}

        {tab === "parEtf" && (
          <SectionCard>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              {etfList.length === 0 && (
                <div style={{ color: COLORS.muted, fontSize: 13.5 }}>Ajoute d'abord des opérations dans l'onglet Opérations.</div>
              )}
              {etfList.map((etf) => (
                <button
                  key={etf}
                  onClick={() => setSelectedEtf(etf)}
                  style={{
                    padding: "7px 14px", borderRadius: 20,
                    border: `1px solid ${selectedEtf === etf ? COLORS.navy : COLORS.border}`,
                    background: selectedEtf === etf ? COLORS.navy : COLORS.cardAlt,
                    color: selectedEtf === etf ? "#fff" : COLORS.text,
                    fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  {etf}
                </button>
              ))}
            </div>
            {(() => {
              const etf = selectedEtf || etfList[0];
              if (!etf) return null;
              const rows = activeAccount.transactions.filter((t) => t.etf === etf);
              const qty = perEtf[etf]?.qty || 0;
              const montant = perEtf[etf]?.montant || 0;
              const coutMoyen = qty ? montant / qty : 0;
              const liveKey = (etf || "").toUpperCase();
              const livePrice = cryptoPrices[liveKey];
              const currentValue = livePrice ? qty * livePrice : null;
              const gain = currentValue !== null ? currentValue - montant : null;
              const etfSellTargets = sellTargets.filter((s) => s.etf === etf);

              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                    <div style={{ fontFamily: "Fraunces", fontSize: 19, fontWeight: 600 }}>{etf}</div>
                    {isinByEtf[etf] && (
                      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11.5, color: COLORS.navy, background: COLORS.goldLight, padding: "3px 8px", borderRadius: 5, letterSpacing: 0.5 }}>
                        {isinByEtf[etf]}
                      </div>
                    )}
                    {isCrypto && (
                      <button className="pea-refresh-btn" disabled={pricesLoading} onClick={() => refreshPrices([etf])} style={{ marginLeft: "auto" }}>
                        <RefreshCw size={13} className={pricesLoading ? "pea-spin" : ""} />
                        {pricesLoading ? "Actualisation…" : livePrice ? `Prix : ${fmtMoney(livePrice, 2, 4)}` : "Actualiser le prix"}
                      </button>
                    )}
                  </div>
                  {pricesError && <div style={{ color: COLORS.red, fontSize: 12, marginBottom: 10 }}>{pricesError}</div>}

                  {isCrypto && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 11.5, color: COLORS.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>
                          Historique
                        </div>
                        {[7, 30, 90].map((d) => (
                          <button
                            key={d}
                            onClick={() => { setHistoryDays(d); loadCryptoHistory(etf, d); }}
                            style={{
                              border: "none", borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                              background: historyDays === d && cryptoHistory[liveKey] ? COLORS.navy : COLORS.cardAlt,
                              color: historyDays === d && cryptoHistory[liveKey] ? "#fff" : COLORS.muted,
                            }}
                          >
                            {d} j
                          </button>
                        ))}
                        {historyLoading && <span style={{ fontSize: 11, color: COLORS.muted }}>chargement…</span>}
                      </div>
                      {cryptoHistory[liveKey] && cryptoHistory[liveKey].length > 1 ? (
                        <ResponsiveContainer width="100%" height={90}>
                          <LineChart data={cryptoHistory[liveKey]}>
                            <XAxis dataKey="t" hide />
                            <YAxis domain={["auto", "auto"]} hide />
                            <Line type="monotone" dataKey="price" stroke={accent} strokeWidth={2} dot={false} />
                            <Tooltip
                              formatter={(v) => fmtMoney(v, 2, 4)}
                              labelFormatter={(t) => new Date(t).toLocaleDateString("fr-FR")}
                              contentStyle={{ fontFamily: "Inter", fontSize: 11.5, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ fontSize: 12, color: COLORS.muted }}>Choisis une période ci-dessus pour charger le graphique.</div>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
                    <MiniStat label="Quantité nette" value={fmtQty(qty, isCrypto)} />
                    <MiniStat label="Coût moyen pondéré" value={fmtMoney(coutMoyen, 2, 4)} />
                    <MiniStat label="Montant net investi" value={fmtMoney(montant)} />
                    {currentValue !== null && <MiniStat label="Valeur actuelle" value={fmtMoney(currentValue)} />}
                    {gain !== null && (
                      <div style={{ background: COLORS.cardAlt, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px" }}>
                        <div style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.muted }}>Gain latent</div>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 17, fontWeight: 600, color: gain >= 0 ? COLORS.green : COLORS.red, marginTop: 2 }}>
                          {gain >= 0 ? "+" : ""}{fmtMoney(gain)} ({fmtPct(pctReturn(gain, montant))})
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>Date</th>
                          <th style={th}>Type</th>
                          <th style={{ ...th, textAlign: "right" }}>Quantité</th>
                          <th style={{ ...th, textAlign: "right" }}>Prix unitaire</th>
                          <th style={{ ...th, textAlign: "right" }}>Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td style={td}>{fmtDate(r.date)}</td>
                            <td style={{ ...td, color: r.type === "vente" ? COLORS.red : COLORS.green, fontWeight: 600 }}>
                              {r.type === "vente" ? "Vente" : "Achat"}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtQty(Number(r.quantity) || 0, isCrypto)}</td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtCost(Number(r.cost))} €</td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtMoney((Number(r.quantity) || 0) * (Number(r.cost) || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {isCrypto && (
                    <div style={{ marginTop: 24, borderTop: `1px solid ${COLORS.border}`, paddingTop: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600 }}>Paliers de vente — {etf}</div>
                        <button onClick={() => addSellTarget(etf)} style={addBtnStyle}><Plus size={14} /> Palier</button>
                      </div>
                      <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                        Ex. vendre 25% de ta position quand le prix aura pris +30% par rapport à ton coût moyen ({fmtMoney(coutMoyen, 2, 4)}).
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              <th style={th}>Palier</th>
                              <th style={{ ...th, textAlign: "right" }}>Gain cible</th>
                              <th style={{ ...th, textAlign: "right" }}>% à vendre</th>
                              <th style={{ ...th, textAlign: "right" }}>Prix cible</th>
                              <th style={{ ...th, textAlign: "right" }}>Quantité à vendre</th>
                              <th style={th}>Statut</th>
                              <th style={th}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {etfSellTargets.map((s, i) => {
                              const gainPct = Number(s.gainPct) || 0;
                              const sellPct = Number(s.sellPct) || 0;
                              const targetPrice = coutMoyen * (1 + gainPct / 100);
                              const qtyToSell = qty * (sellPct / 100);
                              const reached = livePrice !== undefined && targetPrice > 0 && livePrice >= targetPrice;
                              const progress = livePrice && targetPrice > 0 ? Math.max(0, Math.min(100, (livePrice / targetPrice) * 100)) : 0;
                              return (
                                <tr key={s.id}>
                                  <td style={{ ...td, fontWeight: 600 }}>#{i + 1}</td>
                                  <td style={{ ...td, textAlign: "right" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                                      <input type="number" step="1" value={s.gainPct} onChange={(e) => updateSellTarget(s.id, "gainPct", e.target.value)} style={{ ...inputStyle, textAlign: "right", width: 70 }} placeholder="30" />
                                      <span style={{ color: COLORS.muted, fontSize: 12 }}>%</span>
                                    </div>
                                  </td>
                                  <td style={{ ...td, textAlign: "right" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                                      <input type="number" step="1" value={s.sellPct} onChange={(e) => updateSellTarget(s.id, "sellPct", e.target.value)} style={{ ...inputStyle, textAlign: "right", width: 70 }} placeholder="25" />
                                      <span style={{ color: COLORS.muted, fontSize: 12 }}>%</span>
                                    </div>
                                  </td>
                                  <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", color: COLORS.muted }}>
                                    {coutMoyen > 0 ? fmtMoney(targetPrice, 2, 4) : "—"}
                                  </td>
                                  <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600 }}>
                                    {qty > 0 ? fmtQty(qtyToSell, true) : "—"}
                                  </td>
                                  <td style={{ ...td, minWidth: 130 }}>
                                    {livePrice ? (
                                      <>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: reached ? COLORS.green : COLORS.muted }}>
                                          {reached ? "Atteint ✓" : `${progress.toFixed(0)}%`}
                                        </div>
                                        <div className="pea-progress-track" style={{ marginTop: 3 }}>
                                          <div className="pea-progress-fill" style={{ width: `${progress}%`, background: reached ? COLORS.green : "var(--accent, #0ECB81)" }} />
                                        </div>
                                      </>
                                    ) : (
                                      <span style={{ color: COLORS.muted, fontSize: 12 }}>Actualise le prix</span>
                                    )}
                                  </td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    <RowActions onDelete={() => deleteSellTarget(s.id)} deleteLabel="ce palier" />
                                  </td>
                                </tr>
                              );
                            })}
                            {etfSellTargets.length === 0 && (
                              <tr><td colSpan={7} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: 16 }}>Aucun palier pour {etf}.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </SectionCard>
        )}

        {tab === "calculateur" && (
          <>
            <SectionCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>Répartition cible</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {isCrypto && (
                    <button
                      className="pea-refresh-btn"
                      disabled={pricesLoading}
                      onClick={async () => {
                        const prices = await refreshPrices(targets.map((t) => t.etf));
                        targets.forEach((t) => {
                          const p = prices[(t.etf || "").toUpperCase()];
                          if (p) updateTarget(t.id, "price", p);
                        });
                      }}
                    >
                      <RefreshCw size={13} className={pricesLoading ? "pea-spin" : ""} />
                      {pricesLoading ? "Actualisation…" : "Actualiser les prix"}
                    </button>
                  )}
                  <button onClick={importFromPortfolio} style={addBtnStyleOutline}>Importer mes {assetLabel}s</button>
                  <button onClick={addTarget} style={addBtnStyle}><Plus size={14} /> Ligne</button>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                Renseigne le pourcentage cible et le prix unitaire actuel de chaque {assetLabel}. Le total doit faire 100%.
                {isCrypto && " Les quantités crypto peuvent être fractionnées (pas d'arrondi à l'unité entière)."}
              </div>
              {pricesError && <div style={{ color: COLORS.red, fontSize: 12, marginBottom: 10 }}>{pricesError}</div>}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>{isCrypto ? "Actif" : "ETF"}</th>
                      <th style={th}>Code / ISIN</th>
                      <th style={{ ...th, textAlign: "right" }}>Allocation cible (%)</th>
                      <th style={{ ...th, textAlign: "right" }}>Prix unitaire</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((t) => (
                      <tr key={t.id}>
                        <td style={td}>
                          <input list="etf-names" value={t.etf} onChange={(e) => updateTarget(t.id, "etf", e.target.value)} style={{ ...inputStyle, fontFamily: "Inter", minWidth: 130 }} placeholder={isCrypto ? "Ex. BTC" : "Ex. MSCI World"} />
                        </td>
                        <td style={td}>
                          <input value={t.isin || ""} onChange={(e) => updateTarget(t.id, "isin", e.target.value.toUpperCase())} style={{ ...inputStyle, letterSpacing: 0.5, minWidth: 110 }} placeholder={isCrypto ? "Ex. BTC" : "Ex. FR0013412020"} maxLength={16} />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input type="number" step="0.1" value={t.targetPct} onChange={(e) => updateTarget(t.id, "targetPct", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} placeholder="Ex. 40" />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              {(targetCcyMap[t.id] || "EUR") === "EUR" ? (
                                <input type="number" step="0.0001" value={t.price} onChange={(e) => updateTarget(t.id, "price", e.target.value)} style={{ ...inputStyle, textAlign: "right", width: 92 }} placeholder="Ex. 45.20" />
                              ) : (
                                <input
                                  type="number" step="0.0001"
                                  value={targetUsdDraftMap[t.id] ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setTargetUsdDraftMap((prev) => ({ ...prev, [t.id]: v }));
                                    if (usdRate && v !== "") updateTarget(t.id, "price", Number(v) * usdRate);
                                  }}
                                  style={{ ...inputStyle, textAlign: "right", width: 92 }}
                                  placeholder="Ex. 49.00"
                                />
                              )}
                              <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 5, overflow: "hidden", flexShrink: 0 }}>
                                <button type="button" onClick={() => setTargetCcyMap((p) => ({ ...p, [t.id]: "EUR" }))} style={{ border: "none", padding: "4px 6px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", background: (targetCcyMap[t.id] || "EUR") === "EUR" ? COLORS.navy : "#fff", color: (targetCcyMap[t.id] || "EUR") === "EUR" ? "#fff" : COLORS.muted }}>€</button>
                                <button type="button" onClick={async () => { setTargetCcyMap((p) => ({ ...p, [t.id]: "USD" })); await ensureUsdRate(); }} style={{ border: "none", padding: "4px 6px", fontSize: 10.5, fontWeight: 700, cursor: "pointer", background: targetCcyMap[t.id] === "USD" ? COLORS.navy : "#fff", color: targetCcyMap[t.id] === "USD" ? "#fff" : COLORS.muted }}>$</button>
                              </div>
                            </div>
                            {targetCcyMap[t.id] === "USD" && (
                              <div style={{ fontSize: 10.5, color: COLORS.muted }}>
                                {usdRateLoading ? "Taux…" : usdRate ? `≈ ${fmtMoney(Number(t.price) || 0, 2, 4)}` : (
                                  <span style={{ color: COLORS.red }}>
                                    {usdRateError || "Taux indisponible"} <button type="button" onClick={ensureUsdRate} style={{ border: "none", background: "none", color: COLORS.text, textDecoration: "underline", cursor: "pointer", fontSize: 10.5, padding: 0 }}>réessayer</button>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <RowActions onDelete={() => deleteTarget(t.id)} deleteLabel="cette ligne" />
                        </td>
                      </tr>
                    ))}
                    {targets.length === 0 && (
                      <tr><td colSpan={5} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: 20 }}>Aucun {assetLabel} pour l'instant.</td></tr>
                    )}
                    {targets.length > 0 && (
                      <tr>
                        <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>Total</td>
                        <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                        <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700, color: Math.abs(totalTargetPct - 100) < 0.01 ? COLORS.green : COLORS.red }}>
                          {totalTargetPct.toFixed(1)}%
                        </td>
                        <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                        <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard>
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600, marginBottom: 12 }}>Montant à répartir</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input type="number" step="0.01" placeholder="Ex. 500" value={amountToInvest} onChange={(e) => setAmountToInvest(e.target.value)} style={{ ...inputStyle, maxWidth: 180, fontSize: 16, padding: "9px 10px" }} />
                <span style={{ fontFamily: "IBM Plex Mono", color: COLORS.muted }}>€</span>
              </div>
              {Number(amountToInvest) > 0 && targets.length > 0 && (
                <>
                  <div style={{ overflowX: "auto", marginTop: 18 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>{isCrypto ? "Actif" : "ETF"}</th>
                          <th style={{ ...th, textAlign: "right" }}>Allocation</th>
                          <th style={{ ...th, textAlign: "right" }}>Montant idéal</th>
                          <th style={{ ...th, textAlign: "right" }}>Quantité à acheter</th>
                          <th style={{ ...th, textAlign: "right" }}>Montant dépensé</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocationResult.rows.map((r) => (
                          <tr key={r.id}>
                            <td style={{ ...td, fontWeight: 600 }}>{r.etf || <span style={{ color: COLORS.muted }}>—</span>}</td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", color: COLORS.muted }}>{r.pct.toFixed(1)}%</td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", color: COLORS.muted }}>{fmtMoney(r.idealAmount)}</td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: 15 }}>{r.price > 0 ? fmtQty(r.qty, isCrypto) : "—"}</td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600, color: COLORS.gold }}>{fmtMoney(r.spent)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>Non investi (arrondis)</td>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700 }}>{fmtMoney(allocationResult.leftover)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={applyAllocationToOperations} style={addBtnStyle}><Plus size={14} /> Enregistrer dans Opérations</button>
                  </div>
                </>
              )}
            </SectionCard>
          </>
        )}

        {tab === "objectifs" && (
          <SectionCard>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>Objectifs d'épargne — {activeAccount.name}</div>
              <button onClick={addObjectif} style={addBtnStyle}><Plus size={14} /> Objectif</button>
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 16 }}>
              La progression est calculée sur la valeur actuelle du compte
              ({overview.rows.find((r) => r.id === activeAccount.id)?.estimated ? "≈ " : ""}
              {fmtMoney(overview.rows.find((r) => r.id === activeAccount.id)?.value || 0)}). Tu peux définir plusieurs objectifs.
            </div>
            {objectifs.length === 0 ? (
              <div style={{ color: COLORS.muted, padding: 20, textAlign: "center" }}>
                Aucun objectif pour l'instant — clique sur "+ Objectif" pour en créer un.
              </div>
            ) : (
              <div className="pea-goals-grid">
                {objectifs.map((o) => {
                  const currentValue = overview.rows.find((r) => r.id === activeAccount.id)?.value || 0;
                  const target = Number(o.targetAmount) || 0;
                  const progress = target > 0 ? Math.max(0, Math.min(100, (currentValue / target) * 100)) : 0;
                  return (
                    <div key={o.id} className="pea-goal-card">
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ flex: "1 1 180px" }}>
                          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Nom de l'objectif</div>
                          <input value={o.label} onChange={(e) => updateObjectif(o.id, "label", e.target.value)} placeholder="Ex. Apport immobilier" style={{ ...inputStyle, fontFamily: "Inter" }} />
                        </div>
                        <div style={{ flex: "0 1 150px" }}>
                          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Montant visé</div>
                          <input type="number" step="0.01" value={o.targetAmount} onChange={(e) => updateObjectif(o.id, "targetAmount", e.target.value)} placeholder="Ex. 10000" style={{ ...inputStyle, textAlign: "right" }} />
                        </div>
                        <div style={{ flex: "0 1 160px" }}>
                          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.4 }}>Échéance (optionnel)</div>
                          <input type="date" value={o.targetDate || ""} onChange={(e) => updateObjectif(o.id, "targetDate", e.target.value)} style={inputStyle} />
                        </div>
                        <RowActions onDelete={() => deleteObjectif(o.id)} deleteLabel="cet objectif" />
                      </div>
                      {target > 0 && (
                        <>
                          <div className="pea-progress-track">
                            <div className="pea-progress-fill" style={{ width: `${progress}%` }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12.5, fontFamily: "IBM Plex Mono" }}>
                            <span style={{ color: COLORS.muted }}>{fmtMoney(currentValue)} / {fmtMoney(target)}</span>
                            <span style={{ fontWeight: 700, color: COLORS.text }}>{progress.toFixed(0)}%</span>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        )}

        {tab === "valorisation" && (
          <>
            <SectionCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>Journal de valorisation</div>
                <button onClick={addValorisation} style={addBtnStyle}><Plus size={14} /> Entrée</button>
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                Renseigne la valeur totale du compte au jour J. Les versements cumulés et la plus/moins-value se calculent tout seuls.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={{ ...th, textAlign: "right" }}>Valorisation</th>
                      <th style={{ ...th, textAlign: "right" }}>Versements cumulés</th>
                      <th style={{ ...th, textAlign: "right" }}>+/- value</th>
                      <th style={{ ...th, textAlign: "right" }}>Rendement</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {valoRows.map((r) => (
                      <tr key={r.id}>
                        <td style={td}>
                          <input type="date" value={r.date} onChange={(e) => updateValorisation(r.id, "date", e.target.value)} style={inputStyle} />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input type="number" step="0.01" value={r.value} onChange={(e) => updateValorisation(r.id, "value", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} placeholder="Ex. 1250.00" />
                        </td>
                        <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", color: COLORS.muted }}>{fmtMoney(r.cumule)}</td>
                        <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600, color: r.diff >= 0 ? COLORS.green : COLORS.red }}>
                          {r.diff >= 0 ? "+" : ""}{fmtMoney(r.diff)}
                        </td>
                        <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600, color: r.diff >= 0 ? COLORS.green : COLORS.red }}>
                          {fmtPct(pctReturn(r.diff, r.cumule))}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <RowActions onDelete={() => deleteValorisation(r.id)} deleteLabel="cette entrée" />
                        </td>
                      </tr>
                    ))}
                    {valoRows.length === 0 && (
                      <tr><td colSpan={6} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: 20 }}>Aucune entrée pour le moment.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            {valoRows.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
                <SectionCard>
                  <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Valorisation vs versements cumulés</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartLineData}>
                      <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Inter" }} />
                      <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
                      <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }} />
                      <Legend wrapperStyle={{ fontFamily: "Inter", fontSize: 12.5 }} />
                      <Line type="monotone" dataKey="Valorisation" stroke={COLORS.gold} strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Versements cumulés" stroke={COLORS.navyLight} strokeWidth={2} dot={false} strokeDasharray="4 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </SectionCard>
                <SectionCard>
                  <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Plus/moins-value par date</div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartBarData}>
                      <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Inter" }} />
                      <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
                      <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }} />
                      <Bar dataKey="diff" radius={[3, 3, 0, 0]}>
                        {chartBarData.map((d, i) => <Cell key={i} fill={d.diff >= 0 ? COLORS.green : COLORS.red} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </SectionCard>
              </div>
            )}
          </>
        )}

        {tab === "repartition" && (
          <>
            <SectionCard>
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
                Répartition par actif, compte par compte
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 14 }}>
                Basée sur le montant net investi dans chaque actif. Clique sur un compte pour l'ouvrir.
              </div>
              <div className="pea-repartition-grid">
                {perAccountPies.map((p) => {
                  const Meta = KIND_META[p.kind] || KIND_META.Autre;
                  const Icon = Meta.icon;
                  const acctAccent = KIND_ACCENT[p.kind] || COLORS.gold;
                  const total = p.pieData.reduce((s, d) => s + d.value, 0);
                  return (
                    <button key={p.id} className="pea-repart-card" onClick={() => goToAccount(p.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                        <div className="pea-overview-icon" style={{ background: acctAccent }}><Icon size={13} /></div>
                        <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13.5, color: COLORS.text }}>{p.name}</div>
                      </div>
                      {p.pieData.length === 0 ? (
                        <div style={{ color: COLORS.muted, fontSize: 12, padding: "30px 0", textAlign: "center" }}>
                          Pas encore de données
                        </div>
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height={190}>
                            <PieChart>
                              <Pie data={p.pieData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={78} paddingAngle={2} label={renderPiePercentLabel} labelLine={false}>
                                {p.pieData.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}
                              </Pie>
                              <Tooltip formatter={pieTooltip(total)} contentStyle={{ fontFamily: "Inter", fontSize: 12, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12.5, color: COLORS.muted, textAlign: "center" }}>
                            {fmtMoney(total)} investis
                          </div>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard>
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
                Répartition globale par compte
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                Comme dans la Vue d'ensemble — clique sur une part ou un compte pour l'ouvrir.
              </div>
              {overview.rows.filter((r) => r.value > 0).length === 0 ? (
                <div style={{ color: COLORS.muted, padding: 20 }}>Pas encore de données à répartir.</div>
              ) : (
                <div className="pea-pie-wrap">
                  <div className="pea-pie-chart">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={overview.rows.filter((r) => r.value > 0)} dataKey="value" nameKey="name" innerRadius={65} outerRadius={120} paddingAngle={2} label={renderPiePercentLabel} labelLine={false}>
                          {overview.rows
                            .filter((r) => r.value > 0)
                            .map((r, i) => (
                              <Cell key={r.id} fill={PALETTE[i % PALETTE.length]} cursor="pointer" onClick={() => goToAccount(r.id)} />
                            ))}
                        </Pie>
                        <Tooltip formatter={pieTooltip(overview.totalValue)} contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8, background: COLORS.card, color: COLORS.text, border: `1px solid ${COLORS.border}` }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {overview.rows.filter((r) => r.value > 0).map((r, i) => (
                      <button key={r.id} className="pea-legend-row" onClick={() => goToAccount(r.id)}>
                        <div style={{ width: 12, height: 12, borderRadius: 3, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                        <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, width: 140, textAlign: "left" }}>{r.name}</div>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 13.5 }}>{fmtMoney(r.value)}</div>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12.5, color: COLORS.muted }}>
                          {overview.totalValue ? ((r.value / overview.totalValue) * 100).toFixed(1) : "0.0"}%
                        </div>
                        <ArrowRight size={13} color={COLORS.muted} style={{ marginLeft: "auto" }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
      {showTutorial && <TutorialModal onClose={dismissTutorial} />}
      {showImportCsv && (
        <ImportCsvModal
          onClose={() => setShowImportCsv(false)}
          onImport={(newTx) => {
            patchActiveAccount({ transactions: [...activeAccount.transactions, ...newTx] });
          }}
        />
      )}
      {swipeConfirm && (
        <div className="pea-swipe-confirm">
          <span>Supprimer « {swipeConfirm.label} » ?</span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button
              className="pea-swipe-btn pea-swipe-btn-cancel"
              onClick={() => setSwipeConfirm(null)}
            >
              Annuler
            </button>
            <button
              className="pea-swipe-btn pea-swipe-btn-danger"
              onClick={() => {
                if (swipeConfirm.kind === "transaction") deleteTransaction(swipeConfirm.id);
                setSwipeConfirm(null);
              }}
            >
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("peaTracker.darkMode") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("peaTracker.darkMode", dark ? "1" : "0");
    } catch {}
  }, [dark]);
  return [dark, setDark];
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [dark, setDark] = useDarkMode();
  if (!profile) return <ProfileGate onEnter={(p) => setProfile(p)} dark={dark} setDark={setDark} />;
  return (
    <Dashboard
      profileName={profile.name}
      profileKey={profile.key}
      initialData={profile.data}
      onLogout={() => setProfile(null)}
      dark={dark}
      setDark={setDark}
    />
  );
}
