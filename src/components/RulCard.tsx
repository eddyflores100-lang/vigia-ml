import { useMemo } from "react";
import { rulForDiag } from "../lib/rul";
import type { RulResult } from "../lib/rul";
import type { Hypothesis } from "../lib/models";
import type { Sample, VarKey } from "../lib/sim";
import { SectionHead } from "./bits";

const fmt = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec }) : "—";

/** Horas legibles: "≈ 34 h" / "≈ 3,2 d" cuando supera 72 h. */
function fmtHours(h: number): string {
  if (!Number.isFinite(h)) return "—";
  if (h >= 72) return `≈ ${fmt(h / 24, 1)} d`;
  return `≈ ${fmt(h)} h`;
}

const MODE_LABEL: Record<string, string> = {
  "liquid-loading": "Carga de líquidos",
  restriction: "Restricción en línea",
  "control-issue": "Actuador de choke",
  normal: "Integridad general",
  "casing-leak": "Fuga en anular",
  "tubing-leak": "Fuga en tubing",
  hydrates: "Hidratos",
  sanding: "Producción de arena",
};
const modeLabel = (id: string) =>
  MODE_LABEL[id] ?? (id.startsWith("sensor-") || id.startsWith("spike-")
    ? `Instrumentación (${id.split("-")[1]?.toUpperCase() ?? "?"})`
    : id);

const RUL_COLOR = "#f08a6c"; // ámbar de degradación

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

/** Barra de supervivencia S(t) con marcador de edad del episodio. */
function SurvBar({ r }: { r: RulResult }) {
  const W = 260;
  const H = 54;
  const eta = r.etaEff;
  const tMax = Math.max(eta * 1.6, r.ageH * 1.25, 1);
  const pts: string[] = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const t = (tMax * i) / steps;
    const s = Math.exp(-Math.pow(t / eta, r.beta));
    pts.push(`${i === 0 ? "M" : "L"} ${((W * i) / steps).toFixed(1)} ${(H - s * (H - 6) - 2).toFixed(1)}`);
  }
  const ageX = Math.min(W, (r.ageH / tMax) * W);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2.5" role="img"
      aria-label={`Curva de supervivencia Weibull del modo ${modeLabel(r.mode)}`}>
      <path d={pts.join(" ")} fill="none" stroke={RUL_COLOR} strokeWidth="1.6" opacity="0.9" />
      {/* p10–p90 de la RUL restante */}
      <rect x={((r.ageH + r.p10) / tMax) * W} y="2" width={Math.max(2, ((r.p90 - r.p10) / tMax) * W)} height={H - 4}
        fill={RUL_COLOR} opacity="0.12" />
      <line x1={ageX} y1="0" x2={ageX} y2={H} stroke="#5f7a82" strokeWidth="1" strokeDasharray="2 3" />
      <text x={Math.min(W - 2, ageX + 4)} y="10" fontSize="7.5" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace">
        AHORA
      </text>
      <text x={W} y={H - 1} fontSize="7" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace" textAnchor="end" letterSpacing="1">
        S(t) · η_ef {fmt(eta)} h
      </text>
    </svg>
  );
}

/**
 * Tarjeta RUL: vida útil restante estimada con Weibull + aceleración AFT
 * para el diagnóstico activo del pozo. "Falla en ~X horas" con rango p10–p90.
 */
export function RulCard({
  diag,
  samples,
  base,
  anomScore,
}: {
  diag: Hypothesis[];
  samples: Sample[];
  base: Record<VarKey, number>;
  anomScore: number;
}) {
  const r = useMemo(() => {
    const top = diag.find((d) => d.id !== "normal") ?? diag[diag.length - 1] ?? { id: "normal", conf: 0 };
    return rulForDiag(top.id, top.conf, samples, base, anomScore);
  }, [diag, samples, base, anomScore]);

  const active = r.mode !== "normal";

  return (
    <div className="panel corners p-3.5 flex-1 min-w-[280px] rise" style={{ animationDelay: "200ms" }}>
      <SectionHead
        level="RUL"
        title="Vida útil restante estimada"
        accent={RUL_COLOR}
        right={
          <span
            className="font-mono text-[8px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
            style={{
              color: active ? RUL_COLOR : "#5f7a82",
              borderColor: active ? `${RUL_COLOR}55` : "#5f7a8244",
              background: active ? `${RUL_COLOR}0f` : "transparent",
            }}
          >
            {active ? modeLabel(r.mode).toUpperCase() : "SIN EPISODIO ACTIVO"}
          </span>
        }
      />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Metric label="Falla estimada en" value={fmtHours(r.rulMedian)} accent={RUL_COLOR} />
        <Metric label="Rango p10–p90" value={`${fmtHours(r.p10)} – ${fmtHours(r.p90)}`} />
        <Metric label="Supervivencia actual" value={`${fmt(r.survNow * 100, 1)}`} unit="%" />
        <Metric label="Edad del episodio" value={fmt(r.ageH, 1)} unit="h" />
        <Metric label="η_ef / β" value={`${fmt(r.etaEff)} / ${fmt(r.beta, 1)}`} unit="h" />
      </div>

      <SurvBar r={r} />

      <p className="mt-2 text-[10px] text-fg3 leading-relaxed font-mono">
        WEIBULL + AFT (SEVERIDAD → η_ef) · PRIORS DE LITERATURA · EN PRODUCCIÓN SE RE-AJUSTA
        POR MLE CON EL HISTORIAL DE FALLAS DEL ACTIVO
      </p>
    </div>
  );
}
