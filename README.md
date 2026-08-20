# Suivi de portefeuille

Application multi-comptes (PEA, Compte-titres, Crypto, Autre) de suivi de portefeuille — 100 % côté client, aucun serveur, aucune base de données. Installable comme une vraie application (PWA).

## Fonctionnalités

- **Multi-comptes** : PEA, Compte-titres, Crypto ou Autre, chacun avec sa propre couleur d'accent pour bien les différencier visuellement.
- **Vue d'ensemble** : patrimoine total tous comptes confondus, camembert cliquable pour rejoindre un compte en un clic.
- **Achats & ventes** avec quantités nettes, coût moyen pondéré et **rendement en %** (pas seulement en €).
- **Versements** (dépôts/retraits illimités) avec graphique mensuel, moyenne et jours depuis le dernier versement.
- **Calculateur de répartition** : répartit un montant à verser entre tes actifs selon tes allocations cibles, en respectant l'achat par unité entière (sauf crypto, qui autorise les quantités fractionnées).
- **Saisie en €, en $, ou en ne renseignant que 2 valeurs sur 3** : bascule €/$ (conversion automatique via l'API BCE) sur le prix d'achat et les versements ; pour une transaction, remplis la quantité *ou* le prix, puis le montant total — l'autre se calcule tout seul.
- **Lignes triables, clonables et réordonnables** : clique un en-tête de colonne pour trier (ex. regrouper tous les BTC ensemble), duplique une ligne en un clic, ou réordonne-les manuellement avec les flèches ▲▼.
- **Prix crypto en direct** : bouton "Actualiser les prix" qui va chercher les cours actuels via l'API publique CoinGecko (aucune clé requise), plus un mini-graphique d'historique (7/30/90 jours) par actif.
- **Ergonomie mobile/tablette/PC** : vue "carte" sur mobile pour les opérations, glisser pour supprimer une ligne (mobile), glisser-déposer pour réordonner (PC), disposition 2 colonnes sur tablette, boutons agrandis au toucher, mode sombre, focus clavier visible, en-tête de tableau collant au défilement.
- **Import CSV** avec mapping de colonnes (bouton dans l'onglet Opérations) : accepte un export de courtier quelconque (virgule ou point-virgule, formats de date JJ/MM/AAAA, MM/JJ/AAAA ou AAAA-MM-JJ, virgule ou point décimal), avec aperçu avant import.
- **Sous-menu "Analyse"** regroupant Calculateur / Objectifs / Valorisation / Répartition pour désencombrer la barre principale.
- **Actions groupées** dans Opérations : sélection multiple (cases à cocher), suppression ou duplication en lot.
- **Recherche** par actif/code/type, et colonne Code/ISIN masquable pour réduire la densité d'une ligne.
- **Cohérence devise €/$** : la bascule est maintenant disponible partout où un prix se saisit (Opérations, Versements, Calculateur).
- **Saisie robuste** : virgule ou point fonctionnent indifféremment comme séparateur décimal partout, et le montant calculé automatiquement n'affiche plus d'artefacts d'imprécision flottante (ex. `175.42100000000002`).
- **Repérage visuel par actif** : chaque actif (PEA Monde, BTC…) garde toujours la même couleur discrète d'une ligne à l'autre, pour repérer facilement les lignes d'un même titre.
- **Graphique des versements** : bascule "Par mois / Par jour" pour éviter l'effet de tassement quand plusieurs versements tombent le même mois.
- **Bandeau de rappel d'export** : bouton de téléchargement direct et bouton de fermeture.
- **Raccourcis clavier** : `N` (nouvelle ligne), `Ctrl+Z` (annuler la dernière modification), `?` (ouvrir le guide). Un tutoriel intégré explique chaque onglet et ces raccourcis (bouton "Aide").
- **Export CSV** en plus du PDF/JSON, et un bandeau de rappel si tu n'as pas exporté depuis longtemps.
- **Paliers de vente crypto** : définis plusieurs paliers de prise de bénéfice par actif (ex. vendre 25 % quand le prix a pris +30 % par rapport à ton prix de revient moyen), avec barre de progression vers chaque palier.
- **Objectifs d'épargne** : plusieurs objectifs par compte, montant visé, échéance optionnelle, barre de progression basée sur la valeur actuelle du compte.
- **Confirmation à la suppression** de n'importe quelle ligne, et bouton de confirmation visuelle à la saisie (les données sont en réalité sauvegardées en continu, ce bouton sert de repère visuel).
- **Export JSON** (sauvegarde complète, réimportable) et **Export PDF** (rapport lisible sans l'application) par compte.

## Comment ça marche sans base de données

- Toutes les données sont stockées dans le **localStorage du navigateur** de chaque visiteur.
- Chaque utilisateur qui ouvre le site a donc automatiquement ses propres données, invisibles pour les autres.
- Un système de **profils locaux** permet en plus à plusieurs personnes de partager un même navigateur sans mélanger leurs données, avec un code optionnel qui chiffre les données (AES-256-GCM).
- **Limite à connaître** : les données restent liées à l'appareil et au navigateur utilisés — d'où l'intérêt des exports réguliers.

## Prix crypto en direct

Le bouton "Actualiser les prix" (Calculateur et onglet Par actif, sur un compte de type Crypto) interroge l'API gratuite de CoinGecko directement depuis ton navigateur. Une cinquantaine de cryptos courantes sont reconnues (BTC, ETH, SOL, ADA, XRP…) ; un symbole non reconnu reste à saisir manuellement.

## Installer l'application sur ton téléphone ou ordinateur (PWA)

Une fois le site déployé sur GitHub Pages (HTTPS obligatoire, ce qui est automatique avec Pages) :
- **Android / Chrome** : menu ⋮ → "Installer l'application" (ou une bannière apparaît automatiquement)
- **iPhone / Safari** : bouton Partager → "Sur l'écran d'accueil"
- **Ordinateur (Chrome/Edge)** : icône d'installation dans la barre d'adresse

L'app s'ouvre alors en plein écran, comme une application native, avec son icône.

## Lancer en local

```bash
npm install
npm run dev
```

## Build de production

```bash
npm run build
npm run preview   # pour tester le build localement
```

## Déployer sur GitHub Pages

1. Crée un dépôt GitHub et pousse ce projet dedans :
   ```bash
   git init
   git add .
   git commit -m "Suivi de portefeuille"
   git branch -M main
   git remote add origin https://github.com/<ton-utilisateur>/<ton-repo>.git
   git push -u origin main
   ```
2. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` (déjà inclus) se déclenche automatiquement à chaque `push` sur `main`, build le projet (y compris le service worker PWA) et le publie.
4. Le site sera disponible à `https://<ton-utilisateur>.github.io/<ton-repo>/`.

Aucune configuration supplémentaire n'est nécessaire : `vite.config.js` utilise une base relative (`./`) qui fonctionne aussi bien à la racine d'un domaine que dans un sous-dossier GitHub Pages.

## Stack technique

- React 18 + Vite
- [recharts](https://recharts.org/) pour les graphiques
- [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable pour l'export PDF
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) pour l'installation en application (manifest + service worker)
- API publique [CoinGecko](https://www.coingecko.com/en/api) pour les prix crypto en direct
- Web Crypto API (PBKDF2 + AES-GCM) pour le chiffrement optionnel des profils

