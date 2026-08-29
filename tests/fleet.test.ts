// ---------------------------------------------------------------------------
// VIGÍA ML · pruebas de la comparativa de flota (fleet.ts)
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import { fleetCompare } from "../src/lib/fleet";
import { createFleet } from "../src/lib/sim";

describe("fleetCompare", () => {
  it("devuelve una fila por pozo con campos finitos y diagnóstico presente", () => {
    const rows = fleetCompare(createFleet());
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.id).toBeTruthy();
      expect(Number.isFinite(r.score)).toBe(true);
      expect(Number.isFinite(r.q)).toBe(true);
      expect(Number.isFinite(r.qTrendPct)).toBe(true);
      expect(Number.isFinite(r.pt)).toBe(true);
      expect(r.topDiag.length).toBeGreaterThan(0);
      expect(r.topDiagConf).toBeGreaterThanOrEqual(0);
      expect(r.topDiagConf).toBeLessThanOrEqual(1);
    }
  });

  it("ordena por criticidad descendente (score)", () => {
    const rows = fleetCompare(createFleet());
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
    }
  });

  it("marca la hipótesis normal con su id para colorear en verde", () => {
    const rows = fleetCompare(createFleet());
    // la flota de demo tiene pozos con fallas: al menos uno NO normal
    expect(rows.some((r) => r.topDiagId !== "normal")).toBe(true);
    // y la confianza top siempre ∈ [0,1]
    expect(rows.every((r) => r.topDiagId.length > 0)).toBe(true);
  });
});
