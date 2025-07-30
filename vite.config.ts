import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "icon-192x192.png",
        "icon-512x512.png",
      ],
      manifest: {
        name: "ClassMate",
        short_name: "ClassMate",
        start_url: "/",
        display: "standalone",
        background_color: "#f3f4f6",
        theme_color: "#3b82f6",
        icons: [
          {
            src: "/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
    }),
  ],
});
