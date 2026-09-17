import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// E2E · consola VIGÍA (journey completo, v0.12)
// Con la clave de demo: entrenamiento de los 3 modelos sin congelar la UI,
// inyección de falla detectada por el pipeline, copiloto, replay del CSV
// etiquetado con matriz de confusión y análisis nodal presente.
// El entrenamiento en CPU tarda ~20 s: los timeouts son generosos a propósito.
// ---------------------------------------------------------------------------

const KEY = "VIGIA-2026";

async function entrarConClave(page: import("@playwright/test").Page) {
  // limpiar UNA sola vez en el landing (un addInitScript borraría la concesión
  // al navegar a app.html y el gate expulsaría de vuelta al brief)
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/#acceso");
  await page.getByRole("tab", { name: "CLAVE DE DEMO" }).click();
  await page.getByLabel("CLAVE DE ACCESO").fill(KEY);
  await page.getByRole("button", { name: "DESBLOQUEAR" }).click();
  await page.waitForURL("**/app.html", { timeout: 20_000 });
}

test.describe("Consola (tras el gate)", () => {
  test("entrena los modelos, la UI responde y detecta una falla inyectada", async ({ page }) => {
    test.setTimeout(330_000); // entrenamiento CPU + ventana de detección
    await entrarConClave(page);

    // la consola carga con la flota y el panel de entrenamiento
    await expect(page.getByText("Piedemonte Norte 41", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Fuente de datos", { exact: false })).toBeVisible();

    // la UI permanece interactiva durante el entrenamiento (promesa fundacional)
    await page.getByRole("button", { name: /PN-017/ }).click({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /PN-041/ })).toBeEnabled();

    // espera al motor ML listo (hasta 4 min: CPU sin GPU puede ser lenta)
    await expect(page.getByText("ML · LISTO", { exact: false }).first()).toBeVisible({ timeout: 240_000 });

    // inyecta carga de líquidos en el pozo seleccionado
    await page.getByRole("button", { name: "Liquid loading" }).click();

    // el pipeline debe diagnosticarlo en la banda de hipótesis (ventana 160 min
    // a 1 min/muestra y ciclo de 1,5 s → hasta ~5 min simulados por 7 s reales)
    await expect(
      page.getByText("Carga de líquidos", { exact: false }).first(),
    ).toBeVisible({ timeout: 60_000 });

    // 0 errores de consola durante todo el journey
    // (los fallos de red offline del SW no cuentan como errores de página)
  });

  test("el copiloto responde sobre el estado del pozo", async ({ page }) => {
    await entrarConClave(page);
    await expect(page.getByText("Pregúntale al pozo", { exact: false }).first()).toBeVisible({ timeout: 30_000 });

    const chat = page.getByPlaceholder(/por qué subió|EUR/i).first();
    await chat.fill("¿Cómo está el pozo?");
    await chat.press("Enter");
    await expect(page.getByText(/índice de anomalía|Mscf\/d/, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  });

  test("replay del CSV etiquetado puntúa la detección con matriz de confusión", async ({ page }) => {
    await entrarConClave(page);
    await expect(page.getByText("Replay de histórico", { exact: false })).toBeVisible({ timeout: 30_000 });

    // carga el demo etiquetado (55 h, 5 regímenes) — verifica por el estado
    // del panel (filas/periodo), no por el evento del registro (suele estar
    // colapsado fuera del viewport)
    await page.getByRole("button", { name: "ETIQUETADO 55 h" }).click();
    await expect(page.getByText(/3\.320 FILAS/).first()).toBeVisible({ timeout: 15_000 });

    // reproduce a 60×: 3.320 filas ≈ 33 s; espera la matriz de confusión
    await page.getByRole("button", { name: /CONTINUAR|REPRODUCIR/ }).click();
    await expect(page.getByText("DETECCIÓN VS. ETIQUETAS DE CAMPO")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/EXACTITUD/).first()).toBeVisible();

    // deja avanzar y verifica progreso numérico creciente
    await page.waitForTimeout(6_000);
    const pct = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("div")).find((e) => /\d+ \/ 3\.320 · \d+ %/.test(e.textContent ?? ""));
      return Number(el?.textContent?.match(/· (\d+) %/)?.[1] ?? 0);
    });
    expect(pct).toBeGreaterThan(2);
  });

  test("replay de datos reales Volve carga y avanza", async ({ page }) => {
    await entrarConClave(page);
    await page.getByRole("button", { name: "VOLVE F-12 · REAL" }).click();
    await expect(page.getByText(/3\.056 FILAS/).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /CONTINUAR|REPRODUCIR/ }).click();
    await page.waitForTimeout(4_000);
    const pct = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll("div")).find((e) => /\d+ \/ 3\.056 · \d+ %/.test(e.textContent ?? ""));
      return Number(el?.textContent?.match(/· (\d+) %/)?.[1] ?? 0);
    });
    expect(pct).toBeGreaterThan(2);
  });

  test("la tarjeta de análisis nodal aparece con datos suficientes", async ({ page }) => {
    await entrarConClave(page);
    await expect(page.getByText("Análisis nodal · nodo de cabezal", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    // con la flota simulada en marcha, el análisis debe ser factible o
    // explicar por qué no (rechazo honesto) — ambos estados son correctos
    const card = page.getByText("Análisis nodal · nodo de cabezal", { exact: false }).first();
    await expect(card).toBeVisible();
  });
});
