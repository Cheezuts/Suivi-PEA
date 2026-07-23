// Récupération du taux de change USD → EUR via l'API publique et gratuite Frankfurter
// (données de la Banque centrale européenne, sans clé, utilisable directement depuis le navigateur).

export async function fetchUsdToEurRate() {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR");
  if (!res.ok) throw new Error("Impossible de récupérer le taux de change.");
  const json = await res.json();
  const rate = json.rates && json.rates.EUR;
  if (!rate) throw new Error("Taux de change indisponible.");
  return rate;
}
