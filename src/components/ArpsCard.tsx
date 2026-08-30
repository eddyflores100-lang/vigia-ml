import { useMemo } from "react";
import { fitArps, arpsSeries, monthlyDeclinePct } from "../lib/arps";
import type { ArpsFit } from "../lib/arps";
import { dailyHistory } from "../lib/wellHistory";
import { VAR_META } from "../lib/sim";
import { SectionHead } from "./bits";

// ------------------------- utilidades de formato ----------------------------
const fmt = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec }) : "—";

// ------------------------------ métrica suelta ------------------------------
function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="min-w-[86px]">
      <div className="font-mono text-[8.5px] tracking-[0.14em] text-fg3 uppercase">{label}</div>
      <div className="font-mono text-[15px] font-semibold tabular-nums leading-tight" style={{ color: accent ?? "var(--color-fg)" }}>
        {value}
        {unit && <span className="text-[9px] font-normal text-fg3 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

const MODEL_COLOR: Record<string, string> = {
  exponencial: "#7fb4e6",
  "hiperbólica": "#4bd1b4",
  "armónica": "#c9b8f0",
};

/**
 * Tarjeta DCA: ajuste Arps sobre el histórico de producción diaria del pozo
 * (capa demo determinista o serie real llegada por el puente OPC-UA) y
 * pronóstico a 6 meses con EUR.
 */
export function ArpsCard({ wellId, baseQ, daily }: { wellId: string; baseQ: number; daily?: { t: number[]; q: number[] } | null }) {
  const { hist, fit } = useMemo(() => {
    const h = daily ?? dailyHistory(wellId, baseQ, 240);
    return { hist: h, fit: fitArps(h.t, h.q) };
  }, [wellId, baseQ, daily]);

  const chart = useMemo(() => {
    if (!fit.feasible) return null;
    const tEnd = hist.t[hist.t.length - 1];
    const s = arpsSeries(fit, 0, tEnd + 182, 5); // ajuste + 6 meses de pronóstico
    const allQ = [...hist.q, ...s.q];
    const min = Math.min(...allQ);
    const max = Math.max(...allQ);
    const W = 560;
    const H = 110;
    const x = (t: number) => (t / (tEnd + 182)) * W;
    const y = (v: number) => H - ((v - min) / Math.max(1e-9, max - min)) * (H - 8) - 4;
    const pathOf = (ts: number[], qs: number[]) =>
      ts.map((t, i) => `${i === 0 ? "M" : "L"} ${x(t).toFixed(1)} ${y(qs[i]).toFixed(1)}`).join(" ");
    const fc = s.t.filter((t) => t >= tEnd);
    const fcIdx = s.t.findIndex((t) => t >= tEnd);
    return {
      W,
      H,
      histPath: pathOf(hist.t, hist.q),
      fitPath: pathOf(s.t.slice(0, fcIdx + 1), s.q.slice(0, fcIdx + 1)),
      fcPath: fc.length > 1 ? pathOf(s.t.slice(fcIdx), s.q.slice(fcIdx)) : "",
      nowX: x(tEnd),
    };
  }, [fit, hist]);

  const color = MODEL_COLOR[fit.model] ?? "#4bd1b4";
  const diMes = monthlyDeclinePct(fit);
  const eurMM = fit.eur / 1000; // Mscf → MMscf

  return (
    <div className="panel corners p-3.5 rise" style={{ animationDelay: "160ms" }}>
      <SectionHead
        level="DCA"
        title="Declinación de producción · Arps"
        accent={VAR_META.q.color}
        right={
          <span
            className="font-mono text-[8px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
            style={{ color: color, borderColor: `${color}55`, background: `${color}0f` }}
          >
            {fit.feasible ? fit.model.toUpperCase() : "SIN AJUSTE"}
          </span>
        }
      />

      {!fit.feasible ? (
        <p className="text-[11px] text-fg3 leading-relaxed">
          No se identificó declinación ajustable en la serie disponible ({fit.n} puntos): {fit.reason}. El
          pronóstico operacional sigue a cargo de las capas N1–N4.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <Metric label="qi inicial" value={fmt(fit.qi)} unit="Mscf/d" accent={color} />
            <Metric label="Di efectiva" value={`${fmt(diMes, 1)}`} unit="%/mes" />
            <Metric label="b" value={fmt(fit.b, 2)} />
            <Metric label="EUR a abandono" value={fmt(eurMM, 1)} unit="MMscf" accent={color} />
            <Metric label="EUR 5 años" value={fmt(fit.eur5y / 1000, 1)} unit="MMscf" />
            <Metric label="R² ajuste" value={fmt(fit.r2, 3)} />
          </div>

          {chart && (
            <svg viewBox={`0 0 ${chart.W} ${chart.H + 16}`} className="w-full mt-3" role="img"
              aria-label={`Curva de declinación ${fit.model} ajustada al histórico diario del pozo ${wellId}`}>
              {/* histórico diario */}
              <path d={chart.histPath} fill="none" stroke={VAR_META.q.color} strokeWidth="1.4" opacity="0.9" />
              {/* curva de Arps ajustada */}
              <path d={chart.fitPath} fill="none" stroke={color} strokeWidth="1.6" strokeDasharray="1 0" opacity="0.95" />
              {/* pronóstico 6 meses */}
              <path d={chart.fcPath} fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.7" />
              <line x1={chart.nowX} y1="0" x2={chart.nowX} y2={chart.H} stroke="#5f7a82" strokeWidth="1" strokeDasharray="2 3" />
              <text x={chart.nowX + 5} y="10" fontSize="8" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace">
                HOY
              </text>
              <text x="0" y={chart.H + 12} fontSize="8" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.5">
                HISTÓRICO 240 D
              </text>
              <text x={chart.W} y={chart.H + 12} fontSize="8" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace" letterSpacing="1.5" textAnchor="end">
                PRONÓSTICO +6 MESES
              </text>
            </svg>
          )}

          <p className="mt-2 text-[10px] text-fg3 leading-relaxed font-mono">
            ABANDONO AL 5% DE qi · rmse {fmt(fit.rmse, 1)} Mscf/d · SERIE DIARIA{" "}
            {daily ? "REAL (PUENTE OPC-UA)" : "DEMO DETERMINISTA"} ·{" "}
            <Aviso />
          </p>
        </>
      )}
    </div>
  );
}

function Aviso() {
  return (
    <span title="El histórico demo está generado con una declinación conocida embebida; en producción, la serie llega del puente OPC-UA.">
      VER bridge/README
    </span>
  );
}

export type { ArpsFit };
