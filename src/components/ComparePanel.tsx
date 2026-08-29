// ---------------------------------------------------------------------------
// VIGÍA ML · panel de comparativa de flota (multi-pozo)
// Fila por pozo ordenada por criticidad: chip de estado, barra de score,
// caudal, tendencia a 1 h y diagnóstico principal. Clic en fila = seleccionar.
// ---------------------------------------------------------------------------
import type { FleetRow } from "../lib/fleet";
import { StatusChip } from "./bits";

const tone = (badness: number) =>
  badness >= 0.5 ? "text-crit" : badness >= 0.2 ? "text-watch" : "text-ok";

const scoreBar = (score: number) =>
  score >= 80 ? "bg-crit" : score >= 55 ? "bg-alert" : score >= 25 ? "bg-watch" : "bg-ok";

export function ComparePanel({
  rows,
  selId,
  onSelect,
}: {
  rows: FleetRow[];
  selId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="panel corners p-3.5 rise" data-component="fleet-compare">
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="font-mono text-[10px] tracking-[0.14em] text-fg3">
          COMPARATIVA DE FLOTA · {rows.length} POZOS · ORDEN POR CRITICIDAD
        </h2>
        <span className="font-mono text-[9px] text-fg3 hidden sm:inline">
          clic en fila para seleccionar
        </span>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full border-collapse min-w-[560px]">
          <thead>
            <tr className="font-mono text-[9px] tracking-[0.1em] text-fg3 text-left">
              <th className="py-1.5 px-2 font-normal">POZO</th>
              <th className="py-1.5 px-2 font-normal">ESTADO</th>
              <th className="py-1.5 px-2 font-normal">SCORE</th>
              <th className="py-1.5 px-2 font-normal text-right">Q AHORA</th>
              <th className="py-1.5 px-2 font-normal text-right">ΔQ 1H</th>
              <th className="py-1.5 px-2 font-normal">HIPÓTESIS PRINCIPAL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`cursor-pointer border-t border-line/60 transition-colors hover:bg-white/[0.04] ${
                  r.id === selId ? "bg-ok/[0.06]" : ""
                }`}
              >
                <td className="py-2 px-2">
                  <span className="font-mono text-[12px] font-semibold text-fg">{r.id}</span>
                  <span className="hidden md:inline text-[10px] text-fg3 ml-2">{r.name}</span>
                </td>
                <td className="py-2 px-2">
                  <StatusChip status={r.level} />
                </td>
                <td className="py-2 px-2 w-[130px]">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-[70px] bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreBar(r.score)}`}
                        style={{ width: `${Math.max(4, r.score)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-fg2">{r.score}</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-right font-mono text-[11px] text-fg2">
                  {Math.round(r.q).toLocaleString("es")}
                </td>
                <td className={`py-2 px-2 text-right font-mono text-[11px] ${tone(Math.max(0, -r.qTrendPct) / 5)}`}>
                  {r.qTrendPct >= 0 ? "+" : ""}
                  {r.qTrendPct.toFixed(1)}%
                </td>
                <td className="py-2 px-2">
                  <span className="text-[11px] text-fg2">{r.topDiag}</span>
                  <span
                    className={`font-mono text-[9px] ml-2 ${
                      r.topDiagId === "normal" ? "text-ok" : tone(r.topDiagConf)
                    }`}
                  >
                    {(r.topDiagConf * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
