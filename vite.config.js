import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./", // rutas relativas: funciona en GitHub Pages, Vercel y Cloudflare
  plugins: [react(), tailwindcss()],
  // Vitest: los specs E2E de Playwright viven en e2e/ y no son unit tests
  test: {
    exclude: ["node_modules/**", "dist/**", "e2e/**", "bridge/**"],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: "index.html", // landing público (brief)
        app: "app.html", // consola (tras el gate)
      },
      output: {
        manualChunks: {
          tensorflow: ["@tensorflow/tfjs"],
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
