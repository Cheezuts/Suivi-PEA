import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Plus, Trash2, TrendingUp, PieChart as PieIcon, ListOrdered, Layers, Download, Upload, FileText, LogOut, Calculator } from "lucide-react";
import ProfileGate from "./ProfileGate.jsx";
import { saveProfileData } from "./profiles.js";
import { exportJSON, exportPDF, importJSONFile } from "./export.js";

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
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
    <div
      style={{
        background: COLORS.navyLight,
        borderRadius: 8,
        padding: "10px 16px",
        minWidth: 140,
      }}
    >
      <div style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: 0.6, color: "#B8C4D4", textTransform: "uppercase" }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "IBM Plex Mono",
          fontSize: 19,
          fontWeight: 600,
          color: accent || "#FFFFFF",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function IconBtn({ onClick, title, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: danger ? "#FBEAEA" : COLORS.goldLight,
        border: "none",
        borderRadius: 6,
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <Trash2 size={14} color={danger ? COLORS.red : COLORS.navy} />
    </button>
  );
}

const inputStyle = {
  fontFamily: "IBM Plex Mono",
  fontSize: 13.5,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 5,
  padding: "5px 7px",
  width: "100%",
  color: COLORS.text,
  background: "#FCFCFA",
};

const th = {
  fontFamily: "Inter",
  fontSize: 11.5,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: COLORS.muted,
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: `2px solid ${COLORS.navy}`,
};
const td = { padding: "6px 10px", borderBottom: `1px solid ${COLORS.border}` };

