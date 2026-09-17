import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// E2E · landing público + gate de acceso (v0.12)
// Verifica el brief: carga, secciones con revelado, imágenes, y las dos vías
// de acceso (formulario y clave) más el bloqueo de acceso directo.
// ---------------------------------------------------------------------------

test.describe("Landing público", () => {
  test("carga con hero, stats y marquee", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Anticipa la falla/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Anticipa la falla");
    // stats strip visible
    await expect(page.getByText("MODELOS ML")).toBeVisible();
    // hero image renderizada
    const hero = page.locator('img[src*="hero.jpg"]');
    await expect(hero).toBeVisible();
    expect(await hero.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
  });

  test("las secciones se revelan al hacer scroll", async ({ page }) => {
    await page.goto("/");
    for (const id of ["problema", "capacidades", "pipeline", "datos", "tecnologia", "roadmap"]) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
    }
    // las tarjetas de capacidad ya no están en opacity 0
    const card = page.locator(".cap-card").first();
    await expect(card).toBeVisible();
    const opacity = await card.evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);
  });

  test("imágenes del sitio cargan (naturalWidth > 0)", async ({ page }) => {
    await page.goto("/");
    // recorre la página para disparar lazy loading
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    const bad = await page.evaluate(() =>
      Array.from(document.images)
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => i.src),
    );
    expect(bad).toEqual([]);
  });

  test("el acceso directo a la consola sin concesión redirige al landing", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.goto("/app.html");
    await page.waitForURL((u) => !u.pathname.includes("app.html"), { timeout: 15_000 });
    await expect(page).toHaveTitle(/Anticipa la falla/);
  });

  test("formulario válido concede acceso y lleva a la consola", async ({ page }) => {
    await page.goto("/#acceso");
    await page.getByRole("tab", { name: "SOLICITAR ACCESO" }).click();
    await page.getByLabel("NOMBRE *").fill("E2E Tester");
    await page.getByLabel("CORREO *").fill("e2e@vigia.dev");
    await page.getByLabel("EMPRESA").fill("Playwright SA");
    await page.getByLabel("ROL").selectOption("Ing. de producción");
    await page.getByRole("button", { name: "ENTRAR A LA CONSOLA" }).click();
    await page.waitForURL("**/app.html", { timeout: 20_000 });
    // la concesión quedó registrada
    const grant = await page.evaluate(() => localStorage.getItem("vigia_access_v1"));
    expect(grant).toContain("E2E Tester");
  });

  test("clave incorrecta rechaza; clave correcta concede acceso", async ({ page }) => {
    await page.goto("/#acceso");
    await page.evaluate(() => localStorage.clear());
    await page.getByRole("tab", { name: "CLAVE DE DEMO" }).click();
    const input = page.getByLabel("CLAVE DE ACCESO");
    await input.fill("clave-erronea");
    await page.getByRole("button", { name: "DESBLOQUEAR" }).click();
    await expect(page.getByText("Clave incorrecta", { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/#acceso$/);

    await input.fill("VIGIA-2026");
    await page.getByRole("button", { name: "DESBLOQUEAR" }).click();
    await page.waitForURL("**/app.html", { timeout: 20_000 });
    const grant = await page.evaluate(() => localStorage.getItem("vigia_access_v1"));
    expect(grant).toContain('"key"');
  });
});
