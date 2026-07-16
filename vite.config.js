import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base relative : fonctionne directement sur GitHub Pages,
// que ce soit à la racine (username.github.io) ou dans un sous-dossier (username.github.io/repo).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
