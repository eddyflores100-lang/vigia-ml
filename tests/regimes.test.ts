import { describe, it, expect } from "vitest";
import { createFleet } from "../src/lib/sim";
import type { WellSim } from "../src/lib/sim";
import { diagnose, recommend } from "../src/lib/models";
import { priorFor, rulForDiag } from "../src/lib/rul";

const NEW_IDS = ["casing-leak", "tubing-leak", "hydrates", "sanding"];

/** Inyecta un régimen y avanza la simulación durante la rampa (antes de saturar). */
function runScenario(id: string, scenario: Parameters<WellSim["setScenario"]>[0], ticks = 300): WellSim {
  const fleet = createFleet();
  const w = fleet.find((x) => x.id === id)!;
  w.setScenario(scenario);
  for (let i = 0; i < ticks; i++) w.tick();
  return w;
}

describe("regímenes extendidos — detección N3", () => {
  it("fuga en anular: pc cae sostenida sin reacción en el tubing", () => {
    const w = runScenario("GN-118", "casingLeak");
    const diag = diagnose(w.buf.slice(-160));
    const h = diag.find((d) => d.id === "casing-leak");
    expect(h).toBeDefined();
    expect(h!.conf).toBeGreaterThan(0.4);
    expect(h!.evidence.some((e) => e.includes("casing")) || h!.evidence.length > 0).toBe(true);
  });

  it("fuga en tubing: pt y pc caen en paralelo con pérdida de caudal (y NO liquid loading)", () => {
    const w = runScenario("GN-118", "tubingLeak");
    const diag = diagnose(w.buf.slice(-160));
    const h = diag.find((d) => d.id === "tubing-leak");
    expect(h).toBeDefined();
    expect(h!.conf).toBeGreaterThan(0.5);
    // la fuga de tubing debe ganarle al liquid loading (el pc cae, no sube)
    const ll = diag.find((d) => d.id === "liquid-loading" && d.name.includes("establecido"));
    const llTop = diag.find((d) => d.id === "liquid-loading");
    expect(h!.conf).toBeGreaterThan(llTop ? llTop.conf : 0);
    void ll;
  });

  it("hidratos: enfriamiento sostenido + restricción creciente aguas abajo", () => {
    const w = runScenario("GN-118", "hydrates");
    const diag = diagnose(w.buf.slice(-160));
    const h = diag.find((d) => d.id === "hydrates");
    expect(h).toBeDefined();
    expect(h!.conf).toBeGreaterThan(0.4);
  });

  it("arena: ráfagas de alta frecuencia en caudal con choke estable", () => {
    const w = runScenario("GN-118", "sanding");
    const diag = diagnose(w.buf.slice(-160));
    const h = diag.find((d) => d.id === "sanding");
    expect(h).toBeDefined();
    expect(h!.conf).toBeGreaterThan(0.4);
  });

  it("los pozos estables NO disparan los regímenes nuevos (sin falsos positivos)", () => {
    const fleet = createFleet();
    for (const w of fleet) {
      const diag = diagnose(w.buf.slice(-160));
      const activos = NEW_IDS.filter((id) => diag.some((d) => d.id === id));
      // PN-041/PN-017/AL-006 arrancan con regímenes inyectados en su script:
      // solo exigimos blanco en los pozos sin guion
      if (w.script.length === 0) {
        expect(activos, `pozo ${w.id} disparó ${activos.join(",")}`).toEqual([]);
      }
    }
  });

  it("recomendaciones nuevas para los regímenes nuevos", () => {
    const mkH = (id: string) => ({ id, name: id, icon: "valve" as const, conf: 0.8, evidence: [] });
    const emptyProj = [];
    for (const id of NEW_IDS) {
      const recs = recommend([mkH(id)], emptyProj as never, [] as never);
      expect(recs.length, `sin recomendación para ${id}`).toBeGreaterThan(0);
      expect(recs.some((r) => r.prio === "ALTA" || r.prio === "MEDIA")).toBe(true);
    }
  });

  it("RUL funciona con los modos nuevos (prior, edad y cuantiles coherentes)", () => {
    const w = runScenario("GN-118", "casingLeak");
    const diag = diagnose(w.buf.slice(-160));
    const h = diag.find((d) => d.id === "casing-leak")!;
    const r = rulForDiag(h.id, h.conf, w.buf.slice(-240), w.base, 60);
    expect(r.mode).toBe("casing-leak");
    expect(r.eta0).toBe(600);
    expect(r.rulMedian).toBeGreaterThan(0);
    expect(r.p10).toBeLessThan(r.p90);
    // priors de los 4 modos existen
    for (const id of NEW_IDS) {
      const p = priorFor(id);
      expect(p.eta).toBeGreaterThan(0);
      expect(p.beta).toBeGreaterThan(1);
    }
  });
});
