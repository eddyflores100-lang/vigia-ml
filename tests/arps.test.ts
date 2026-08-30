// ---------------------------------------------------------------------------
// VIGÍA ML · pruebas del análisis de declinación Arps (arps.ts)
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import { fitArps, arpsRate, arpsSeries, eurTo, monthlyDeclinePct, arpsModelOf } from "../src/lib/arps";
import { dailyHistory } from "../src/lib/wellHistory";

function synth(qi: number, Di: number, b: number, days: number, noisePct = 0): { t: number[]; q: number[] } {
  const t: number[] = [];
  const q: number[] = [];
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5; // −0.5 .. 0.5 determinista
  };
  for (let d = 0; d < days; d++) {
    t.push(d);
    q.push(arpsRate(d, qi, Di, b) * (1 + noisePct * rnd()));
  }
  return { t, q };
}

describe("fitArps — recuperación de parámetros", () => {
  it("recupera una declinación exponencial (b≈0)", () => {
    const { t, q } = synth(1000, 0.002, 0, 365, 0.01);
    const f = fitArps(t, q);
    expect(f.feasible).toBe(true);
    expect(f.model).toBe("exponencial");
    expect(Math.abs(f.qi - 1000) / 1000).toBeLessThan(0.03);
    expect(Math.abs(f.Di - 0.002) / 0.002).toBeLessThan(0.08);
    expect(f.r2).toBeGreaterThan(0.98);
  });

  it("recupera una declinación hiperbólica (b=0.5)", () => {
    const { t, q } = synth(800, 0.004, 0.5, 540, 0.015);
    const f = fitArps(t, q);
    expect(f.feasible).toBe(true);
    expect(f.b).toBeGreaterThan(0.35);
    expect(f.b).toBeLessThan(0.65);
    expect(Math.abs(f.Di - 0.004) / 0.004).toBeLessThan(0.15);
    expect(f.r2).toBeGreaterThan(0.95);
  });

  it("recupera una declinación armónica (b=1)", () => {
    const { t, q } = synth(600, 0.003, 1, 500, 0.015);
    const f = fitArps(t, q);
    expect(f.feasible).toBe(true);
    expect(f.b).toBeGreaterThan(0.75);
    expect(f.b).toBeLessThan(1.25);
    expect(f.model).toBe("armónica");
  });

  it("devuelve ajuste inviable con datos planos o insuficientes", () => {
    const flat = synth(500, 0, 0, 90); // sin declinación alguna
    const ff = fitArps(flat.t, flat.q);
    expect(ff.feasible).toBe(false);
    expect(ff.reason).toBeTruthy();

    const short = synth(500, 0.003, 0.5, 5);
    const fs = fitArps(short.t, short.q);
    expect(fs.feasible).toBe(false);

    expect(fitArps([], []).feasible).toBe(false);
  });

  it("sanea puntos no finitos y continua ajustando", () => {
    const { t, q } = synth(700, 0.0025, 0.4, 300);
    const qDirty = q.map((v, i) => (i % 37 === 0 ? NaN : v));
    const f = fitArps(t, qDirty);
    expect(f.feasible).toBe(true);
    expect(Math.abs(f.b - 0.4)).toBeLessThan(0.2);
  });

  it("admite tiempos no iniciados en cero y pasos no uniformes", () => {
    const { t, q } = synth(900, 0.002, 0.6, 400);
    const t2 = t.map((v) => v + 1000); // época arbitraria
    const t3 = t.filter((_, i) => i % 2 === 0); // paso doble
    const q3 = q.filter((_, i) => i % 2 === 0);
    const f1 = fitArps(t2, q);
    const f3 = fitArps(t3, q3);
    expect(f1.feasible).toBe(true);
    expect(f3.feasible).toBe(true);
    expect(Math.abs(f1.qi - f3.qi) / f1.qi).toBeLessThan(0.05);
  });
});

