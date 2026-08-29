// ---------------------------------------------------------------------------
// VIGÍA ML · pruebas del simulador de telemetría (sim.ts)
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import { WellSim, createFleet, mergeEvents, sanitizeSample, VAR_KEYS } from "../src/lib/sim";
import type { WellCfg } from "../src/lib/sim";

const cfg = (over: Partial<WellCfg> = {}): WellCfg => ({
  id: "T-001",
  name: "pozo de prueba",
  field: "test",
  depth: "1.000 m",
  base: { pt: 560, pc: 780, pl: 430, temp: 44, q: 2250, choke: 54 },
  seed: 1103,
  script: [],
  preRun: 120,
  ...over,
});

const finiteAll = (rows: { m: number }[]) =>
  rows.every((s) => VAR_KEYS.every((k) => Number.isFinite(s[k])));

describe("WellSim", () => {
  it("genera un buffer pre-run finito y del tamaño esperado", () => {
    const w = new WellSim(cfg());
    expect(w.buf).toHaveLength(120);
    expect(finiteAll(w.buf)).toBe(true);
    expect(w.last.m).toBe(120);
  });

  it("es determinista: misma semilla produce la misma serie", () => {
    const a = new WellSim(cfg()).buf.map((s) => s.pt);
    const b = new WellSim(cfg()).buf.map((s) => s.pt);
    expect(a).toEqual(b);
  });

  it("tick() avanza el reloj y crece el buffer respetando el límite 520", () => {
    const w = new WellSim(cfg({ preRun: 500 }));
    const m0 = w.last.m;
    w.tick();
    w.tick();
    expect(w.last.m).toBe(m0 + 2);
    expect(w.buf.length).toBeLessThanOrEqual(520);
    expect(finiteAll(w.buf.slice(-3))).toBe(true);
  });

  it("la inyección de escenario cambia el régimen y queda registrada en el log", () => {
    const w = new WellSim(cfg());
    const n0 = w.events.length;
    w.setScenario("liquidLoading");
    expect(w.scenario).toBe("liquidLoading");
    expect(w.events.length).toBeGreaterThan(n0);
    expect(w.events.at(-1)!.msg).toMatch(/liquid loading/i);
  });

  it("sensorFault congela pt (señal plana) con desviación mínima", () => {
    const w = new WellSim(cfg({ preRun: 60, script: [{ at: 61, s: "sensorFault" }] }));
    w.setScenario("sensorFault");
    const tail = w.buf.slice(-20).map((s) => s.pt);
    const span = Math.max(...tail) - Math.min(...tail);
    expect(span).toBeLessThan(5); // congelado: casi sin variación (spike raro <2%)
  });

  it("neverNaN: tras 200 ticks con escenarios mezclados todos los valores son finitos", () => {
    const w = new WellSim(cfg({ preRun: 10 }));
    const scen = ["normal", "liquidLoading", "restriction", "sensorFault", "controlIssue"] as const;
    for (let i = 0; i < 200; i++) {
      if (i % 40 === 0) w.setScenario(scen[(i / 40) % scen.length]);
      w.tick();
    }
    expect(finiteAll(w.buf)).toBe(true);
  });
});

describe("sanitizeSample", () => {
  it("reemplaza NaN/Infinity por valores finitos dentro del rango físico", () => {
    const bad = { m: NaN, pt: NaN, pc: Infinity, pl: -Infinity, temp: NaN, q: NaN, choke: 900 };
    const s = sanitizeSample(bad);
    for (const k of VAR_KEYS) expect(Number.isFinite(s[k])).toBe(true);
    expect(s.choke).toBe(100); // recortado al máximo físico
    expect(s.q).toBe(0);
  });

  it("deja intacta una muestra válida (valores idénticos)", () => {
    const ok = { m: 10, pt: 560, pc: 780, pl: 430, temp: 44, q: 2250, choke: 54 };
    expect(sanitizeSample(ok)).toEqual(ok);
  });
});

describe("flota", () => {
  it("createFleet crea 5 pozos con configuraciones válidas", () => {
    const fleet = createFleet();
    expect(fleet).toHaveLength(5);
    const ids = new Set(fleet.map((w) => w.id));
    expect(ids.size).toBe(5);
    for (const w of fleet) {
      expect(w.buf.length).toBeGreaterThan(0);
      expect(Number.isFinite(w.last.q)).toBe(true);
    }
  });

  it("mergeEvents ordena por minuto descendente y respeta el límite", () => {
    const fleet = createFleet();
    const evs = mergeEvents(fleet, 10);
    expect(evs.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < evs.length; i++) {
      expect(evs[i - 1].m).toBeGreaterThanOrEqual(evs[i].m);
    }
  });
});
