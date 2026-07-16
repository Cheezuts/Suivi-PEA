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

export function exportJSON(profileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suivi-pea-${profileName}-${new Date().toISOString().slice(0, 10)}.json`;
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

export function exportPDF(profileName, data) {
  const doc = new jsPDF();
  const totalInvesti = data.transactions.reduce(
    (s, t) => s + (Number(t.quantity) || 0) * (Number(t.cost) || 0),
    0
  );
  const totalVerse = data.versements.reduce((s, v) => s + (Number(v.amount) || 0), 0);

  doc.setFontSize(18);
  doc.text("Suivi PEA", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Profil : ${profileName}  \u2014  export\u00e9 le ${fmtDate(new Date().toISOString().slice(0, 10))}`, 14, 25);

  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`Total vers\u00e9 : ${fmt(totalVerse)}`, 14, 34);
  doc.text(`Total investi : ${fmt(totalInvesti)}`, 90, 34);
  doc.text(`Liquidit\u00e9s : ${fmt(totalVerse - totalInvesti)}`, 150, 34);

  let y = 42;

  doc.setFontSize(13);
  doc.text("Achats d'ETF", 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "ETF", "ISIN", "Quantit\u00e9", "Co\u00fbt unitaire", "Montant"]],
    body: data.transactions.map((t) => [
      fmtDate(t.date),
      t.etf || "",
      t.isin || "",
      String(t.quantity ?? ""),
      fmt(Number(t.cost) || 0),
      fmt((Number(t.quantity) || 0) * (Number(t.cost) || 0)),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [16, 35, 59] },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 12;

  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(13);
  doc.text("Versements", 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Date", "Montant"]],
    body: data.versements.map((v) => [fmtDate(v.date), fmt(Number(v.amount) || 0)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [16, 35, 59] },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 12;

  if (data.valorisations.length) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(13);
    doc.text("Journal de valorisation", 14, y);
    const sortedVers = [...data.versements].sort((a, b) => a.date.localeCompare(b.date));
    const cumuleAt = (d) =>
      sortedVers.filter((v) => v.date <= d).reduce((s, v) => s + (Number(v.amount) || 0), 0);
    const rows = [...data.valorisations]
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

  doc.save(`suivi-pea-${profileName}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