function Dashboard({ profileName, profileKey, initialData, onLogout }) {
  useFontsLoaded();
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState("operations");
  const [selectedEtf, setSelectedEtf] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importError, setImportError] = useState("");
  const [amountToInvest, setAmountToInvest] = useState("");

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

  // ---------- Derived data ----------
  const etfList = useMemo(() => {
    const set = new Set(data.transactions.map((t) => t.etf).filter(Boolean));
    return Array.from(set);
  }, [data.transactions]);

  const isinByEtf = useMemo(() => {
    const map = {};
    data.transactions.forEach((t) => {
      if (t.etf && t.isin && !map[t.etf]) map[t.etf] = t.isin;
    });
    return map;
  }, [data.transactions]);

  const totalQty = data.transactions.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
  const totalInvesti = data.transactions.reduce(
    (s, t) => s + (Number(t.quantity) || 0) * (Number(t.cost) || 0),
    0
  );
  const totalVerse = data.versements.reduce((s, v) => s + (Number(v.amount) || 0), 0);
  const solde = totalVerse - totalInvesti;

  const perEtf = useMemo(() => {
    const map = {};
    data.transactions.forEach((t) => {
      if (!t.etf) return;
      if (!map[t.etf]) map[t.etf] = { qty: 0, montant: 0 };
      map[t.etf].qty += Number(t.quantity) || 0;
      map[t.etf].montant += (Number(t.quantity) || 0) * (Number(t.cost) || 0);
    });
    return map;
  }, [data.transactions]);

  const pieData = etfList.map((etf) => ({
    name: etf,
    value: perEtf[etf]?.montant || 0,
  })).filter(d => d.value > 0);

  const sortedVersements = [...data.versements].sort((a, b) => a.date.localeCompare(b.date));
  const versementCumuleAt = (dateIso) =>
    sortedVersements.filter((v) => v.date <= dateIso).reduce((s, v) => s + (Number(v.amount) || 0), 0);

  const valoRows = [...data.valorisations]
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
  const chartBarData = valoRows.map((r) => ({
    date: fmtDate(r.date),
    diff: Number(r.diff.toFixed(2)),
  }));

  // ---------- Mutators ----------
  const addTransaction = () => {
    const next = {
      ...data,
      transactions: [
        ...data.transactions,
        { id: uid(), date: todayISO(), etf: etfList[0] || "", isin: etfList[0] ? isinByEtf[etfList[0]] || "" : "", quantity: "", cost: "" },
      ],
    };
    persist(next);
  };
  const updateTransaction = (id, field, value) => {
    const next = {
      ...data,
      transactions: data.transactions.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
    };
    persist(next);
  };
  const deleteTransaction = (id) => {
    persist({ ...data, transactions: data.transactions.filter((t) => t.id !== id) });
  };

  const addVersement = () => {
    persist({ ...data, versements: [...data.versements, { id: uid(), date: todayISO(), amount: "" }] });
  };
  const updateVersement = (id, field, value) => {
    persist({
      ...data,
      versements: data.versements.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    });
  };
  const deleteVersement = (id) => {
    persist({ ...data, versements: data.versements.filter((v) => v.id !== id) });
  };

  const addValorisation = () => {
    persist({
      ...data,
      valorisations: [...data.valorisations, { id: uid(), date: todayISO(), value: "" }],
    });
  };
  const updateValorisation = (id, field, value) => {
    persist({
      ...data,
      valorisations: data.valorisations.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    });
  };
  const deleteValorisation = (id) => {
    persist({ ...data, valorisations: data.valorisations.filter((v) => v.id !== id) });
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    try {
      const imported = await importJSONFile(file);
      if (!imported.transactions || !imported.versements || !imported.valorisations) {
        throw new Error("Ce fichier ne ressemble pas à un export du Suivi PEA.");
      }
      persist(imported);
    } catch (err) {
      setImportError(err.message);
    }
  };

  // ---------- Calculateur de répartition ----------
  const targets = data.allocationTargets || [];
  const persistTargets = (nextTargets) => persist({ ...data, allocationTargets: nextTargets });

  const addTarget = () => {
    persistTargets([...targets, { id: uid(), etf: "", isin: "", targetPct: "", price: "" }]);
  };
  const updateTarget = (id, field, value) => {
    persistTargets(targets.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };
  const deleteTarget = (id) => {
    persistTargets(targets.filter((t) => t.id !== id));
  };
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
      const qty = price > 0 ? Math.floor(idealAmount / price) : 0;
      return { ...t, pct, price, idealAmount, qty, spent: qty * price };
    });
    let leftover = amt - working.reduce((s, r) => s + r.spent, 0);
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
    return { rows: working, leftover, totalSpent: amt - leftover };
  }, [targets, amountToInvest]);

  const applyAllocationToOperations = () => {
    const newTx = allocationResult.rows
      .filter((r) => r.qty > 0)
      .map((r) => ({ id: uid(), date: todayISO(), etf: r.etf, isin: r.isin, quantity: r.qty, cost: r.price }));
    const newVersement = { id: uid(), date: todayISO(), amount: Number(amountToInvest) || 0 };
    persist({
      ...data,
      transactions: [...data.transactions, ...newTx],
      versements: [...data.versements, newVersement],
    });
    setAmountToInvest("");
  };

  const TABS = [
    { id: "operations", label: "Opérations", icon: ListOrdered },
    { id: "parEtf", label: "Par ETF", icon: Layers },
    { id: "calculateur", label: "Calculateur", icon: Calculator },
    { id: "valorisation", label: "Valorisation", icon: TrendingUp },
    { id: "repartition", label: "Répartition", icon: PieIcon },
  ];

  return (
    <div style={{ background: COLORS.bg, minHeight: "100%", fontFamily: "Inter", color: COLORS.text }}>
      {/* Header */}
      <div style={{ background: COLORS.navy, padding: "18px 20px 14px" }} className="pea-header">
        <div className="pea-header-row">
          <div>
            <div style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 26, color: "#FFFFFF" }}>
              Suivi du PEA
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 12.5, color: "#9BB0C4", marginTop: 2 }}>
              Profil : {profileName} {saving ? "· enregistrement…" : ""}
            </div>
          </div>
          <div className="pea-stats">
            <StatChip label="Total versé" value={fmtMoney(totalVerse)} />
            <StatChip label="Total investi" value={fmtMoney(totalInvesti)} />
            <StatChip
              label="Liquidités"
              value={fmtMoney(solde)}
              accent={solde < 0 ? "#E8A2A2" : "#E8D5B0"}
            />
          </div>
        </div>
        <div className="pea-toolbar">
          <button className="pea-toolbtn" onClick={() => exportJSON(profileName, data)}>
            <Download size={13} /> Export JSON
          </button>
          <button className="pea-toolbtn" onClick={() => exportPDF(profileName, data)}>
            <FileText size={13} /> Export PDF
          </button>
          <label className="pea-toolbtn" style={{ cursor: "pointer" }}>
            <Upload size={13} /> Importer
            <input type="file" accept="application/json" onChange={handleImportFile} style={{ display: "none" }} />
          </label>
          <button className="pea-toolbtn" onClick={onLogout}>
            <LogOut size={13} /> Changer de profil
          </button>
        </div>
        {importError && (
          <div style={{ color: "#E8A2A2", fontSize: 12, marginTop: 6, fontFamily: "Inter" }}>{importError}</div>
        )}
      </div>

      {/* Tabs */}
      <div className="pea-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={active ? "pea-tab active" : "pea-tab"}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
        {tab === "operations" && (
          <>
            <SectionCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>Achats d'ETF</div>
                <button onClick={addTransaction} style={addBtnStyle}>
                  <Plus size={14} /> Ligne
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Date</th>
                      <th style={th}>ETF</th>
                      <th style={th}>ISIN</th>
                      <th style={{ ...th, textAlign: "right" }}>Quantité</th>
                      <th style={{ ...th, textAlign: "right" }}>Coût unitaire</th>
                      <th style={{ ...th, textAlign: "right" }}>Montant</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((t) => (
                      <tr key={t.id}>
                        <td style={td}>
                          <input
                            type="date"
                            value={t.date}
                            onChange={(e) => updateTransaction(t.id, "date", e.target.value)}
                            style={inputStyle}
                          />
                        </td>
                        <td style={td}>
                          <input
                            list="etf-names"
                            value={t.etf}
                            onChange={(e) => updateTransaction(t.id, "etf", e.target.value)}
                            style={{ ...inputStyle, fontFamily: "Inter" }}
                            placeholder="Nom de l'ETF"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={t.isin || ""}
                            onChange={(e) => updateTransaction(t.id, "isin", e.target.value.toUpperCase())}
                            style={{ ...inputStyle, letterSpacing: 0.5 }}
                            placeholder="FR00..."
                            maxLength={12}
                          />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input
                            type="number"
                            step="1"
                            value={t.quantity}
                            onChange={(e) => updateTransaction(t.id, "quantity", e.target.value)}
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.0001"
                            value={t.cost}
                            onChange={(e) => updateTransaction(t.id, "cost", e.target.value)}
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                        </td>
                        <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600 }}>
                          {fmtMoney((Number(t.quantity) || 0) * (Number(t.cost) || 0))}
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <IconBtn danger onClick={() => deleteTransaction(t.id)} title="Supprimer" />
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700, fontFamily: "Inter" }}>
                        Total
                      </td>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                      <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700 }}>
                        {totalQty}
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
                  {etfList.map((e) => (
                    <option key={e} value={e} />
                  ))}
                </datalist>
              </div>
            </SectionCard>

            <SectionCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>Versements sur le PEA</div>
                <button onClick={addVersement} style={addBtnStyle}>
                  <Plus size={14} /> Versement
                </button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", maxWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={{ ...th, textAlign: "right" }}>Montant</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVersements.map((v) => (
                    <tr key={v.id}>
                      <td style={td}>
                        <input
                          type="date"
                          value={v.date}
                          onChange={(e) => updateVersement(v.id, "date", e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={v.amount}
                          onChange={(e) => updateVersement(v.id, "amount", e.target.value)}
                          style={{ ...inputStyle, textAlign: "right" }}
                        />
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <IconBtn danger onClick={() => deleteVersement(v.id)} title="Supprimer" />
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>Total</td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700, color: COLORS.gold }}>
                      {fmtMoney(totalVerse)}
                    </td>
                    <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                  </tr>
                </tbody>
              </table>
            </SectionCard>
          </>
        )}

        {tab === "parEtf" && (
          <SectionCard>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
              {etfList.length === 0 && (
                <div style={{ color: COLORS.muted, fontSize: 13.5 }}>Ajoute d'abord des achats dans l'onglet Opérations.</div>
              )}
              {etfList.map((etf) => (
                <button
                  key={etf}
                  onClick={() => setSelectedEtf(etf)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 20,
                    border: `1px solid ${selectedEtf === etf ? COLORS.navy : COLORS.border}`,
                    background: selectedEtf === etf ? COLORS.navy : "#FCFCFA",
                    color: selectedEtf === etf ? "#fff" : COLORS.text,
                    fontFamily: "Inter",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {etf}
                </button>
              ))}
            </div>
            {(() => {
              const etf = selectedEtf || etfList[0];
              if (!etf) return null;
              const rows = data.transactions.filter((t) => t.etf === etf);
              const qty = perEtf[etf]?.qty || 0;
              const montant = perEtf[etf]?.montant || 0;
              const coutMoyen = qty ? montant / qty : 0;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ fontFamily: "Fraunces", fontSize: 19, fontWeight: 600 }}>{etf}</div>
                    {isinByEtf[etf] && (
                      <div
                        style={{
                          fontFamily: "IBM Plex Mono",
                          fontSize: 11.5,
                          color: COLORS.navy,
                          background: COLORS.goldLight,
                          padding: "3px 8px",
                          borderRadius: 5,
                          letterSpacing: 0.5,
                        }}
                      >
                        {isinByEtf[etf]}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
                    <MiniStat label="Quantité totale" value={qty.toString()} />
                    <MiniStat label="Coût moyen pondéré" value={fmtMoney(coutMoyen, 2, 4)} />
                    <MiniStat label="Montant investi" value={fmtMoney(montant)} />
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={th}>Date</th>
                        <th style={{ ...th, textAlign: "right" }}>Quantité</th>
                        <th style={{ ...th, textAlign: "right" }}>Coût unitaire</th>
                        <th style={{ ...th, textAlign: "right" }}>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td style={td}>{fmtDate(r.date)}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono" }}>{r.quantity}</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono" }}>{fmtCost(Number(r.cost))} €</td>
                          <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono" }}>
                            {fmtMoney((Number(r.quantity) || 0) * (Number(r.cost) || 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <button onClick={importFromPortfolio} style={addBtnStyleOutline}>
                    Importer mes ETF
                  </button>
                  <button onClick={addTarget} style={addBtnStyle}>
                    <Plus size={14} /> ETF
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                Renseigne le pourcentage cible et le prix unitaire actuel de chaque ETF (le tien ou un nouveau que tu veux ajouter). Le total doit faire 100%.
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>ETF</th>
                      <th style={th}>ISIN</th>
                      <th style={{ ...th, textAlign: "right" }}>Allocation cible (%)</th>
                      <th style={{ ...th, textAlign: "right" }}>Prix unitaire</th>
                      <th style={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map((t) => (
                      <tr key={t.id}>
                        <td style={td}>
                          <input
                            list="etf-names"
                            value={t.etf}
                            onChange={(e) => updateTarget(t.id, "etf", e.target.value)}
                            style={{ ...inputStyle, fontFamily: "Inter" }}
                            placeholder="Nom de l'ETF"
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={t.isin || ""}
                            onChange={(e) => updateTarget(t.id, "isin", e.target.value.toUpperCase())}
                            style={{ ...inputStyle, letterSpacing: 0.5 }}
                            placeholder="FR00..."
                            maxLength={12}
                          />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.1"
                            value={t.targetPct}
                            onChange={(e) => updateTarget(t.id, "targetPct", e.target.value)}
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <input
                            type="number"
                            step="0.0001"
                            value={t.price}
                            onChange={(e) => updateTarget(t.id, "price", e.target.value)}
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <IconBtn danger onClick={() => deleteTarget(t.id)} title="Supprimer" />
                        </td>
                      </tr>
                    ))}
                    {targets.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: 20 }}>
                          Aucun ETF pour l'instant — importe ceux de ton portefeuille ou ajoute-en un.
                        </td>
                      </tr>
                    )}
                    {targets.length > 0 && (
                      <tr>
                        <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>Total</td>
                        <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                        <td
                          style={{
                            ...td,
                            borderBottom: "none",
                            borderTop: `2px solid ${COLORS.navy}`,
                            textAlign: "right",
                            fontFamily: "IBM Plex Mono",
                            fontWeight: 700,
                            color: Math.abs(totalTargetPct - 100) < 0.01 ? COLORS.green : COLORS.red,
                          }}
                        >
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
              <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600, marginBottom: 12 }}>
                Montant à répartir
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex. 500"
                  value={amountToInvest}
                  onChange={(e) => setAmountToInvest(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 180, fontSize: 16, padding: "9px 10px" }}
                />
                <span style={{ fontFamily: "IBM Plex Mono", color: COLORS.muted }}>€</span>
              </div>

              {Number(amountToInvest) > 0 && targets.length > 0 && (
                <>
                  <div style={{ overflowX: "auto", marginTop: 18 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={th}>ETF</th>
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
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", color: COLORS.muted }}>
                              {r.pct.toFixed(1)}%
                            </td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", color: COLORS.muted }}>
                              {fmtMoney(r.idealAmount)}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: 15 }}>
                              {r.price > 0 ? r.qty : "—"}
                            </td>
                            <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", fontWeight: 600, color: COLORS.gold }}>
                              {fmtMoney(r.spent)}
                            </td>
                          </tr>
                        ))}
                        <tr>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}`, fontWeight: 700 }}>
                            Non investi (arrondis)
                          </td>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                          <td style={{ ...td, borderBottom: "none", borderTop: `2px solid ${COLORS.navy}` }}></td>
                          <td
                            style={{
                              ...td,
                              borderBottom: "none",
                              borderTop: `2px solid ${COLORS.navy}`,
                              textAlign: "right",
                              fontFamily: "IBM Plex Mono",
                              fontWeight: 700,
                            }}
                          >
                            {fmtMoney(allocationResult.leftover)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={applyAllocationToOperations} style={addBtnStyle}>
                      <Plus size={14} /> Enregistrer ces achats dans Opérations
                    </button>
                  </div>
                </>
              )}
            </SectionCard>
          </>
        )}

        {tab === "valorisation" && (
          <>
            <SectionCard>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600 }}>Journal de valorisation</div>
                <button onClick={addValorisation} style={addBtnStyle}>
                  <Plus size={14} /> Entrée
                </button>
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                Renseigne la valeur totale de ton PEA au jour J (visible dans XTB). Les versements cumulés et la plus/moins-value se calculent tout seuls.
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Date</th>
                    <th style={{ ...th, textAlign: "right" }}>Valorisation PEA</th>
                    <th style={{ ...th, textAlign: "right" }}>Versements cumulés</th>
                    <th style={{ ...th, textAlign: "right" }}>+/- value</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {valoRows.map((r) => (
                    <tr key={r.id}>
                      <td style={td}>
                        <input
                          type="date"
                          value={r.date}
                          onChange={(e) => updateValorisation(r.id, "date", e.target.value)}
                          style={inputStyle}
                        />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <input
                          type="number"
                          step="0.01"
                          value={r.value}
                          onChange={(e) => updateValorisation(r.id, "value", e.target.value)}
                          style={{ ...inputStyle, textAlign: "right" }}
                        />
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "IBM Plex Mono", color: COLORS.muted }}>
                        {fmtMoney(r.cumule)}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontFamily: "IBM Plex Mono",
                          fontWeight: 600,
                          color: r.diff >= 0 ? COLORS.green : COLORS.red,
                        }}
                      >
                        {r.diff >= 0 ? "+" : ""}
                        {fmtMoney(r.diff)}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <IconBtn danger onClick={() => deleteValorisation(r.id)} title="Supprimer" />
                      </td>
                    </tr>
                  ))}
                  {valoRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ ...td, color: COLORS.muted, textAlign: "center", padding: 20 }}>
                        Aucune entrée pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </SectionCard>

            {valoRows.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
                <SectionCard>
                  <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                    Valorisation vs versements cumulés
                  </div>
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
                  <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                    Plus/moins-value par date
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartBarData}>
                      <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fontFamily: "Inter" }} />
                      <YAxis tick={{ fontSize: 11, fontFamily: "Inter" }} />
                      <Tooltip contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8 }} />
                      <Bar dataKey="diff" radius={[3, 3, 0, 0]}>
                        {chartBarData.map((d, i) => (
                          <Cell key={i} fill={d.diff >= 0 ? COLORS.green : COLORS.red} />
                        ))}
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
            <div style={{ fontFamily: "Fraunces", fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
              Répartition du portefeuille
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
              Basée sur le montant investi (prix de revient) par ETF.
            </div>
            {pieData.length === 0 ? (
              <div style={{ color: COLORS.muted, padding: 20 }}>Ajoute des achats pour voir la répartition.</div>
            ) : (
              <div className="pea-pie-wrap">
                <div className="pea-pie-chart">
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={65}
                        outerRadius={120}
                        paddingAngle={2}
                      >
                        {pieData.map((d, i) => (
                          <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => fmtMoney(v)}
                        contentStyle={{ fontFamily: "Inter", fontSize: 12.5, borderRadius: 8 }}
                      />
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

const addBtnStyle = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: COLORS.navy,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "7px 12px",
  fontFamily: "Inter",
  fontWeight: 600,
  fontSize: 12.5,
  cursor: "pointer",
};

const addBtnStyleOutline = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  background: "transparent",
  color: COLORS.navy,
  border: `1px solid ${COLORS.navy}`,
  borderRadius: 6,
  padding: "7px 12px",
  fontFamily: "Inter",
  fontWeight: 600,
  fontSize: 12.5,
  cursor: "pointer",
};

export default function App() {
  const [profile, setProfile] = useState(null); // { name, key, data }

  if (!profile) {
    return <ProfileGate onEnter={(p) => setProfile(p)} />;
  }

  return (
    <Dashboard
      profileName={profile.name}
      profileKey={profile.key}
      initialData={profile.data}
      onLogout={() => setProfile(null)}
    />
  );
}
