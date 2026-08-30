import type { ExplainResult, Driver } from "../lib/explain";
import { SectionHead } from "./bits";

const EX_COLOR = "#c9b8f0"; // violeta de análisis
const DIR_ICON: Record<Driver["dir"], string> = { sube: "▲", baja: "▼", plano: "■" };
const DIR_COLOR: Record<Driver["dir"], string> = {
  sube: "#f2873d",
  baja: "#4bd1b4",
  plano: "#5f7a82",
};

function fmt(v: number, dec = 0) {
  return Number.isFinite(v)
    ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec })
    : "—";
}

/**
 * Tarjeta de explicabilidad (roadmap #7): descompone el índice de anomalía en
 * aportes por variable — responde «¿el modelo mira P·tubing porque…?» con
 * barras de aporte, dirección de movimiento y frases en lenguaje operativo.
 */
export function ExplainCard({ ex }: { ex: ExplainResult }) {
  const top = ex.drivers.slice(0, 4);
  return (
    <div className="panel corners p-3.5 rise" style={{ animationDelay: "120ms" }}>
      <SectionHead
        level="EXPLAIN"
        title="Explicabilidad del índice"
        accent={EX_COLOR}
        right={
          <span className="font-mono text-[8px] tracking-[0.14em] text-fg3">
            VENTANA {ex.windowMin} MIN · {top.length} DRIVERS
          </span>
        }
      />

      <p className="text-[12px] text-fg leading-relaxed mb-3">{ex.summary}</p>

      <div className="flex flex-col gap-2">
        {top.map((d) => (
          <div key={d.key} className="flex items-center gap-3">
            <div className="w-[92px] shrink-0">
              <div className="font-mono text-[10px] font-semibold text-fg">{d.tag}</div>
              <div className="font-mono text-[8.5px] text-fg3 uppercase tracking-[0.08em]">{d.label}</div>
            </div>
            <div className="flex-1 h-[14px] bg-black/25 border border-line/60 overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(1.5, d.share))}%`,
                  background: d.flat ? "#f26d5f" : EX_COLOR,
                  opacity: d.flat ? 0.85 : 0.28 + 0.6 * Math.min(1, d.share / 45),
                }}
                role="img"
                aria-label={`${d.tag} aporta ${fmt(d.share)} por ciento del índice de anomalía`}
              />
            </div>
            <div className="w-[52px] shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums" style={{ color: d.flat ? "#f26d5f" : EX_COLOR }}>
              {fmt(d.share)} %
            </div>
            <div className="w-[74px] shrink-0 text-right font-mono text-[9px] tabular-nums" style={{ color: DIR_COLOR[d.dir] }}>
              {DIR_ICON[d.dir]} {d.dir !== "plano" ? `${d.trend >= 0 ? "+" : ""}${fmt(d.trend, 1)}` : "estable"}
            </div>
          </div>
        ))}
      </div>

      {top[0] && (
        <p className="mt-3 text-[10.5px] text-fg2 leading-relaxed border-l-2 pl-2.5" style={{ borderColor: `${EX_COLOR}55` }}>
          {top[0].text}
        </p>
      )}
    </div>
  );
}
