import { describe, it, expect } from "vitest";
import type { Sample } from "../src/lib/sim";
import { nodalAnalysis, requiredUpstream, beanForward } from "../src/lib/nodal";
import { effectiveDia } from "../src/lib/virtualMeter";

const BASE = { pt: 560, pc: 780, pl: 430, temp: 44, q: 2250, choke: 54 };

/** Serie con IPR lineal conocido: pt = 620 − 0.05·(q − 2000). */
function seriesIPR(n = 240, a = 0.05, pt0 = 620, q0 = 2000): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const q = q0 + Math.sin(i / 7) * 300 + (i % 13) * 2; // excitación de caudal
    out.push({
      m: i,
      pt: pt0 - a * (q - q0),
      pc: 780,
      pl: 430,
      temp: 44,
      q,
      choke: 54,
    });
  }
  return out;
}

describe("nodal — inversa de Bean", () => {
  it("requiredUpstream reproduce la presión aguas arriba en flujo crítico", () => {
    const p1 = 900; // psia
    const tempC = 44;
    const sg = 0.68;
    const d = effectiveDia(0.75, 50); // 0.75" a 50 %
    const q = beanForward(p1, tempC, sg, d) * 0.82; // Cd 0.82
    const inv = requiredUpstream(q, 300, tempC, 0.75, 50, 0.82, sg);
    expect(inv).toBeCloseTo(p1, 4);
  });

  it("en flujo subcrítico la inversa también coincide con la directa", () => {
    const p2 = 700; // psia — alta (subcrítico con p1 ~ 900)
    const p1 = 900;
    const tempC = 44;
    const sg = 0.68;
    const d = effectiveDia(1.0, 60);
    const r = p2 / p1; // 0.78 > 0.7 → subcrítico
    const sub = Math.sqrt(Math.max(0, 1 - Math.pow((r - 0.7) / 0.3, 2)));
    const q = 0.82 * beanForward(p1, tempC, sg, d) * sub;
    const inv = requiredUpstream(q, p2, tempC, 1.0, 60, 0.82, sg);
    expect(inv).toBeCloseTo(p1, 3);
  });

  it("con caudal nulo exige la presión de línea", () => {
    expect(requiredUpstream(0, 444.7, 44, 0.75, 50, 0.82, 0.68)).toBeCloseTo(444.7, 6);
  });
});

describe("nodal — análisis", () => {
  it("recupera la pendiente del IPR y produce un punto de operación coherente", () => {
    const s = seriesIPR();
    const r = nodalAnalysis(s, BASE);
    expect(r.feasible).toBe(true);
    expect(r.aSlope).toBeGreaterThan(0.04);
    expect(r.aSlope).toBeLessThan(0.06);
    expect(r.r2).toBeGreaterThan(0.95);
    // punto de operación: finito, positivo
    expect(r.qOp).toBeGreaterThan(0);
    expect(r.ptOp).toBeGreaterThan(0);
    // curvas monótonas: IPR decreciente
    expect(r.ipr[0].pt).toBeGreaterThan(r.ipr[r.ipr.length - 1].pt);
    // VLP creciente
    expect(r.vlp[r.vlp.length - 1].pt).toBeGreaterThan(r.vlp[0].pt);
  });

  it("el punto de operación está cerca del punto medido actual (Cd calibrado)", () => {
    const s = seriesIPR();
    const r = nodalAnalysis(s, BASE);
    const last = s[s.length - 1];
    expect(r.current.q).toBeCloseTo(last.q, 6);
    // el VLP calibrado pasa por el punto actual: vlp(q_actual) ≈ pt_actual
    const near = r.vlp.reduce((best, p) =>
      Math.abs(p.q - last.q) < Math.abs(best.q - last.q) ? p : best,
    );
    expect(near.pt).toBeCloseTo(last.pt, -1.4); // tolerancia de malla (~3 %)
  });

  it("reporta la ventana operativa Turner/erosión ordenada", () => {
    const s = seriesIPR();
    const r = nodalAnalysis(s, BASE);
    expect(r.turnerQ).not.toBeNull();
    expect(r.erosionQ).not.toBeNull();
    expect(r.erosionQ!).toBeGreaterThan(r.turnerQ!);
  });

  it("rechaza ventanas insuficientes con razón explícita", () => {
    const r = nodalAnalysis(seriesIPR(30), BASE);
    expect(r.feasible).toBe(false);
    expect(r.reason).toMatch(/ventana insuficiente/);
  });

  it("con un pozo que no puede vencer la línea, declara no cruce", () => {
    // aporte plano muy bajo: pt ~ 100 psig con línea a 430 psig
    const s = seriesIPR(240, 0.001, 100, 500);
    const r = nodalAnalysis(s, { ...BASE, pl: 430 });
    expect(r.feasible).toBe(false);
  });
});
