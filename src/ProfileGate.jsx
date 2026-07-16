import React, { useState } from "react";
import { LogIn, UserPlus, Lock, ShieldCheck } from "lucide-react";
import { listProfiles, createProfile, unlockProfile } from "./profiles.js";

const seedData = {
  transactions: [],
  versements: [],
  valorisations: [],
};

export default function ProfileGate({ onEnter }) {
  const [profiles, setProfiles] = useState(listProfiles());
  const [mode, setMode] = useState(profiles.length ? "select" : "create");
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleUnlock(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { key, data } = await unlockProfile(selected.name, pin);
      onEnter({ name: selected.name, key, data: data || seedData });
    } catch (err) {
      setError(err.message || "Impossible d'ouvrir ce profil.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (!newName.trim()) {
      setError("Choisis un nom de profil.");
      return;
    }
    if (newPin && newPin.length < 4) {
      setError("Le code doit faire au moins 4 caractères.");
      return;
    }
    if (newPin !== newPinConfirm) {
      setError("Les deux codes ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const { key } = await createProfile(newName.trim(), newPin || null, seedData);
      onEnter({ name: newName.trim(), key, data: seedData });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate-wrap">
      <div className="gate-card">
        <div className="gate-title">Suivi PEA</div>
        <div className="gate-sub">
          Application 100% locale : tes données restent uniquement dans ton navigateur, sur cet
          appareil. Aucun serveur, aucune base de données partagée.
        </div>

        <div className="gate-tabs">
          <button
            className={mode === "select" ? "gate-tab active" : "gate-tab"}
            onClick={() => {
              setMode("select");
              setError("");
            }}
            disabled={profiles.length === 0}
          >
            <LogIn size={14} /> Ouvrir un profil
          </button>
          <button
            className={mode === "create" ? "gate-tab active" : "gate-tab"}
            onClick={() => {
              setMode("create");
              setError("");
            }}
          >
            <UserPlus size={14} /> Nouveau profil
          </button>
        </div>

        {mode === "select" && (
          <>
            {profiles.length === 0 ? (
              <div className="gate-empty">Aucun profil sur cet appareil pour l'instant.</div>
            ) : !selected ? (
              <div className="gate-list">
                {profiles.map((p) => (
                  <button key={p.name} className="gate-profile" onClick={() => setSelected(p)}>
                    <span>{p.name}</span>
                    {p.hasPin && <Lock size={13} />}
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={handleUnlock} className="gate-form">
                <div className="gate-selected">
                  Profil : <strong>{selected.name}</strong>
                  <button type="button" className="gate-link" onClick={() => setSelected(null)}>
                    changer
                  </button>
                </div>
                {selected.hasPin && (
                  <input
                    type="password"
                    placeholder="Code du profil"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    autoFocus
                    className="gate-input"
                  />
                )}
                {error && <div className="gate-error">{error}</div>}
                <button type="submit" className="gate-btn" disabled={busy}>
                  {busy ? "Ouverture…" : "Entrer"}
                </button>
              </form>
            )}
          </>
        )}

        {mode === "create" && (
          <form onSubmit={handleCreate} className="gate-form">
            <input
              type="text"
              placeholder="Nom du profil (ex. Alex)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="gate-input"
            />
            <input
              type="password"
              placeholder="Code optionnel (protège tes données)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="gate-input"
            />
            {newPin && (
              <input
                type="password"
                placeholder="Confirme le code"
                value={newPinConfirm}
                onChange={(e) => setNewPinConfirm(e.target.value)}
                className="gate-input"
              />
            )}
            <div className="gate-hint">
              <ShieldCheck size={13} /> Sans code, tes données sont lisibles par toute personne
              ayant accès à ce navigateur. Avec un code, elles sont chiffrées (AES-256).
            </div>
            {error && <div className="gate-error">{error}</div>}
            <button type="submit" className="gate-btn" disabled={busy}>
              {busy ? "Création…" : "Créer et entrer"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
