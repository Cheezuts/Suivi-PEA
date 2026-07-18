// Récupération de prix crypto en direct via l'API publique CoinGecko (gratuite, sans clé,
// utilisable directement depuis le navigateur — donc compatible avec un hébergement statique
// comme GitHub Pages).

export const CRYPTO_IDS = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", ADA: "cardano", XRP: "ripple",
  DOGE: "dogecoin", BNB: "binancecoin", MATIC: "matic-network", DOT: "polkadot",
  LTC: "litecoin", LINK: "chainlink", AVAX: "avalanche-2", TRX: "tron",
  SHIB: "shiba-inu", ATOM: "cosmos", UNI: "uniswap", XLM: "stellar",
  ETC: "ethereum-classic", FIL: "filecoin", APT: "aptos", ARB: "arbitrum",
  OP: "optimism", NEAR: "near", ALGO: "algorand", ICP: "internet-computer",
  HBAR: "hedera-hashgraph", VET: "vechain", SAND: "the-sandbox", MANA: "decentraland",
  AAVE: "aave", CRO: "crypto-com-chain", MKR: "maker", GRT: "the-graph", EOS: "eos",
  XTZ: "tezos", THETA: "theta-token", EGLD: "elrond-erd-2", FTM: "fantom",
  RUNE: "thorchain", KSM: "kusama", CAKE: "pancakeswap-token", CHZ: "chiliz",
  ENJ: "enjincoin", ZEC: "zcash", DASH: "dash", COMP: "compound-governance-token",
  SUI: "sui", TON: "the-open-network", PEPE: "pepe", WIF: "dogwifcoin", SEI: "sei-network",
  BCH: "bitcoin-cash", XMR: "monero", IMX: "immutable-x", INJ: "injective-protocol",
};

// Retourne { SYMBOL: prixEnEuros } pour les symboles reconnus. Les symboles non reconnus
// sont simplement ignorés (à saisir manuellement dans l'app).
export async function fetchCryptoPrices(symbols) {
  const uniqueSymbols = Array.from(new Set(symbols.map((s) => (s || "").trim().toUpperCase()).filter(Boolean)));
  const ids = uniqueSymbols.map((s) => CRYPTO_IDS[s]).filter(Boolean);
  if (ids.length === 0) return { prices: {}, unknown: uniqueSymbols };

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=eur`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossible de récupérer les prix (API indisponible).");
  const json = await res.json();

  const prices = {};
  const unknown = [];
  uniqueSymbols.forEach((s) => {
    const id = CRYPTO_IDS[s];
    if (id && json[id] && typeof json[id].eur === "number") {
      prices[s] = json[id].eur;
    } else {
      unknown.push(s);
    }
  });
  return { prices, unknown };
}
