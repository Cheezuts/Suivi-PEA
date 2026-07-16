// Chiffrement 100% côté client (Web Crypto API). Aucune donnée ne quitte le navigateur.
// Un "code" (PIN) sert à dériver une clé AES-GCM via PBKDF2. Sans ce code, les données
// stockées restent illisibles. Sans code défini, les données sont stockées en clair
// (pratique en usage perso sur un appareil qui vous est propre).

function toBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromBase64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function randomSaltB64() {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return toBase64(salt);
}

export async function deriveKey(pin, saltB64) {
  const enc = new TextEncoder();
  const salt = fromBase64(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptJSON(obj, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(obj))
  );
  return { iv: toBase64(iv), data: toBase64(cipher) };
}

export async function decryptJSON(payload, key) {
  const iv = fromBase64(payload.iv);
  const data = fromBase64(payload.data);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(new TextDecoder().decode(plain));
}
