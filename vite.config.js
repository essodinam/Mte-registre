import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "MTE Registre",
        short_name: "MTE Registre",
        description: "Gestion de stock, ventes, paie et prise de service — Moïse Tech Énergie",
        start_url: "/",
        display: "standalone",
        background_color: "#1B1F1C",
        theme_color: "#1B1F1C",
        lang: "fr",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Mise en cache de l'app shell pour un lancement hors-ligne.
        // Les données elles-mêmes viennent de Supabase et nécessitent une connexion.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
      }
    })
  ]
});
