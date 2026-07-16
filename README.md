# Suivi PEA

Application de suivi de portefeuille PEA (ETF, versements, valorisation, répartition), 100 % côté client — aucun serveur, aucune base de données.

## Comment ça marche sans base de données

- Toutes les données sont stockées dans le **localStorage du navigateur** de chaque visiteur.
- Chaque utilisateur qui ouvre le site a donc automatiquement ses propres données, invisibles pour les autres, puisqu'elles ne quittent jamais son navigateur.
- Un système de **profils locaux** permet, en plus, à plusieurs personnes de partager un même navigateur/ordinateur sans mélanger leurs données. Chaque profil peut être protégé par un code : dans ce cas les données sont chiffrées (AES-256-GCM, dérivé du code via PBKDF2) avant d'être stockées.
- **Limite à connaître** : comme il n'y a pas de serveur, les données restent liées à l'appareil et au navigateur utilisés. Vider le cache du navigateur ou changer d'appareil fait perdre l'accès aux données locales — d'où l'intérêt de la fonction d'export.

## Export des données

Dans l'en-tête de l'application :
- **Export JSON** — sauvegarde complète, réimportable dans l'app (bouton "Importer").
- **Export PDF** — rapport lisible (tableaux des achats, versements, valorisation) consultable sans l'application, sur n'importe quel appareil.

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
   git commit -m "Suivi PEA"
   git branch -M main
   git remote add origin https://github.com/<ton-utilisateur>/<ton-repo>.git
   git push -u origin main
   ```
2. Dans le dépôt GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` (déjà inclus) se déclenche automatiquement à chaque `push` sur `main`, build le projet et le publie.
4. Le site sera disponible à `https://<ton-utilisateur>.github.io/<ton-repo>/`.

Aucune configuration supplémentaire n'est nécessaire : `vite.config.js` utilise une base relative (`./`) qui fonctionne aussi bien à la racine d'un domaine que dans un sous-dossier GitHub Pages.

## Stack technique

- React 18 + Vite
- [recharts](https://recharts.org/) pour les graphiques
- [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable pour l'export PDF
- Web Crypto API (PBKDF2 + AES-GCM) pour le chiffrement optionnel des profils
