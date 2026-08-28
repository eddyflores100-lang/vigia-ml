import { useEffect, useMemo, useRef, useState } from "react";
import { holtForecast } from "../lib/models";
import { VAR_META, VAR_KEYS, fmtClock } from "../lib/sim";
import type { Sample, VarKey } from "../lib/sim";
import type { VigiaEngine, MlForecast } from "../lib/ml/engine";
import { EngineChip, SectionHead } from "./bits";

const VB_W = 880;
const VB_H = 292;
const PAD_L = 54;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 30;
const PLOT_W = VB_W - PAD_L - PAD_R;
const PLOT_H = VB_H - PAD_T - PAD_B;

interface Hover {
  kind: "hist" | "fc";
  idx: number;
  m: number;
  x: number;
  y: number;
}

export function ForecastChart({
  samples,
  varKey,
  onVarKey,
  horizon,
  onHorizon,
  thrLow,
  base,
  engine,
  engineReady,
}: {
  samples: Sample[];
  varKey: VarKey;
  onVarKey: (k: VarKey) => void;
  horizon: number;
  onHorizon: (h: number) => void;
  thrLow?: number;
  base: Record<VarKey, number>;
  engine: VigiaEngine | null;
  engineReady: boolean;
}) {
  const meta = VAR_META[varKey];
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [ml, setMl] = useState<MlForecast | null>(null);

  // pronóstico LSTM en vivo (rollover asíncrono, no bloquea el render)
  useEffect(() => {
    if (!engineReady || !engine) {
      setMl(null);
      return;
    }
    let alive = true;
    engine
      .forecastSeries(samples, base, horizon * 4)
      .then((f) => {
        if (alive) setMl(f);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [engine, engineReady, samples, base, horizon]);

  const model = useMemo(() => {
    const hist = samples.map((s) => s[varKey]);
    const steps = horizon * 4; // pasos de 15 min
    const mv = ml?.byVar[varKey];
    const useMl = !!mv && mv.mean.length >= steps;
    const fc = useMl
      ? { mean: mv!.mean.slice(0, steps), lo: mv!.lo.slice(0, steps), hi: mv!.hi.slice(0, steps) }
      : holtForecast(hist, steps, 15);
    const xMin = samples[0].m;
    const histEnd = samples[samples.length - 1].m;
    const xMax = histEnd + horizon * 60;

    let yMin = Infinity;
    let yMax = -Infinity;
    const consider = (v: number) => {
      if (v < yMin) yMin = v;
      if (v > yMax) yMax = v;
    };
    hist.forEach(consider);
    fc.lo.forEach(consider);
    fc.hi.forEach(consider);
    if (thrLow !== undefined) consider(thrLow);
    const padY = (yMax - yMin || 1) * 0.09;
    yMin -= padY;
    yMax += padY;

    const X = (m: number) => PAD_L + ((m - xMin) / (xMax - xMin)) * PLOT_W;
    const Y = (v: number) => PAD_T + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;

    const histPath = hist
      .map((v, i) => `${i === 0 ? "M" : "L"}${X(xMin + i).toFixed(1)},${Y(v).toFixed(1)}`)
      .join("");

    const fcPath =
      `M${X(histEnd).toFixed(1)},${Y(hist[hist.length - 1]).toFixed(1)}` +
      fc.mean.map((v, i) => `L${X(histEnd + (i + 1) * 15).toFixed(1)},${Y(v).toFixed(1)}`).join("");

    const bandPath =
      fc.hi.map((v, i) => `${i === 0 ? "M" : "L"}${X(histEnd + (i + 1) * 15).toFixed(1)},${Y(v).toFixed(1)}`).join("") +
      [...fc.lo]
        .reverse()
        .map((v, i) => `L${X(histEnd + (fc.lo.length - i) * 15).toFixed(1)},${Y(v).toFixed(1)}`)
        .join("") +
      "Z";

    const yTicks = [0, 1, 2, 3, 4].map((j) => yMin + (j * (yMax - yMin)) / 4);
    const xTicks = [0, 1, 2, 3, 4, 5].map((j) => xMin + (j * (xMax - xMin)) / 5);

    return { hist, fc, useMl, xMin, histEnd, xMax, yMin, yMax, X, Y, histPath, fcPath, bandPath, yTicks, xTicks };
  }, [samples, varKey, horizon, thrLow, ml]);

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * VB_W;
    const mRaw = model.xMin + ((fx - PAD_L) / PLOT_W) * (model.xMax - model.xMin);
    const m = Math.max(model.xMin, Math.min(model.xMax, mRaw));
    if (m <= model.histEnd) {
      const idx = Math.max(0, Math.min(model.hist.length - 1, Math.round(m - model.xMin)));
      setHover({
        kind: "hist",
        idx,
        m: model.xMin + idx,
        x: model.X(model.xMin + idx),
        y: model.Y(model.hist[idx]),
      });
    } else {
      const idx = Math.max(1, Math.min(model.fc.mean.length, Math.round((m - model.histEnd) / 15)));
      setHover({
        kind: "fc",
        idx,
        m: model.histEnd + idx * 15,
        x: model.X(model.histEnd + idx * 15),
        y: model.Y(model.fc.mean[idx - 1]),
      });
    }
  };

  const fmtY = (v: number) => (model.yMax - model.yMin < 12 ? v.toFixed(1) : v.toFixed(0));

  const hoverVal =
    hover?.kind === "hist"
      ? model.hist[hover.idx]
      : hover
        ? model.fc.mean[hover.idx - 1]
        : 0;
  const hoverCi =
    hover?.kind === "fc" ? model.fc.hi[hover.idx - 1] - model.fc.mean[hover.idx - 1] : null;

  const tooltipLeft = hover ? hover.x > VB_W - 190 : false;

  return (
    <div className="panel corners panel-glow p-3.5 rise" style={{ animationDelay: "180ms" }}>
      <SectionHead
        level="N1"
        title="Predicción de comportamiento"
        right={<EngineChip ml={model.useMl} />}
      />

      {/* controles */}
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <div className="flex flex-wrap gap-1">
          {VAR_KEYS.map((k) => {
            const active = k === varKey;
            const c = VAR_META[k].color;
            return (
              <button
                key={k}
                onClick={() => onVarKey(k)}
                className={`font-mono text-[10px] tracking-[0.08em] px-2 py-1 border transition-all duration-150 ${
                  active ? "font-semibold" : "text-fg3 border-line hover:text-fg2 hover:border-line2"
                }`}
                style={active ? { color: c, borderColor: `${c}66`, background: `${c}12` } : undefined}
              >
                {VAR_META[k].short}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="label-mono">horizonte</span>
          <div className="flex border border-line">
            {[6, 12, 24].map((h) => (
              <button
                key={h}
                onClick={() => onHorizon(h)}
                className={`font-mono text-[10px] px-2 py-1 transition-colors ${
                  h === horizon ? "bg-[#3fd0b61a] text-ok font-semibold" : "text-fg3 hover:text-fg2"
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* gráfico */}
      <div className="relative overflow-hidden">
        <div className="chart-sweep" />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full block select-none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* rejilla */}
          {model.yTicks.map((v, i) => (
            <g key={i}>
              <line x1={PAD_L} x2={VB_W - PAD_R} y1={model.Y(v)} y2={model.Y(v)} stroke="rgba(157,180,186,0.09)" strokeWidth="1" />
              <text x={PAD_L - 8} y={model.Y(v) + 3} textAnchor="end" fontSize="9.5" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace">
                {fmtY(v)}
              </text>
            </g>
          ))}
          {model.xTicks.map((m, i) => (
            <text key={i} x={model.X(m)} y={VB_H - 10} textAnchor="middle" fontSize="9.5" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace">
              {fmtClock(m)}
            </text>
          ))}

          {/* banda IC */}
          <path d={model.bandPath} fill="rgba(127,180,230,0.12)" stroke="none" />
          {/* umbral */}
          {thrLow !== undefined && (
            <g>
              <line
                x1={PAD_L} x2={VB_W - PAD_R}
                y1={model.Y(thrLow)} y2={model.Y(thrLow)}
                stroke="#f26d5f" strokeWidth="1" strokeDasharray="5 4" opacity="0.75"
              />
              <text x={VB_W - PAD_R - 2} y={model.Y(thrLow) - 5} textAnchor="end" fontSize="9" fill="#f26d5f" fontFamily="IBM Plex Mono, monospace">
                umbral {Math.round(thrLow)}
              </text>
            </g>
          )}
          {/* línea "ahora" */}
          <line
            x1={model.X(model.histEnd)} x2={model.X(model.histEnd)}
            y1={PAD_T} y2={PAD_T + PLOT_H}
            stroke="#3fd0b6" strokeWidth="1" strokeDasharray="2 4" opacity="0.55"
          />
          <text x={model.X(model.histEnd)} y={PAD_T - 6} textAnchor="middle" fontSize="8.5" fill="#3fd0b6" fontFamily="IBM Plex Mono, monospace" letterSpacing="2">
            AHORA
          </text>

          {/* historial + pronóstico */}
          <path d={model.histPath} fill="none" stroke={meta.color} strokeWidth="1.7" strokeLinejoin="round" />
          <path d={model.fcPath} fill="none" stroke="#7fb4e6" strokeWidth="1.7" strokeDasharray="6 4" strokeLinejoin="round" />

          {/* pulso en el borde vivo */}
          <circle cx={model.X(model.histEnd)} cy={model.Y(model.hist[model.hist.length - 1])} r="3" fill={meta.color} />
          <circle cx={model.X(model.histEnd)} cy={model.Y(model.hist[model.hist.length - 1])} r="6.5" fill="none" stroke={meta.color} opacity="0.35" />

          {/* crosshair */}
          {hover && (
            <g>
              <line x1={hover.x} x2={hover.x} y1={PAD_T} y2={PAD_T + PLOT_H} stroke="rgba(230,240,240,0.25)" strokeWidth="1" />
              <circle
                cx={hover.x} cy={hover.y} r="3.4"
                fill={hover.kind === "hist" ? meta.color : "#7fb4e6"}
                stroke="#0a1216" strokeWidth="1.5"
              />
              <g transform={`translate(${tooltipLeft ? hover.x - 172 : hover.x + 10}, ${Math.max(PAD_T + 4, Math.min(hover.y - 30, PAD_T + PLOT_H - 58))})`}>
                <rect width="162" height="52" fill="#0d171c" stroke="#29424d" strokeWidth="1" rx="2" />
                <text x="10" y="17" fontSize="9" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace">
                  {fmtClock(hover.m)} · {hover.kind === "hist" ? "TELEMETRÍA" : `PRONÓSTICO +${((hover.m - model.histEnd) / 60).toFixed(1)}h`}
                </text>
                <text x="10" y="36" fontSize="13" fontWeight="600" fill={hover.kind === "hist" ? meta.color : "#7fb4e6"} fontFamily="IBM Plex Mono, monospace">
                  {hoverVal.toFixed(meta.dec)} {meta.unit}
                </text>
                {hoverCi !== null && (
                  <text x="152" y="36" textAnchor="end" fontSize="9" fill="#5f7a82" fontFamily="IBM Plex Mono, monospace">
                    ±{hoverCi.toFixed(1)}
                  </text>
                )}
              </g>
            </g>
          )}
        </svg>
      </div>

      {/* leyenda */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 px-1">
        {(
          [
            { c: meta.color, t: `Historial ${meta.tag}`, dash: false },
            {
              c: "#7fb4e6",
              t: model.useMl ? "Pronóstico (LSTM · TensorFlow.js)" : "Pronóstico (Holt amortiguado)",
              dash: true,
            },
            { c: "rgba(127,180,230,0.35)", t: "IC 80%", swatch: true },
            ...(thrLow !== undefined ? [{ c: "#f26d5f", t: "Umbral operacional", dash: true }] : []),
          ] as { c: string; t: string; dash?: boolean; swatch?: boolean }[]
        ).map((l, i) => (
          <span key={i} className="flex items-center gap-1.5 font-mono text-[9.5px] text-fg3">
            {l.swatch ? (
              <span className="w-3.5 h-2.5" style={{ background: l.c }} />
            ) : (
              <span className="w-3.5 h-0 border-t-2" style={{ borderColor: l.c, borderStyle: l.dash ? "dashed" : "solid" }} />
            )}
            {l.t}
          </span>
        ))}
        <span className="ml-auto font-mono text-[9px] text-fg3">
          {model.useMl
            ? `LSTM 28u · rollout 6 pasos · paso 15 min`
            : `α=0.32 β=0.11 φ=0.93 · paso 15 min`}
        </span>
      </div>
    </div>
  );
}