describe("fitArps — EUR e integrales", () => {
  it("EUR exponencial coincide con la forma cerrada (qi−qf)/Di", () => {
    const { t, q } = synth(1000, 0.002, 0, 730);
    const f = fitArps(t, q, { qAbandon: 50, maxYears: 30 });
    const expected = (f.qi - 50) / f.Di; // años: exp decae asintóticamente
    expect(Math.abs(f.eur - expected) / expected).toBeLessThan(0.02);
    expect(f.tAbandonDays).toBeGreaterThan(0);
  });

  it("los EUR parciales son positivos y crecientes (1y < 5y ≤ total)", () => {
    const { t, q } = synth(800, 0.003, 0.7, 365);
    const f = fitArps(t, q);
    expect(f.feasible).toBe(true);
    expect(f.eur1y).toBeGreaterThan(0);
    expect(f.eur5y).toBeGreaterThan(f.eur1y);
    expect(f.eur).toBeGreaterThanOrEqual(f.eur5y);
    // eur1y ≈ eurTo explícito
    const direct = eurTo(f.qi, f.Di, f.b, 365);
    expect(Math.abs(f.eur1y - direct) / direct).toBeLessThan(0.01);
  });

  it("declinación mensual efectiva coherente con el caudal a 30 días", () => {
    const { t, q } = synth(1000, 0.004, 0.3, 200);
    const f = fitArps(t, q);
    const pct = monthlyDeclinePct(f);
    const manual = ((f.qi - arpsRate(30, f.qi, f.Di, f.b)) / f.qi) * 100;
    expect(Math.abs(pct - manual)).toBeLessThan(0.01);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(30);
  });
});

describe("arpsSeries", () => {
  it("genera una serie monótonamente decreciente dentro del rango pedido", () => {
    const { t, q } = synth(1000, 0.003, 0.5, 180);
    const f = fitArps(t, q);
    const s = arpsSeries(f, 180, 545, 15);
    expect(s.t.length).toBeGreaterThan(2);
    expect(s.t[0]).toBe(180);
    expect(s.t[s.t.length - 1]).toBeCloseTo(545, 5);
    for (let i = 1; i < s.q.length; i++) expect(s.q[i]).toBeLessThan(s.q[i - 1]);
  });

  it("serie vacía con ajuste inviable o rango invertido", () => {
    expect(arpsSeries({ ...synth(100, 0.001, 0, 10), ...fitArps([1, 2], [1, 1]) }, 0, 30).q.length).toBe(0);
    const { t, q } = synth(1000, 0.003, 0.5, 180);
    const f = fitArps(t, q);
    expect(arpsSeries(f, 30, 10).q.length).toBe(0);
  });
});

describe("arpsModelOf y truth embebida del histórico demo", () => {
  it("clasifica modelos por exponente", () => {
    expect(arpsModelOf(0)).toBe("exponencial");
    expect(arpsModelOf(1)).toBe("armónica");
    expect(arpsModelOf(0.5)).toBe("hiperbólica");
  });

  it("el histórico demo es determinista y el fit recupera su declinación embebida", () => {
    const h1 = dailyHistory("PN-041", 9500, 240);
    const h2 = dailyHistory("PN-041", 9500, 240);
    expect(h1.q).toEqual(h2.q);
    expect(h1.t).toEqual(h2.t);

    const h3 = dailyHistory("CJ-112", 4200, 240);
    expect(h1.q).not.toEqual(h3.q); // distinto pozo → distinta serie

    for (const v of h1.q) expect(Number.isFinite(v) && v > 0).toBe(true);

    const f = fitArps(h1.t, h1.q);
    expect(f.feasible).toBe(true);
    expect(f.r2).toBeGreaterThan(0.75);
    expect(Math.abs(f.b - h1.truth.b)).toBeLessThan(0.45);
    // Di mensual embebida vs ajustada (caída relativa del caudal a 30 días)
    const diMAdj = 1 - arpsRate(30, f.qi, f.Di, f.b) / f.qi;
    const diMTrue = 1 - arpsRate(30, h1.truth.qi, h1.truth.Di, h1.truth.b) / h1.truth.qi;
    expect(Math.abs(diMAdj - diMTrue)).toBeLessThan(0.06);
  });
});
