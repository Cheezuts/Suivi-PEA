import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function fmt(n, min = 2, max = 2) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: min, maximumFractionDigits: max }) + " €";
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function signedTxAmount(t) {
  const q = Number(t.quantity) || 0;
  const c = Number(t.cost) || 0;
  return (t.type === "vente" ? -1 : 1) * q * c;
}
function signedVersementAmount(v) {
  const a = Number(v.amount) || 0;
  return v.type === "retrait" ? -a : a;
}
function monthKeyOf(iso) {
  return iso ? iso.slice(0, 7) : "";
}
function monthLabelOf(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}
// Petit graphique en barres dessiné en vectoriel (rect/line jsPDF natifs) : aucun risque
// d'encodage de police, contrairement à une image capturée depuis le navigateur.
function drawBarChart(doc, { x, y, width, height, data }) {
  if (!data.length) return;
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasNegative = data.some((d) => d.value < 0);
  const baseline = hasNegative ? y + height / 2 : y + height;
  const usableHeight = hasNegative ? height / 2 : height;
  const gap = width / data.length;
  const barW = Math.min(gap * 0.6, 14);

  doc.setDrawColor(210);
  doc.setLineWidth(0.2);
  doc.line(x, baseline, x + width, baseline);

  data.forEach((d, i) => {
    const barH = (Math.abs(d.value) / maxAbs) * (usableHeight - 4);
    const bx = x + i * gap + (gap - barW) / 2;
    const by = d.value >= 0 ? baseline - barH : baseline;
    doc.setFillColor(...(d.value >= 0 ? [184, 135, 58] : [181, 72, 77]));
    doc.rect(bx, by, barW, Math.max(barH, 0.3), "F");
    doc.setFontSize(6.5);
    doc.setTextColor(110);
    doc.text(d.label, bx + barW / 2, baseline + (d.value >= 0 ? 0 : barH) + 7, { align: "center" });
  });
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[;"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function fmtNum(n) {
  return Number.isFinite(n) ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "";
}

// Export CSV : toutes les opérations et versements d'un compte, format Excel FR
// (séparateur point-virgule, virgule décimale, BOM pour les accents).
export function exportCSV(profileName, accountName, account) {
  const rows = [];
  rows.push(["Date", "Catégorie", "Type", "Actif", "Code / ISIN", "Quantité", "Prix unitaire", "Montant"]);
  account.transactions.forEach((t) => {
    rows.push([
      fmtDate(t.date),
      "Opération",
      t.type === "vente" ? "Vente" : "Achat",
      t.etf || "",
      t.isin || "",
      t.quantity ?? "",
      fmtNum(Number(t.cost) || 0),
      fmtNum((Number(t.quantity) || 0) * (Number(t.cost) || 0)),
    ]);
  });
  account.versements.forEach((v) => {
    rows.push([fmtDate(v.date), "Versement", v.type === "retrait" ? "Retrait" : "Dépôt", "", "", "", "", fmtNum(Number(v.amount) || 0)]);
  });
  const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suivi-${accountName}-${profileName}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Export JSON complet : toutes les données de tous les comptes du profil (sauvegarde totale)
export function exportJSON(profileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suivi-portefeuille-${profileName}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (e) {
        reject(new Error("Fichier JSON invalide."));
      }
    };
    reader.onerror = () => reject(new Error("Impossible de lire le fichier."));
    reader.readAsText(file);
  });
}

// Export PDF : rapport lisible pour UN compte (celui actuellement sélectionné dans l'app)
export function exportPDF(profileName, accountName, account) {
  const doc = new jsPDF();
  const totalInvesti = account.transactions.reduce((s, t) => s + signedTxAmount(t), 0);
  const totalVerse = account.versements.reduce((s, v) => s + signedVersementAmount(v), 0);

  doc.setFontSize(18);
  doc.text("Suivi de portefeuille", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Profil : ${profileName}  \u2014  Compte : ${accountName}  \u2014  export\u00e9 le ${fmtDate(new Date().toISOString().slice(0, 10))}`,
    14,
    25
  );

  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`Total vers\u00e9 (net) : ${fmt(totalVerse)}`, 14, 34);
  doc.text(`Total investi (net) : ${fmt(totalInvesti)}`, 90, 34);
  doc.text(`Liquidit\u00e9s : ${fmt(totalVerse - totalInvesti)}`, 150, 34);

  let y = 42;

  doc.setFontSize(13);
  doc.text("Achats & ventes", 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "Type", "Actif", "Code", "Quantit\u00e9", "Prix unitaire", "Montant"]],
    body: account.transactions.map((t) => [
      fmtDate(t.date),
      t.type === "vente" ? "Vente" : "Achat",
      t.etf || "",
      t.isin || "",
      String(t.quantity ?? ""),
      fmt(Number(t.cost) || 0),
      (t.type === "vente" ? "- " : "") + fmt((Number(t.quantity) || 0) * (Number(t.cost) || 0)),
    ]),
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [16, 35, 59] },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 12;

  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFontSize(13);
  doc.text("D\u00e9p\u00f4ts & retraits", 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "Type", "Montant"]],
    body: account.versements.map((v) => [
      fmtDate(v.date),
      v.type === "retrait" ? "Retrait" : "D\u00e9p\u00f4t",
      fmt(Number(v.amount) || 0),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [16, 35, 59] },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  const monthlyMap = {};
  account.versements.forEach((v) => {
    const k = monthKeyOf(v.date);
    if (!k) return;
    monthlyMap[k] = (monthlyMap[k] || 0) + signedVersementAmount(v);
  });
  const monthlyData = Object.keys(monthlyMap).sort().map((k) => ({ label: monthLabelOf(k), value: monthlyMap[k] }));
  if (monthlyData.length > 1) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text("Versements par mois", 14, y);
    drawBarChart(doc, { x: 14, y: y + 6, width: 180, height: 38, data: monthlyData });
    y = y + 6 + 38 + 14;
  }

  if (account.valorisations.length) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(13);
    doc.text("Journal de valorisation", 14, y);
    const sortedVers = [...account.versements].sort((a, b) => a.date.localeCompare(b.date));
    const cumuleAt = (d) =>
      sortedVers.filter((v) => v.date <= d).reduce((s, v) => s + signedVersementAmount(v), 0);
    const rows = [...account.valorisations]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => {
        const cumule = cumuleAt(r.date);
        const diff = (Number(r.value) || 0) - cumule;
        return [fmtDate(r.date), fmt(Number(r.value) || 0), fmt(cumule), fmt(diff)];
      });
    autoTable(doc, {
      startY: y + 4,
      head: [["Date", "Valorisation", "Versements cumul\u00e9s", "+/- value"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [16, 35, 59] },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`suivi-${accountName}-${profileName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
