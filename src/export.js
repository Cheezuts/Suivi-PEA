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
      (t.type === "vente" ? "\u2212 " : "") + fmt((Number(t.quantity) || 0) * (Number(t.cost) || 0)),
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
  y = doc.lastAutoTable.finalY + 12;

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
