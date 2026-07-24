// Récupération du taux de change USD → EUR. Deux sources publiques et gratuites,
// sans clé, utilisables directement depuis le navigateur : si la première échoue
// (indisponibilité ponctuelle, blocage réseau...), on tente automatiquement la seconde.

async function tryFrankfurter() {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
  if (!res.ok) throw new Error("frankfurter indisponible");
  const json = await res.json();
  const rate = json.rates && json.rates.EUR;
  if (!rate) throw new Error("frankfurter: pas de taux EUR");
  return rate;
}

async function tryOpenErApi() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error("open.er-api indisponible");
  const json = await res.json();
  const rate = json.rates && json.rates.EUR;
  if (!rate) throw new Error("open.er-api: pas de taux EUR");
  return rate;
}

export async function fetchUsdToEurRate() {
  try {
    return await tryFrankfurter();
  } catch (e1) {
    try {
      return await tryOpenErApi();
    } catch (e2) {
      throw new Error("Impossible de récupérer le taux de change (deux sources ont échoué). Réessaie dans un instant.");
    }
  }
}
