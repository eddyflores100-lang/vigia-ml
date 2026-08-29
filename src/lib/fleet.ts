// ---------------------------------------------------------------------------
// VIGÍA ML · comparativa de flota (vista multi-pozo)
// Reduce cada pozo a una fila comparable: estado, score de anomalía, caudal
// actual, tendencia de caudal a 1 h y la hipótesis de diagnóstico principal.
// Función pura — testeada en tests/fleet.test.ts.
// ---------------------------------------------------------------------------

import { diagnose } from "./models";
import type { WellSim } from "./sim";

export interface FleetRow {
  id: string;
  name: string;
  level: string;
  score: number;
  q: number; // caudal actual (Mscf/d)
  qTrendPct: number; // % vs hace ~60 min
  pt: number; // P tubing actual (psi)
  topDiag: string; // hipótesis principal
  topDiagId: string; // id de la hipótesis ("normal" → verde)
  topDiagConf: number;
}

export function fleetCompare(wells: WellSim[]): FleetRow[] {
  return wells
    .map((w) => {
      const buf = w.buf;
      const now = buf[buf.length - 1];
      const past = buf[Math.max(0, buf.length - 61)];
      const qTrendPct = past && past.q > 1 ? (now.q / past.q - 1) * 100 : 0;
      const top = diagnose(buf.slice(-160))[0];
      return {
        id: w.id,
        name: w.name,
        level: w.level,
        score: w.score,
        q: now.q,
        qTrendPct,
        pt: now.pt,
        topDiag: top?.name ?? "—",
        topDiagId: top?.id ?? "",
        topDiagConf: top?.conf ?? 0,
      };
    })
    .sort((a, b) => b.score - a.score);
}
