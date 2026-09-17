import { defineConfig, devices } from "@playwright/test";

// ---------------------------------------------------------------------------
// VIGÍA · configuración E2E (v0.12)
// ---------------------------------------------------------------------------
// Corre contra `vite preview` del build de producción (MPA: index=landing,
// app.html=consola). Chromium only en CI para mantener el tiempo de suite
// bajo; el entrenamiento TF.js en CPU añade ~20 s por contexto nuevo.
// ---------------------------------------------------------------------------

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
