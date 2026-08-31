import { useMemo } from "react";
import { calibrateTwin, twinGapRecent, twinRateAt } from "../lib/twin";
import type { TwinCalibration } from "../lib/twin";
import type { Sample } from "../lib/sim";
import { SectionHead } from "./bits";

const fmt = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec }) : "—";

const ACCENT = "#7fb4e6"; // azul de gemelo digital

const GRADE_COLOR: Record<string, string> = {
  A: "#3fd0b6",
  B: "#7fb4e6",
  C: "#f2b33d",
  D: "#f26d5f",
};

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="min-w-[74px]">
      <div className="font-mono text-[8.5px] tracking-[0.14em] text-fg3 uppercase">{label}</div>
      <div className="font-mono text-[15px] font-semibold tabular-nums leading-tight" style={{ color: accent ?? "var(--color-fg)" }}>
        {value}
        {unit && <span className="text-[9px] font-normal text-fg3 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

/** Dispersión medido vs gemelo (últimas ~72 muestras, línea y = x). */
function Scatter({ samples, cal }: { samples: Sample[]; cal: TwinCalibration }) {
  const W = 150;
  const H = 64;
  const pts = useMemo(() => {
    const win = samples.slice(-72);
    const arr: { m: number; t: number }[] = [];
    for (const s of win) {
      const t = twinRateAt(s.choke, cal);
      if (Number.isFinite(t) && t > 1) arr.push({ m: s.q, t });
    }
    if (arr.length === 0) return null;
    const lo = Math.min(...arr.flatMap((p) => [p.m, p.t]));
    const hi = Math.max(...arr.flatMap((p) => [p.m, p.t]));
    const span = hi - lo || 1;
    return {
      arr,
      px: (v: number) => 4 + ((v - lo) / span) * (W - 10),
      py: (v: number) => H - 4 - ((v - lo) / span) * (H - 10),
    };
  }, [samples, cal]);

  if (!pts) return null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[150px] shrink-0" role="img" aria-label="Dispersión caudal medido vs gemelo calibrado">
      <line x1="4" y1={H - 4} x2={W - 6} y2="4" stroke="#5f7a82" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.7" />
      {pts.arr.map((p, i) => (
        <circle key={i} cx={pts.px(p.m).toFixed(1)} cy={pts.py(p.t).toFixed(1)} r="1.7" fill={ACCENT} opacity="0.75" />
      ))}
      <text x={W - 6} y={H - 1} fontSize="6.5" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace" textAnchor="end" letterSpacing="1">
        MEDIDO vs GEMELO
      </text>
    </svg>
  );
}

/**
 * Tarjeta del gemelo digital calibrado (roadmap #8): ajusta la respuesta
 * determinista del pozo (q∝choke^k, drawdown de pt, ganancia de pc) sobre la
 * ventana reciente, reporta calidad (NRMSE ponderado) y la brecha actual.
 */
export function TwinCard({ samples }: { samples: Sample[] }) {
  const cal = useMemo(() => calibrateTwin(samples), [samples]);
  const gap = useMemo(() => (cal.feasible ? twinGapRecent(samples, cal) : null), [samples, cal]);

  if (!cal.feasible) {
    return (
      <div className="panel corners p-3.5 flex-1 min-w-[280px] rise" style={{ animationDelay: "240ms" }}>
        <SectionHead level="GEMELO" title="Calibración del gemelo digital" accent={ACCENT} />
        <p className="text-[11px] text-fg3 leading-relaxed font-mono">
          CALIBRACIÓN RECHAZADA — {cal.reason?.toUpperCase()}
        </p>
        <p className="mt-1.5 text-[10px] text-fg3 leading-snug">
          El gemelo solo se ajusta cuando el choke se movió lo suficiente en la ventana: sin excitación no hay
          sensibilidad observable, y reportar parámetros sería inventarlos.
        </p>
      </div>
    );
  }

  const gc = GRADE_COLOR[cal.grade] ?? ACCENT;
  const misaligned = gap?.misaligned ?? false;

  return (
    <div className="panel corners p-3.5 flex-1 min-w-[300px] rise" style={{ animationDelay: "240ms" }}>
      <SectionHead
        level="GEMELO"
        title="Calibración del gemelo digital"
        accent={ACCENT}
        right={
          <span
            className="font-mono text-[8px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
            style={{
              color: misaligned ? "#f26d5f" : gc,
              borderColor: misaligned ? "#f26d5f66" : `${gc}55`,
              background: misaligned ? "#f26d5f12" : `${gc}0f`,
            }}
          >
            {misaligned ? "DESALINEADO — RECALIBRAR" : `GRADO ${cal.grade}`}
          </span>
        }
      />

      <div className="flex items-start gap-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2.5">
            <Metric label="Calidad" value={fmt(cal.quality)} unit="/100" accent={gc} />
            <Metric label="k (choke)" value={fmt(cal.k, 2)} />
            <Metric label="a (drawdown)" value={fmt(cal.a, 3)} unit="psi/Mscf" />
            <Metric label="b (casing)" value={fmt(cal.b, 3)} unit="psi/Mscf" />
            <Metric
              label="Brecha actual"
              value={`${gap && gap.gapPct >= 0 ? "+" : ""}${fmt(gap?.gapPct ?? NaN, 1)}`}
              unit="%"
              accent={misaligned ? "#f26d5f" : undefined}
            />
          </div>
          <p className="mt-2 text-[10px] text-fg2 leading-snug">{cal.verdict}</p>
          <p className="mt-1 text-[9px] text-fg3 leading-relaxed font-mono">
            EXCITACIÓN {fmt(cal.chokeRange, 1)}% CHOKE · N={cal.n} · NRMSE q {fmt(cal.nrmseQ, 3)} / pt{" "}
            {fmt(cal.nrmsePt, 3)} / pc {fmt(cal.nrmsePc, 3)}
          </p>
        </div>
        <Scatter samples={samples} cal={cal} />
      </div>
    </div>
  );
}
