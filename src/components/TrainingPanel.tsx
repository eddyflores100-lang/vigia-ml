import { useState } from "react";
import type { TrainState } from "../lib/ml/engine";
import { CLASSES, CLASS_ABBR, CLASS_SHORT } from "../lib/ml/dataGen";
import { IconChip, IconPlay, IconPulse, IconTarget, SectionHead, Sparkline } from "./bits";

const ACCENT = "#c9b8f0";

const PHASE_TEXT: Record<string, string> = {
  idle: "En espera",
  data: "Generando dataset sintético",
  forecast: "N1 · LSTM pronóstico",
  autoencoder: "N2 · Autoencoder anomalías",
  classifier: "N3 · Clasificador diagnóstico",
  ready: "Listo",
  error: "Error",
};

export function TrainingPanel({
  state,
  onRetrain,
  onCancel,
}: {
  state: TrainState;
  onRetrain: () => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const training = state.phase !== "ready" && state.phase !== "error" && state.phase !== "idle";
  const pct = Math.round(state.progress * 100);

  return (
    <div className="panel corners panel-glow p-3.5 rise" style={{ animationDelay: "400ms" }}>
      <SectionHead
        level="ML"
        title="Motor de aprendizaje"
        accent={ACCENT}
        right={
          <div className="flex items-center gap-1.5">
            <span
              className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-[2px] border"
              style={{
                color: state.phase === "error" ? "#f26d5f" : state.phase === "ready" ? "#3fd0b6" : ACCENT,
                borderColor:
                  state.phase === "error" ? "#f26d5f55" : state.phase === "ready" ? "#3fd0b655" : `${ACCENT}55`,
              }}
            >
              TENSORFLOW.JS · {state.backend.toUpperCase()}
            </span>
            {training && onCancel && (
              <button
                onClick={onCancel}
                className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-[2px] border border-line text-fg3 hover:text-crit hover:border-[#f26d5f66] transition-colors"
              >
                DETENER
              </button>
            )}
            <button
              onClick={() => setOpen((o) => !o)}
              className="font-mono text-[8.5px] tracking-[0.1em] px-1.5 py-[2px] border border-line text-fg3 hover:text-fg2 hover:border-line2 transition-colors"
            >
              {open ? "OCULTAR" : "VER MÉTRICAS"}
            </button>
          </div>
        }
      />

      {!open ? (
        <p className="text-[10px] text-fg3 font-mono tracking-[0.05em]">
          {state.phase === "ready"
            ? `3 MODELOS · ${state.dataset.wells} POZOS SINTÉTICOS · ${(state.elapsedMs / 1000).toFixed(1)} s DE ENTRENAMIENTO`
            : PHASE_TEXT[state.phase].toUpperCase()}
        </p>
      ) : state.phase === "error" ? (
        <div className="border border-[#f26d5f44] bg-[#f26d5f0a] p-2.5">
          <p className="text-[11px] text-fc leading-snug">
            No se pudo completar el entrenamiento: {state.error}
          </p>
          <button
            onClick={onRetrain}
            className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] px-2.5 py-1.5 border border-[#f26d5f66] text-crit hover:bg-[#f26d5f14] transition-colors"
          >
            <IconPlay size={11} />
            REINTENTAR
          </button>
        </div>
      ) : training ? (
        <div>
          {/* progreso global */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[11px] text-fg2">
              {state.label}
            </span>
            <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: ACCENT }}>
              {pct}%
            </span>
          </div>
          <div className="mt-1.5 h-[6px] bg-[#1b2e37] overflow-hidden">
            <span
              className="block h-full transition-all duration-300"
              style={{ width: `${pct}%`, background: `linear-gradient(90deg, #7fb4e6, ${ACCENT})` }}
            />
          </div>

          {/* métricas de época */}
          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { k: "ÉPOCA", v: state.epochs > 0 ? `${state.epoch}/${state.epochs}` : "—" },
              { k: "PÉRDIDA", v: state.loss > 0 ? state.loss.toFixed(4) : "—" },
              { k: "PÉRDIDA VAL.", v: state.valLoss > 0 ? state.valLoss.toFixed(4) : "—" },
              {
                k: "PRECISIÓN",
                v: state.phase === "classifier" && state.acc > 0 ? `${(state.acc * 100).toFixed(1)}%` : "—",
              },
            ].map((m) => (
              <div key={m.k} className="border border-line bg-[#0e1a20] px-2 py-1.5">
                <div className="label-mono !text-[7.5px]">{m.k}</div>
                <div className="font-mono text-[12px] text-fg tabular-nums mt-0.5">{m.v}</div>
              </div>
            ))}
          </div>

          {/* curva de pérdida en vivo */}
          {state.lossHist.length > 2 && (
            <div className="mt-2.5 flex items-center gap-3">
              <span className="label-mono !text-[7.5px] shrink-0">CURVA DE PÉRDIDA</span>
              <div className="flex-1 min-w-0">
                <Sparkline data={state.lossHist.slice(-60)} color={ACCENT} w={260} h={30} />
              </div>
            </div>
          )}

          <p className="mt-2 text-[9.5px] text-fg3 leading-snug">
            Los tres modelos entrenan ahora mismo en tu navegador con telemetría sintética (
            {state.dataset.wells} pozos). El bucle cede el control al navegador entre lote y
            lote, así que la consola sigue respondiendo; el pipeline estadístico cubre cada
            capa hasta que su modelo ML termina.
          </p>
        </div>
      ) : state.phase === "idle" && state.cards.length === 0 ? (
        <div className="border border-line bg-[#0e1a20] p-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10.5px] text-fg3 leading-snug">{state.label}</p>
          <button
            onClick={onRetrain}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] px-2.5 py-1.5 border transition-colors hover:bg-[#c9b8f014]"
            style={{ borderColor: `${ACCENT}66`, color: ACCENT }}
          >
            <IconPlay size={11} />
            ENTRENAR MODELOS
          </button>
        </div>
      ) : (
        <div>
          {/* tarjetas de modelo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {state.cards.map((c, i) => (
              <div key={i} className="border border-line bg-[#0e1a20] p-2.5">
                <div className="flex items-center gap-1.5">
                  <IconChip size={12} className="shrink-0 text-[#c9b8f0]" />
                  <span className="font-display font-semibold text-[11.5px] text-fg tracking-[0.06em]">
                    {c.name}
                  </span>
                </div>
                <p className="mt-1 text-[9px] text-fg3 leading-snug font-mono">{c.kind}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-fg2 tabular-nums">
                  <span>{(c.params / 1000).toFixed(1)}k par.</span>
                  <span>
                    loss val <span style={{ color: ACCENT }}>{c.valLoss.toFixed(4)}</span>
                  </span>
                  {c.acc !== undefined && (
                    <span>
                      acc <span className="text-ok">{(c.acc * 100).toFixed(1)}%</span>
                    </span>
                  )}
                  <span className="text-fg3">{c.epochs} épocas</span>
                </div>
              </div>
            ))}
          </div>

          {/* matriz de confusión + resumen */}
          {state.confusion && state.confusion.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-start gap-4">
              <div>
                <div className="label-mono !text-[7.5px] mb-1">MATRIZ DE CONFUSIÓN · VALIDACIÓN</div>
                <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${CLASSES.length + 1}, minmax(0, 1fr))` }}>
                  <span />
                  {CLASSES.map((c) => (
                    <span key={c} className="font-mono text-[7.5px] text-fg3 text-center w-7">
                      {CLASS_ABBR[c]}
                    </span>
                  ))}
                  {state.confusion.map((row, ri) => {
                    const rowMax = Math.max(1, ...row);
                    return (
                      <div key={ri} className="contents">
                        <span className="font-mono text-[7.5px] text-fg3 pr-1 text-right w-7 leading-[18px]">
                          {CLASS_ABBR[CLASSES[ri]]}
                        </span>
                        {row.map((v, ci) => {
                          const diag = ri === ci;
                          const alpha = v === 0 ? 0 : 0.12 + (v / rowMax) * 0.75;
                          return (
                            <span
                              key={ci}
                              title={`${CLASS_SHORT[CLASSES[ri]]} → ${CLASS_SHORT[CLASSES[ci]]}: ${v}`}
                              className="font-mono text-[8.5px] text-center leading-[18px] h-[18px] w-7 tabular-nums"
                              style={{
                                background: diag
                                  ? `rgba(63,208,182,${alpha})`
                                  : v > 0
                                    ? `rgba(242,109,95,${alpha})`
                                    : "#132028",
                                color: v > 0 ? "#0a1216" : "#5f7a82",
                                fontWeight: v > 0 ? 600 : 400,
                              }}
                            >
                              {v}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="min-w-[200px] flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10.5px] text-fg2">
                  <IconTarget size={12} className="text-ok shrink-0" />
                  <span>
                    Precisión global validación:{" "}
                    <span className="font-mono text-ok font-semibold">
                      {state.cards[2]?.acc !== undefined ? `${(state.cards[2].acc! * 100).toFixed(1)}%` : "—"}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10.5px] text-fg2">
                  <IconPulse size={12} className="shrink-0 text-[#c9b8f0]" />
                  <span>
                    Dataset: {state.dataset.wells} pozos · {state.dataset.fc} ventanas pronóstico ·{" "}
                    {state.dataset.ae} normales · {state.dataset.cls} etiquetadas
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[10.5px] text-fg3">
                  <IconChip size={12} className="shrink-0 text-fg3" />
                  <span>
                    Entrenado en {(state.elapsedMs / 1000).toFixed(1)} s sobre backend{" "}
                    {state.backend.toUpperCase()} — sin datos reales de campo.
                  </span>
                </div>
                <button
                  onClick={onRetrain}
                  className="mt-1 inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.1em] px-2.5 py-1.5 border transition-colors hover:-translate-y-[1px]"
                  style={{ color: ACCENT, borderColor: `${ACCENT}55`, background: `${ACCENT}0d` }}
                >
                  <IconPlay size={11} />
                  REENTRENAR MODELOS
                </button>
              </div>
            </div>
          )}

          <p className="mt-2 text-[9.5px] text-fg3 leading-snug">
            N1 usa rollout recursivo del LSTM (bloques de 1.5 h); N2 calibra su umbral con la σ del
            error de reconstrucción en validación; N3 fusiona sus probabilidades softmax con las
            reglas físicas de diagnóstico.
          </p>
        </div>
      )}
    </div>
  );
}
