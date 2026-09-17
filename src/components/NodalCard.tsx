import { useMemo } from "react";
import { nodalAnalysis } from "../lib/nodal";
import type { NodalResult } from "../lib/nodal";
import type { Sample, VarKey } from "../lib/sim";
import { SectionHead } from "./bits";

const fmt = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec }) : "—";

const ACCENT = "#e5a06c"; // cobre de ingeniería de producción

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

/** Curvas IPR/VLP, punto de operación y ventana Turner–erosión. */
function NodalChart({ r }: { r: NodalResult }) {
  const W = 168;
  const H = 86;
  const qMax = Math.max(r.ipr[r.ipr.length - 1]?.q ?? 1, r.current.q * 1.1, 1);
  const ptMax = Math.max(
    ...r.ipr.map((p) => p.pt),
    ...r.vlp.map((p) => p.pt),
    r.current.pt,
    1,
  ) * 1.08;
  const px = (q: number) => 6 + (q / qMax) * (W - 12);
  const py = (pt: number) => H - 10 - (Math.max(0, pt) / ptMax) * (H - 18);
  const path = (pts: { q: number; pt: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.q).toFixed(1)},${py(p.pt).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[168px] shrink-0" role="img" aria-label="Curvas IPR y VLP con punto de operación">
      {/* rejilla */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="6" y1={(H - 10) * f + 4} x2={W - 6} y2={(H - 10) * f + 4} stroke="#2a3b42" strokeWidth="0.5" />
      ))}
      {/* ventana operativa Turner / erosión */}
      {r.turnerQ !== null && r.turnerQ < qMax && (
        <line x1={px(r.turnerQ)} y1={4} x2={px(r.turnerQ)} y2={H - 10} stroke="#f2b33d" strokeWidth="0.9" strokeDasharray="2.5 2.5" opacity="0.8" />
      )}
      {r.erosionQ !== null && r.erosionQ < qMax && (
        <line x1={px(r.erosionQ)} y1={4} x2={px(r.erosionQ)} y2={H - 10} stroke="#f26d5f" strokeWidth="0.9" strokeDasharray="2.5 2.5" opacity="0.8" />
      )}
      {/* curvas */}
      <path d={path(r.vlp)} fill="none" stroke="#7fb4e6" strokeWidth="1.6" />
      <path d={path(r.ipr)} fill="none" stroke={ACCENT} strokeWidth="1.6" />
      {/* punto de operación */}
      {r.feasible && (
        <>
          <circle cx={px(r.qOp)} cy={py(r.ptOp)} r="3.1" fill="#0a1216" stroke="#3fd0b6" strokeWidth="1.6" />
          <line x1={px(r.qOp)} y1={py(r.ptOp)} x2={px(r.qOp)} y2={H - 10} stroke="#3fd0b6" strokeWidth="0.6" strokeDasharray="1.5 1.5" opacity="0.6" />
          <line x1="6" y1={py(r.ptOp)} x2={px(r.qOp)} y2={py(r.ptOp)} stroke="#3fd0b6" strokeWidth="0.6" strokeDasharray="1.5 1.5" opacity="0.6" />
        </>
      )}
      {/* punto medido actual */}
      <circle cx={px(r.current.q)} cy={py(Math.max(0, r.current.pt))} r="2.2" fill="#f2f2f2" opacity="0.9" />
      <text x={W - 6} y={H - 1} fontSize="6.5" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace" textAnchor="end" letterSpacing="1">
        IPR · VLP · NODO CABEZAL
      </text>
    </svg>
  );
}

/**
 * Tarjeta de análisis nodal (v0.12): intersección del aporte del pozo (IPR
 * estimado por regresión pt~q) con la demanda del sistema de descarga (VLP
 * por inversa de Bean a la apertura actual), más la ventana operativa
 * Turner–API RP 14E.
 */
export function NodalCard({ samples, base }: { samples: Sample[]; base: Record<VarKey, number> }) {
  const r = useMemo(() => nodalAnalysis(samples, base), [samples, base]);

  if (!r.feasible) {
    return (
      <div className="panel corners p-3.5 flex-1 min-w-[300px] rise" style={{ animationDelay: "260ms" }}>
        <SectionHead level="NODAL" title="Análisis nodal · nodo de cabezal" accent={ACCENT} />
        <p className="text-[11px] text-fg3 leading-relaxed font-mono">ANÁLISIS NO DISPONIBLE — {r.reason?.toUpperCase()}</p>
        <p className="mt-1.5 text-[10px] text-fg3 leading-snug">
          El análisis requiere una ventana con historial suficiente de caudal y presión de tubing. Sin datos
          defendibles no se dibujan curvas.
        </p>
      </div>
    );
  }

  const gapQ = ((r.qOp - r.current.q) / Math.max(1, r.current.q)) * 100;

  return (
    <div className="panel corners p-3.5 flex-1 min-w-[300px] rise" style={{ animationDelay: "260ms" }}>
      <SectionHead
        level="NODAL"
        title="Análisis nodal · nodo de cabezal"
        accent={ACCENT}
        right={
          <span
            className="font-mono text-[8px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
            style={{
              color: r.windowOk ? "#3fd0b6" : "#f2b33d",
              borderColor: r.windowOk ? "#3fd0b655" : "#f2b33d55",
              background: r.windowOk ? "#3fd0b60f" : "#f2b33d0f",
            }}
          >
            {r.windowOk ? "DENTRO DE VENTANA" : "FUERA DE VENTANA"}
          </span>
        }
      />

      <div className="flex items-start gap-3.5">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2.5">
            <Metric label="Q operación" value={fmt(r.qOp)} unit="Mscf/d" accent="#3fd0b6" />
            <Metric label="P·nodo" value={fmt(r.ptOp)} unit="psig" />
            <Metric label="Vs. medido" value={`${gapQ >= 0 ? "+" : ""}${fmt(gapQ, 1)}`} unit="%" accent={Math.abs(gapQ) > 12 ? "#f2b33d" : undefined} />
            <Metric label="Aporte (a)" value={fmt(r.aSlope, 3)} unit="psi/Mscf" />
          </div>
          <p className="mt-2 text-[10px] text-fg2 leading-snug">
            El pozo opera a {fmt(r.current.q)} Mscf/d con el choke al {fmt(r.chokePct)} %; el punto natural de
            intersección IPR∩VLP está a {fmt(r.qOp)} Mscf/d.
            {!r.windowOk && " El punto cae fuera de la ventana Turner–erosión: revisar ascenso de líquidos o velocidad de erosión."}
          </p>
          <p className="mt-1 text-[9px] text-fg3 leading-relaxed font-mono">
            R² IPR {fmt(r.r2, 3)} · Cd {r.cd !== null ? fmt(r.cd, 2) : "0.82 (def)"} · TURNER MÍN{" "}
            {fmt(r.turnerQ ?? NaN)} · EROSIÓN MÁX {fmt(r.erosionQ ?? NaN)} Mscf/d
          </p>
        </div>
        <NodalChart r={r} />
      </div>
    </div>
  );
}
