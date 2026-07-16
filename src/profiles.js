import { randomSaltB64, deriveKey, encryptJSON, decryptJSON } from "./crypto.js";

// Tout est stocké dans le localStorage du navigateur de chaque visiteur.
// Il n'y a donc jamais de serveur ni de base de données partagée : les données
// d'un utilisateur ne quittent jamais son propre navigateur et ne sont donc
// jamais visibles par un autre utilisateur du site.

const PROFILES_KEY = "peaTracker.profiles";
const dataKey = (name) => `peaTracker.data.${name}`;
const SESSION_KEY = "peaTracker.session"; // ne survit qu'à l'onglet ouvert

export function listProfiles() {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProfilesMeta(list) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}

export function profileExists(name) {
  return listProfiles().some((p) => p.name.toLowerCase() === name.toLowerCase());
}

export async function createProfile(name, pin, seedData) {
  const list = listProfiles();
  if (list.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("Ce nom de profil existe déjà.");
  }
  const hasPin = Boolean(pin);
  const salt = hasPin ? randomSaltB64() : null;
  let key = null;
  if (hasPin) {
    key = await deriveKey(pin, salt);
    const payload = await encryptJSON(seedData, key);
    localStorage.setItem(dataKey(name), JSON.stringify({ encrypted: true, ...payload }));
  } else {
    localStorage.setItem(dataKey(name), JSON.stringify({ encrypted: false, data: seedData }));
  }
  list.push({ name, hasPin, salt });
  saveProfilesMeta(list);
  return { name, key };
}

export async function unlockProfile(name, pin) {
  const meta = listProfiles().find((p) => p.name === name);
  if (!meta) throw new Error("Profil introuvable.");
  const raw = localStorage.getItem(dataKey(name));
  const stored = raw ? JSON.parse(raw) : null;

  if (!meta.hasPin) {
    return { key: null, data: stored ? stored.data : null };
  }
  const key = await deriveKey(pin, meta.salt);
  try {
    const data = await decryptJSON(stored, key);
    return { key, data };
  } catch {
    throw new Error("Code incorrect.");
  }
}

export async function saveProfileData(name, key, data) {
  if (key) {
    const payload = await encryptJSON(data, key);
    localStorage.setItem(dataKey(name), JSON.stringify({ encrypted: true, ...payload }));
  } else {
    localStorage.setItem(dataKey(name), JSON.stringify({ encrypted: false, data }));
  }
}

export function deleteProfile(name) {
  const list = listProfiles().filter((p) => p.name !== name);
  saveProfilesMeta(list);
  localStorage.removeItem(dataKey(name));
  if (sessionStorage.getItem(SESSION_KEY) === name) sessionStorage.removeItem(SESSION_KEY);
}

// La session (onglet courant) ne garde en mémoire que le nom du profil sans PIN,
// jamais une clé de déchiffrement : un profil protégé par code redemande
// systématiquement le code après un rechargement de page, par sécurité.
export function getSessionProfileName() {
  return sessionStorage.getItem(SESSION_KEY);
}
export function setSessionProfileName(name) {
  if (name) sessionStorage.setItem(SESSION_KEY, name);
  else sessionStorage.removeItem(SESSION_KEY);
}
