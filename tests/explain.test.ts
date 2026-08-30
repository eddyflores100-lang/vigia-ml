import { describe, it, expect } from "vitest";
import { explainSamples } from "../src/lib/explain";
import type { Driver } from "../src/lib/explain";
import type { Sample } from "../src/lib/sim";

const BASE = { pt: 560, pc: 780, pl: 430, temp: 44, q: 2250, choke: 54 };

// PRNG determinista (mulberry32) para series sintéticas reproducibles
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | 0x1d872b91);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mk = (i: number, over: Partial<Sample>): Sample => ({
  m: i,
  pt: BASE.pt, pc: BASE.pc, pl: BASE.pl, temp: BASE.temp, q: BASE.q, choke: BASE.choke,
  ...over,
});

/** Serie estable: ruido uniforme ±0.3 en variables continuas (sin tendencia). */
function stableSeries(n = 120): Sample[] {
  const rnd = mulberry32(42);
  return Array.from({ length: n }, (_, i) =>
    mk(i, {
      pt: BASE.pt + (rnd() - 0.5) * 0.6,
      pc: BASE.pc + (rnd() - 0.5) * 0.6,
      pl: BASE.pl + (rnd() - 0.5) * 0.6,
      temp: BASE.temp + (rnd() - 0.5) * 0.4,
      q: BASE.q + (rnd() - 0.5) * 18,
      choke: BASE.choke,
    }),
  );
}

/** Serie con P·tubing en caída lineal fuerte (−2 psi/min): liquid loading. */
function decliningPt(n = 120): Sample[] {
  const rnd = mulberry32(7);
  return Array.from({ length: n }, (_, i) =>
    mk(i, {
      pt: BASE.pt - 2 * i + (rnd() - 0.5) * 0.4,
      pc: BASE.pc + (rnd() - 0.5) * 0.5,
      pl: BASE.pl + (rnd() - 0.5) * 0.5,
      temp: BASE.temp + (rnd() - 0.5) * 0.3,
      q: BASE.q + (rnd() - 0.5) * 14,
      choke: BASE.choke,
    }),
  );
}

const LEVEL = { score: 84, level: "CRÍTICO" } as const;

describe("explain — descomposición del índice de anomalía", () => {
  it("los aportes normalizados suman 100 % y quedan ordenados descendentemente", () => {
    const ex = explainSamples(decliningPt(), LEVEL);
    const sum = ex.drivers.reduce((a, d) => a + d.share, 0);
    expect(sum).toBeGreaterThan(99.5);
    expect(sum).toBeLessThan(100.5);
    for (let i = 1; i < ex.drivers.length; i++) {
      expect(ex.drivers[i - 1].share).toBeGreaterThanOrEqual(ex.drivers[i].share);
    }
  });

  it("una caída fuerte de P·tubing domina el índice con dirección 'baja'", () => {
    const ex = explainSamples(decliningPt(), LEVEL);
    const pt = ex.drivers.find((d) => d.key === "pt")!;
    expect(pt.share).toBeGreaterThan(30);
    expect(pt.dir).toBe("baja");
    expect(pt.trend).toBeLessThan(-100); // ≈ −120 psi/h
    expect(pt.flat).toBe(false);
    expect(ex.summary).toContain("PT-101");
    expect(ex.summary).toContain("dominado por");
  });

  it("serie estable: sin drivers planos y con la narrativa del nivel recibido", () => {
    const ex = explainSamples(stableSeries(), { score: 12, level: "ÓPTIMO" });
    expect(ex.drivers.every((d) => !d.flat)).toBe(true);
    expect(ex.summary).toContain("ÓPTIMO");
    expect(ex.summary).toContain("12/100");
    expect(ex.drivers.length).toBe(6);
    for (const d of ex.drivers) {
      expect(Number.isFinite(d.z)).toBe(true);
      expect(d.share).toBeGreaterThanOrEqual(0);
    }
  });

  it("señal congelada: el driver queda marcado flat y la narrativa lo denuncia", () => {
    const flat = Array.from({ length: 120 }, (_, i) => mk(i, { pt: BASE.pt }));
    const ex = explainSamples(flat, LEVEL);
    const pt = ex.drivers.find((d) => d.key === "pt")!;
    expect(pt.flat).toBe(true);
    expect(pt.dir).toBe("plano");
    expect(ex.summary).toContain("congeladas");
    expect(ex.summary).toContain("PT-101");
    expect(pt.text).toContain("transmisor");
  });

  it("el choke es un setpoint: plano jamás se marca como sensor congelado", () => {
    const allFlat = Array.from({ length: 120 }, (_, i) => mk(i, {}));
    const ex = explainSamples(allFlat, LEVEL);
    expect(ex.drivers.find((d) => d.key === "choke")!.flat).toBe(false);
    expect(ex.drivers.find((d) => d.key === "pt")!.flat).toBe(true);
  });

  it("serie insuficiente (< 5 muestras): sin drivers y aviso explícito", () => {
    const ex = explainSamples(stableSeries().slice(0, 3), LEVEL);
    expect(ex.drivers).toHaveLength(0);
    expect(ex.summary).toContain("insuficiente");
  });

  it("determinismo: mismas entradas producen la misma descomposición byte a byte", () => {
    const a = explainSamples(decliningPt(), LEVEL);
    const b = explainSamples(decliningPt(), LEVEL);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("ventana configurable: windowMin se refleja en el resultado", () => {
    const ex = explainSamples(stableSeries(180), { score: 8, level: "ÓPTIMO" }, 60);
    expect(ex.windowMin).toBe(60);
    expect(ex.drivers.length).toBe(6);
  });

  it("el texto de cada driver incluye tag, valor, unidad y dirección legible", () => {
    const ex = explainSamples(decliningPt(), LEVEL);
    for (const d of ex.drivers) {
      expect(d.text).toContain(d.tag);
      expect(d.text).toContain(d.unit);
      expect(["sube", "baja", "plano"]).toContain(d.dir);
    }
    const pt: Driver = ex.drivers.find((d) => d.key === "pt")!;
    expect(pt.text).toMatch(/cayendo/);
  });
});
