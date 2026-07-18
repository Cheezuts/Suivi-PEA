import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Base relative : fonctionne directement sur GitHub Pages,
// que ce soit à la racine (username.github.io) ou dans un sous-dossier (username.github.io/repo).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png", "icon-512-maskable.png"],
      manifest: {
        name: "Suivi de portefeuille",
        short_name: "Portefeuille",
        description: "Suivi PEA, comptes-titres et crypto — 100% local, sans serveur.",
        theme_color: "#10233B",
        background_color: "#10233B",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
      },
    }),
  ],
  base: "./",
});
