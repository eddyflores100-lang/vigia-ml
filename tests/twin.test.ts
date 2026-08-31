import { describe, it, expect } from "vitest";
import { createFleet } from "../src/lib/sim";
import type { Sample } from "../src/lib/sim";
import { calibrateTwin, twinRateAt, twinGapPct, twinGapRecent } from "../src/lib/twin";

/** Serie sintética con gemelo conocido: q ∝ choke^k, pt = pt0 − a·Δq, pc = pc0 + b·Δq. */
function syntheticSeries(opts: {
  k: number;
  a: number;
  b: number;
  q0: number;
  choke0: number;
  n?: number;
  noise?: number;
  seed?: number;
}): Sample[] {
  const { k, a, b, q0, choke0 } = opts;
  const n = opts.n ?? 240;
  const noise = opts.noise ?? 0;
  let s = opts.seed ?? 42;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out: Sample[] = [];
  let choke = choke0;
  for (let i = 0; i < n; i++) {
    // excitación: el operador mueve el choke cada ~40 min
    if (i % 40 === 20) choke = Math.min(95, Math.max(20, choke0 + (rnd() - 0.5) * 22));
    const c = choke + (rnd() - 0.5) * noise * 3;
    const q = q0 * Math.pow(c / choke0, k) * (1 + (rnd() - 0.5) * noise);
    const pt = 560 - a * (q - q0) * (1 + (rnd() - 0.5) * noise);
    const pc = 780 + b * (q - q0) * (1 + (rnd() - 0.5) * noise);
    out.push({
      m: i,
      pt,
      pc,
      pl: 430 + (rnd() - 0.5) * 2,
      temp: 44 + (rnd() - 0.5) * 0.6,
      q,
      choke: c,
    });
  }
  return out;
}

describe("twin — calibración", () => {
  it("recupera el exponente k de una serie sintética con poco ruido", () => {
    const series = syntheticSeries({ k: 0.85, a: 0.02, b: 0.015, q0: 2400, choke0: 55, noise: 0.008 });
    const cal = calibrateTwin(series);
    expect(cal.feasible).toBe(true);
    expect(cal.k).toBeGreaterThan(0.75);
    expect(cal.k).toBeLessThan(0.95);
    expect(cal.quality).toBeGreaterThan(60);
  });

  it("recupera pendientes a y b con el signo físico correcto", () => {
    const series = syntheticSeries({ k: 1.0, a: 0.04, b: 0.02, q0: 2400, choke0: 55, noise: 0.01 });
    const cal = calibrateTwin(series);
    expect(cal.feasible).toBe(true);
    expect(cal.a).toBeGreaterThan(0.015);
    expect(cal.b).toBeGreaterThan(0.005);
  });

  it("rechaza la calibración sin excitación (choke plano) en lugar de inventar parámetros", () => {
    const series = syntheticSeries({ k: 0.85, a: 0.02, b: 0.015, q0: 2400, choke0: 55, n: 240 });
    const flat = series.map((s) => ({ ...s, choke: 55 }));
    const cal = calibrateTwin(flat);
    expect(cal.feasible).toBe(false);
    expect(cal.reason).toContain("excitación");
  });

  it("rechaza ventanas cortas", () => {
    const series = syntheticSeries({ k: 0.85, a: 0.02, b: 0.015, q0: 2400, choke0: 55, n: 30 });
    const cal = calibrateTwin(series);
    expect(cal.feasible).toBe(false);
    expect(cal.reason).toContain("ventana");
  });

  it("twinRateAt es monótono en la apertura y pasa por qRef en chokeRef", () => {
    const series = syntheticSeries({ k: 0.9, a: 0.02, b: 0.015, q0: 2400, choke0: 55, noise: 0.006 });
    const cal = calibrateTwin(series);
    expect(cal.feasible).toBe(true);
    expect(twinRateAt(cal.refs.chokeRef, cal)).toBeCloseTo(cal.refs.qRef, 6);
    expect(twinRateAt(cal.refs.chokeRef + 10, cal)).toBeGreaterThan(twinRateAt(cal.refs.chokeRef, cal));
    expect(twinRateAt(cal.refs.chokeRef - 10, cal)).toBeLessThan(twinRateAt(cal.refs.chokeRef, cal));
  });

  it("la brecha es ~0 con datos limpios y se detecta una desalineación inyectada", () => {
    const series = syntheticSeries({ k: 0.9, a: 0.02, b: 0.015, q0: 2400, choke0: 55, noise: 0.006 });
    const cal = calibrateTwin(series);
    expect(cal.feasible).toBe(true);
    const gap = twinGapRecent(series, cal);
    expect(gap.misaligned).toBe(false);
    expect(Math.abs(gap.gapPct)).toBeLessThan(4);

    // deriva del medidor: el caudal real cae 10 % respecto al gemelo
    const drifted = series.map((s, i) => (i >= series.length - 30 ? { ...s, q: s.q * 0.9 } : s));
    const gap2 = twinGapRecent(drifted, cal, 30);
    expect(gap2.misaligned).toBe(true);
    expect(gap2.gapPct).toBeLessThan(-5);
  });

  it("twinGapPct sobre una muestra individual es coherente con la definición", () => {
    const series = syntheticSeries({ k: 1.0, a: 0.02, b: 0.015, q0: 2400, choke0: 55, noise: 0 });
    const cal = calibrateTwin(series);
    expect(cal.feasible).toBe(true);
    const s = series[100];
    const gap = twinGapPct(s, cal);
    expect(Number.isFinite(gap)).toBe(true);
    expect(Math.abs(gap)).toBeLessThan(1); // sin ruido el gemelo reproduce el dato
  });

  it("calidad alta con datos limpios y grades ordenados", () => {
    const clean = syntheticSeries({ k: 0.9, a: 0.02, b: 0.015, q0: 2400, choke0: 55, noise: 0.004 });
    const noisy = syntheticSeries({ k: 0.9, a: 0.02, b: 0.015, q0: 2400, choke0: 55, noise: 0.05, seed: 7 });
    const c1 = calibrateTwin(clean);
    const c2 = calibrateTwin(noisy);
    expect(c1.feasible && c2.feasible).toBe(true);
    expect(c1.quality).toBeGreaterThanOrEqual(c2.quality);
  });

  it("la calibración del pozo demo es determinista", () => {
    const fleet = createFleet();
    const w = fleet.find((x) => x.id === "GN-118")!;
    const a = calibrateTwin(w.buf);
    const b = calibrateTwin(w.buf);
    expect(a.feasible).toBe(b.feasible);
    if (a.feasible && b.feasible) {
      expect(a.k).toBe(b.k);
      expect(a.quality).toBe(b.quality);
    }
  });
});
