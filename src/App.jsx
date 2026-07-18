import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Plus, Trash2, TrendingUp, PieChart as PieIcon, ListOrdered, Layers,
  Download, Upload, FileText, LogOut, Calculator, Landmark, Briefcase,
  Bitcoin, Wallet, ChevronDown, X, Wallet2, LayoutDashboard, ArrowRight,
  Check, RefreshCw, Target,
} from "lucide-react";
import ProfileGate from "./ProfileGate.jsx";
import { saveProfileData } from "./profiles.js";
import { exportJSON, exportPDF, importJSONFile } from "./export.js";
import { fetchCryptoPrices } from "./cryptoPrices.js";

// ---------- Design tokens ----------
const COLORS = {
  bg: "#F4F5F1",
  card: "#FFFFFF",
  navy: "#10233B",
  navyLight: "#1B3A5C",
  gold: "#B8873A",
  goldLight: "#E8D5B0",
  green: "#2F7D5E",
  red: "#B5484D",
  border: "#E3E1D8",
  text: "#1C2530",
  muted: "#6B7280",
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
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20, ...style }}>
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
function MiniStat({ label, value }) {
  return (
    <div style={{ background: "#FCFCFA", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px" }}>
      <div style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: COLORS.muted }}>
        {label}
      </div>
      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 17, fontWeight: 600, color: COLORS.navy, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

const inputStyle = {
  fontFamily: "IBM Plex Mono", fontSize: 13.5, border: `1px solid ${COLORS.border}`,
  borderRadius: 5, padding: "5px 7px", width: "100%", color: COLORS.text, background: "#FCFCFA",
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
  display: "flex", alignItems: "center", gap: 5, background: "transparent", color: COLORS.navy,
  border: `1px solid ${COLORS.navy}`, borderRadius: 6, padding: "7px 12px", fontFamily: "Inter", fontWeight: 600, fontSize: 12.5, cursor: "pointer",
};

function Dashboard({ profileName, profileKey, initialData, onLogout }) {
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

  const persist = useCallback(
    async (next) => {
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

  const activeAccount = data.accounts.find((a) => a.id === data.activeAccountId) || data.accounts[0];
  const isCrypto = activeAccount.kind === "Crypto";
  const accent = KIND_ACCENT[activeAccount.kind] || COLORS.gold;
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

  const pieData = etfList
    .map((etf) => ({ name: etf, value: perEtf[etf]?.montant || 0 }))
    .filter((d) => d.value > 0);

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
    patchActiveAccount({
      transactions: [
        ...activeAccount.transactions,
        { id: uid(), date: todayISO(), etf: etfList[0] || "", isin: etfList[0] ? isinByEtf[etfList[0]] || "" : "", type: "achat", quantity: "", cost: "" },
      ],
    });
  };
  const updateTransaction = (id, field, value) => {
    patchActiveAccount({
      transactions: activeAccount.transactions.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    });
  };
  const deleteTransaction = (id) => {
    patchActiveAccount({ transactions: activeAccount.transactions.filter((t) => t.id !== id) });
  };

  // ---------- Mutateurs : versements ----------
  const addVersement = () => {
    patchActiveAccount({ versements: [...activeAccount.versements, { id: uid(), date: todayISO(), type: "depot", amount: "" }] });
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

  const TABS = [
    { id: "vue", label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: "operations", label: "Opérations", icon: ListOrdered },
    { id: "versements", label: "Versements", icon: Wallet2 },
    { id: "parEtf", label: isCrypto ? "Par actif" : "Par ETF", icon: Layers },
    { id: "calculateur", label: "Calculateur", icon: Calculator },
    { id: "objectifs", label: "Objectifs", icon: Target },
    { id: "valorisation", label: "Valorisation", icon: TrendingUp },
    { id: "repartition", label: "Répartition", icon: PieIcon },
  ];

  const assetLabel = isCrypto ? "actif" : "ETF / titre";

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", fontFamily: "Inter", color: COLORS.text, "--accent": accent }}>
      {/* Header */}
      <div style={{ background: COLORS.navy, padding: "18px 20px 14px" }}>
        <div className="pea-header-row">
          <div>
            <div style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 26, color: "#FFFFFF" }}>
              Suivi de portefeuille
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#9BB0C4", marginTop: 2 }}>
              Profil : {profileName} {saving ? "· enregistrement…" : ""}
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
          <button className="pea-toolbtn" onClick={() => exportJSON(profileName, data)}>
            <Download size={13} /> Export JSON (tout)
          </button>
          <button className="pea-toolbtn" onClick={() => exportPDF(profileName, activeAccount.name, activeAccount)}>
            <FileText size={13} /> Export PDF ({activeAccount.name})
          </button>
          <label className="pea-toolbtn" style={{ cursor: "pointer" }}>
            <Upload size={13} /> Importer
            <input type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />
          </label>
          <button className="pea-toolbtn" onClick={onLogout}>
            <LogOut size={13} /> Changer de profil
          </button>
        </div>
        {importError && <div style={{ color: "#E8A2A2", fontSize: 12, marginTop: 6 }}>{importError}</div>}
      </div>

      {/* Tabs */}
      <div className="pea-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={active ? "pea-tab active" : "pea-tab"}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
        {tab === "vue" && (
          <>
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
                      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 20, fontWeight: 700, color: COLORS.navy }}>
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
                        <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8 }} />
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>
                Achats & ventes {isCrypto ? "de cryptos" : "de titres"}
              </div>
              <button onClick={addTransaction} style={addBtnStyle}><Plus size={14} /> Ligne</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={th}>Type</th>
                    <th style={th}>{isCrypto ? "Actif" : "ETF / titre"}</th>
                    <th style={th}>Code / ISIN</th>
                    <th style={{ ...th, textAlign: "right" }}>Quantité</th>
                    <th style={{ ...th, textAlign: "right" }}>Prix unitaire</th>
                    <th style={{ ...th, textAlign: "right" }}>Montant</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeAccount.transactions.map((t) => (
                    <tr key={t.id}>
                      <td style={td}>
                        <input type="date" value={t.date} onChange={(e) => updateTransaction(t.id, "date", e.target.value)} style={inputStyle} />
                      </td>
                      <td style={td}>
                        <select value={t.type || "achat"} onChange={(e) => updateTransaction(t.id, "type", e.target.value)} style={selectStyle}>
                          <option value="achat">Achat</option>
                          <option value="vente">Vente</option>
                        </select>
                      </td>
                      <td style={td}>
                        <input list="etf-names" value={t.etf} onChange={(e) => updateTransaction(t.id, "etf", e.target.value)} style={{ ...inputStyle, fontFamily: "Inter" }} placeholder={isCrypto ? "BTC, ETH…" : "Nom du titre"} />
                      </td>
                      <td style={td}>
                        <input value={t.isin || ""} onChange={(e) => updateTransaction(t.id, "isin", e.target.value.toUpperCase())} style={{ ...inputStyle, letterSpacing: 0.5 }} placeholder={isCrypto ? "BTC" : "FR00..."} maxLength={16} />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <input type="number" step="any" value={t.quantity} onChange={(e) => updateTransaction(t.id, "quantity", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <input type="number" step="0.0001" value={t.cost} onChange={(e) => updateTransaction(t.id, "cost", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600, color: t.type === "vente" ? COLORS.red : COLORS.text }}>
                        {t.type === "vente" ? "− " : ""}{fmtMoney((Number(t.quantity) || 0) * (Number(t.cost) || 0))}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <RowActions onDelete={() => deleteTransaction(t.id)} deleteLabel="cette opération" />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>Total net</td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
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
                    <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8 }} />
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
                      <tr key={v.id}>
                        <td style={td}>
                          <input type="date" value={v.date} onChange={(e) => updateVersement(v.id, "date", e.target.value)} style={inputStyle} />
                        </td>
                        <td style={td}>
                          <select value={v.type || "depot"} onChange={(e) => updateVersement(v.id, "type", e.target.value)} style={selectStyle}>
                            <option value="depot">Dépôt</option>
                            <option value="retrait">Retrait</option>
                          </select>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input type="number" step="0.01" value={v.amount} onChange={(e) => updateVersement(v.id, "amount", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
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
                    background: selectedEtf === etf ? COLORS.navy : "#FCFCFA",
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
                  <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
                    <MiniStat label="Quantité nette" value={fmtQty(qty, isCrypto)} />
                    <MiniStat label="Coût moyen pondéré" value={fmtMoney(coutMoyen, 2, 4)} />
                    <MiniStat label="Montant net investi" value={fmtMoney(montant)} />
                    {currentValue !== null && <MiniStat label="Valeur actuelle" value={fmtMoney(currentValue)} />}
                    {gain !== null && (
                      <div style={{ background: "#FCFCFA", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 16px" }}>
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
                                      <input type="number" step="1" value={s.gainPct} onChange={(e) => updateSellTarget(s.id, "gainPct", e.target.value)} style={{ ...inputStyle, textAlign: "right", width: 70 }} />
                                      <span style={{ color: COLORS.muted, fontSize: 12 }}>%</span>
                                    </div>
                                  </td>
                                  <td style={{ ...td, textAlign: "right" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                                      <input type="number" step="1" value={s.sellPct} onChange={(e) => updateSellTarget(s.id, "sellPct", e.target.value)} style={{ ...inputStyle, textAlign: "right", width: 70 }} />
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
                          <input list="etf-names" value={t.etf} onChange={(e) => updateTarget(t.id, "etf", e.target.value)} style={{ ...inputStyle, fontFamily: "Inter" }} placeholder={isCrypto ? "BTC, ETH…" : "Nom de l'ETF"} />
                        </td>
                        <td style={td}>
                          <input value={t.isin || ""} onChange={(e) => updateTarget(t.id, "isin", e.target.value.toUpperCase())} style={{ ...inputStyle, letterSpacing: 0.5 }} placeholder={isCrypto ? "BTC" : "FR00..."} maxLength={16} />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input type="number" step="0.1" value={t.targetPct} onChange={(e) => updateTarget(t.id, "targetPct", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input type="number" step="0.0001" value={t.price} onChange={(e) => updateTarget(t.id, "price", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
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
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                            <span style={{ fontWeight: 700, color: COLORS.navy }}>{progress.toFixed(0)}%</span>
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
                          <input type="number" step="0.01" value={r.value} onChange={(e) => updateValorisation(r.id, "value", e.target.value)} style={{ ...inputStyle, textAlign: "right" }} />
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
                      <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8 }} />
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
                      <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8 }} />
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
          <SectionCard>
            <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Répartition du portefeuille</div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>Basée sur le montant net investi par {assetLabel}.</div>
            {pieData.length === 0 ? (
              <div style={{ color: COLORS.muted, padding: 20 }}>Ajoute des opérations pour voir la répartition.</div>
            ) : (
              <div className="pea-pie-wrap">
                <div className="pea-pie-chart">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={120} paddingAngle={2}>
                        {pieData.map((d, i) => <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {pieData.map((d, i) => (
                    <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: PALETTE[i % PALETTE.length] }} />
                      <div style={{ fontFamily: "Inter", fontSize: 13.5, fontWeight: 600, width: 170 }}>{d.name}</div>
                      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 13.5 }}>{fmtMoney(d.value)}</div>
                      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12.5, color: COLORS.muted }}>
                        {totalInvesti ? ((d.value / totalInvesti) * 100).toFixed(1) : "0.0"}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [profile, setProfile] = useState(null);
  if (!profile) return <ProfileGate onEnter={(p) => setProfile(p)} />;
  return (
    <Dashboard
      profileName={profile.name}
      profileKey={profile.key}
      initialData={profile.data}
      onLogout={() => setProfile(null)}
    />
  );
}
