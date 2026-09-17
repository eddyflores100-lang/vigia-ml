import { useRef } from "react";
import type { QualityReport } from "../lib/replay/csvParser";
import { fmtTs } from "../lib/replay/csvParser";
import type { ReplayScore, ReplaySpeed, ReplayStatus } from "../lib/replay/replayEngine";
import { SPEEDS, SCORE_CLASSES } from "../lib/replay/replayEngine";
import { SectionHead } from "./bits";

const ACCENT = "#c9a86f";

const fmt = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec }) : "—";

const CLASS_ABBR: Record<string, string> = {
  normal: "NOR",
  liquidLoading: "LL",
  restriction: "REST",
  sensorFault: "SENS",
  controlIssue: "CTRL",
  otras: "OTR",
};

export interface ReplayUiState {
  fileName: string | null;
  status: ReplayStatus;
  idx: number;
  total: number;
  ts: number;
  firstTs: number;
  lastTs: number;
  etaSec: number;
  speed: ReplaySpeed;
  hasLabels: boolean;
  currentLabel: string | null;
  quality: QualityReport | null;
  warnings: string[];
  score: ReplayScore | null;
}

export interface ReplayActions {
  onLoadText: (text: string, name: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSpeed: (s: ReplaySpeed) => void;
  onNextEvent: () => void;
  onRestart: () => void;
}

/** Matriz de confusión compacta 6×6 con intensidad por celda. */
function ConfusionMatrix({ score }: { score: ReplayScore }) {
  const max = Math.max(1, ...score.matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse font-mono text-[8.5px] tabular-nums">
        <thead>
          <tr>
            <th className="p-[3px] text-fg3 font-normal text-left tracking-[0.1em]">VERDAD↓ PRED→</th>
            {SCORE_CLASSES.map((c) => (
              <th key={c} className="p-[3px] text-fg2 font-semibold tracking-[0.08em]">
                {CLASS_ABBR[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCORE_CLASSES.map((truth, i) => (
            <tr key={truth}>
              <td className="p-[3px] text-fg2 font-semibold pr-2 tracking-[0.08em]">{CLASS_ABBR[truth]}</td>
              {SCORE_CLASSES.map((pred, j) => {
                const v = score.matrix[i][j];
                const intensity = v / max;
                const hit = i === j;
                return (
                  <td
                    key={pred}
                    className="p-[3px] text-center min-w-[26px] border border-line/60"
                    style={{
                      background: v === 0 ? "transparent" : hit ? `rgba(63,208,182,${0.12 + intensity * 0.55})` : `rgba(242,109,95,${0.1 + intensity * 0.5})`,
                      color: v === 0 ? "#5f7a82" : hit ? "#bff2e7" : "#ffd9d4",
                    }}
                  >
                    {v === 0 ? "·" : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Panel del reproductor de histórico (v0.12): carga un CSV de telemetría
 * (propio o de los demos incluidos), lo reproduce contra el pozo seleccionado
 * a velocidad ajustable y —si el CSV trae etiquetas de evento— puntúa la
 * detección del pipeline con matriz de confusión y retardo por evento.
 */
export function ReplayPanel({ ui, actions }: { ui: ReplayUiState; actions: ReplayActions }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    actions.onLoadText(text, f.name);
  };

  const loadDemo = async (name: string) => {
    try {
      const res = await fetch(`./data/${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      actions.onLoadText(await res.text(), name);
    } catch {
      actions.onLoadText("", name); // el App reporta el error de carga
    }
  };

  const loaded = ui.status !== "idle";
  const pct = ui.total > 0 ? Math.round((ui.idx / ui.total) * 100) : 0;

  return (
    <div className="panel corners p-3.5 rise" style={{ animationDelay: "220ms" }}>
      <SectionHead
        level="INGESTA"
        title="Replay de histórico CSV"
        accent={ACCENT}
        right={
          <span
            className="font-mono text-[8px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
            style={{
              color: ui.status === "playing" ? "#3fd0b6" : ui.status === "done" ? "#7fb4e6" : "#5f7a82",
              borderColor: ui.status === "playing" ? "#3fd0b655" : ui.status === "done" ? "#7fb4e655" : "#5f7a8255",
              background: ui.status === "playing" ? "#3fd0b60f" : "transparent",
            }}
          >
            {ui.status === "idle" ? "SIN FUENTE" : ui.status === "playing" ? "REPRODUCIENDO" : ui.status === "paused" ? "EN PAUSA" : ui.status === "done" ? "COMPLETADO" : "LISTO"}
          </span>
        }
      />

      {/* carga */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] border border-line text-fg2 hover:border-fc/60 hover:text-fc transition-colors"
        >
          ELEGIR ARCHIVO…
        </button>
        <span className="font-mono text-[8.5px] text-fg3 tracking-[0.1em]">DEMOS:</span>
        {[
          ["demo-etiquetado.csv", "ETIQUETADO 55 h"],
          ["volve-f12.csv", "VOLVE F-12 · REAL"],
          ["volve-f11.csv", "VOLVE F-11 · REAL"],
        ].map(([f, label]) => (
          <button
            key={f}
            onClick={() => void loadDemo(f)}
            className="px-2 py-1 font-mono text-[9px] tracking-[0.1em] border border-line text-fg3 hover:border-ok/60 hover:text-ok transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {/* estado de carga */}
      {!loaded && (
        <p className="mt-2 text-[10px] text-fg3 leading-relaxed">
          Reproduce tu histórico por pozo (columnas <code className="text-fg2">ts, pt, pc, pl, temp, q, choke</code>,
          opcional <code className="text-fg2">event</code>) a velocidad 1×–900×. Con etiquetas de evento, la consola
          puntúa su propia detección: matriz de confusión y retardo. Los datos nunca salen del navegador.
        </p>
      )}

      {loaded && ui.quality && (
        <>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] text-fg3 tracking-[0.06em]">
            <span className="text-fg2">{ui.fileName}</span>
            <span>{fmt(ui.quality.nValid)} FILAS</span>
            <span>Δ {fmt(ui.quality.intervalMin, 1)} MIN</span>
            <span>
              {fmtTs(ui.firstTs)} → {fmtTs(ui.lastTs)}
            </span>
            {ui.quality.nGaps > 0 && <span className="text-warn">{ui.quality.nGaps} HUECOS</span>}
            {ui.quality.missing.length > 0 && (
              <span className="text-warn">SIN FUENTE: {ui.quality.missing.map((m) => VAR_SHORT[m] ?? m).join(", ")}</span>
            )}
          </div>

          {/* controles */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {ui.status === "playing" ? (
              <button
                onClick={actions.onPause}
                className="px-3 py-1 font-mono text-[9px] tracking-[0.12em] border border-warn/60 text-warn hover:bg-warn/10 transition-colors"
              >
                ⏸ PAUSAR
              </button>
            ) : (
              <button
                onClick={actions.onPlay}
                className="px-3 py-1 font-mono text-[9px] tracking-[0.12em] border border-ok/60 text-ok hover:bg-ok/10 transition-colors"
              >
                ▶ {ui.idx > 0 && ui.status !== "done" ? "CONTINUAR" : ui.status === "done" ? "REPETIR" : "REPRODUCIR"}
              </button>
            )}
            <button
              onClick={actions.onStop}
              className="px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] border border-line text-fg3 hover:border-crit/60 hover:text-crit transition-colors"
            >
              ■ DETENER
            </button>
            <div className="flex border border-line overflow-hidden">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => actions.onSpeed(s)}
                  className={`px-1.5 py-1 font-mono text-[9px] tracking-[0.08em] transition-colors ${
                    ui.speed === s ? "bg-okdim text-ok" : "text-fg3 hover:text-fg2"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
            {ui.hasLabels && (
              <button
                onClick={actions.onNextEvent}
                className="px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] border border-fc/50 text-fc hover:bg-fc/10 transition-colors"
              >
                ⏭ SIGUIENTE EVENTO
              </button>
            )}
            {ui.idx > 0 && (
              <button
                onClick={actions.onRestart}
                className="px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] border border-line text-fg3 hover:text-fg2 transition-colors"
              >
                ↺ REINICIAR
              </button>
            )}
            {ui.status === "playing" && ui.etaSec > 0 && (
              <span className="font-mono text-[9px] text-fg3">FIN EN ≈ {fmt(ui.etaSec)} s</span>
            )}
          </div>

          {/* progreso */}
          <div className="mt-2.5">
            <div className="h-[6px] bg-panel2 border border-line overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full transition-[width] duration-200"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${ACCENT}cc, ${ACCENT})` }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[8.5px] text-fg3 tabular-nums">
              <span>{fmtTs(ui.ts)}</span>
              <span>
                {fmt(ui.idx)} / {fmt(ui.total)} · {pct} %
              </span>
            </div>
          </div>

          {ui.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {ui.warnings.slice(0, 3).map((w, i) => (
                <li key={i} className="text-[9px] text-warn/90 leading-snug font-mono">
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}

          {/* puntuación */}
          {ui.score && ui.score.hasLabels ? (
            <div className="mt-3 pt-2.5 border-t border-line">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-mono text-[8.5px] tracking-[0.14em] text-fg3">
                  DETECCIÓN VS. ETIQUETAS DE CAMPO
                </span>
                <span className="font-mono text-[9px] text-fg2 tabular-nums">
                  EXACTITUD {fmt(ui.score.accuracy * 100, 1)} % · N={fmt(ui.score.nTicks)}
                  {ui.score.meanDelayMin !== null && <> · RETARDO MEDIO {fmt(ui.score.meanDelayMin, ui.score.meanDelayMin >= 10 ? 0 : 1)} min</>}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 items-start">
                <ConfusionMatrix score={ui.score} />
                <div className="min-w-[190px] flex-1">
                  <table className="w-full border-collapse font-mono text-[8.5px] tabular-nums">
                    <thead>
                      <tr className="text-fg3">
                        <th className="text-left font-normal p-[2px] tracking-[0.08em]">CLASE</th>
                        <th className="text-right font-normal p-[2px]">PREC</th>
                        <th className="text-right font-normal p-[2px]">RECU</th>
                        <th className="text-right font-normal p-[2px]">F1</th>
                        <th className="text-right font-normal p-[2px]">N</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ui.score.perClass
                        .filter((c) => c.support > 0)
                        .map((c) => (
                          <tr key={c.cls} className="text-fg2">
                            <td className="p-[2px] tracking-[0.08em]">{CLASS_ABBR[c.cls]}</td>
                            <td className="p-[2px] text-right">{fmt(c.precision * 100)}%</td>
                            <td className="p-[2px] text-right">{fmt(c.recall * 100)}%</td>
                            <td className="p-[2px] text-right" style={{ color: Number.isFinite(c.f1) && c.f1 > 0.66 ? "#3fd0b6" : Number.isFinite(c.f1) && c.f1 > 0.33 ? "#f2b33d" : "#f26d5f" }}>
                              {fmt(c.f1 * 100)}%
                            </td>
                            <td className="p-[2px] text-right text-fg3">{c.support}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {ui.score.events.length > 0 && (
                    <p className="mt-1.5 text-[9px] text-fg3 leading-relaxed font-mono">
                      EVENTOS: {ui.score.events.filter((e) => e.detectedAtTs !== null).length}/{ui.score.events.length} DETECTADOS
                      {ui.score.missedEvents > 0 && <span className="text-crit"> · {ui.score.missedEvents} SIN DETECTAR</span>}
                    </p>
                  )}
                </div>
              </div>
              {ui.currentLabel && (
                <p className="mt-1.5 text-[9px] text-fg3 font-mono tracking-[0.06em]">
                  ETIQUETA ACTUAL: <span className="text-fc">{ui.currentLabel.toUpperCase()}</span>
                </p>
              )}
            </div>
          ) : ui.score && !ui.score.hasLabels && ui.score.nTicks >= 0 && ui.idx > 0 ? (
            <p className="mt-2.5 pt-2 border-t border-line text-[9.5px] text-fg3 leading-snug">
              El CSV no trae columna <code className="text-fg2">event</code>: el replay alimenta el pipeline sin
              puntuación. Añade etiquetas (p. ej. <code className="text-fg2">event=liquid_loading</code>) para ver la
              matriz de confusión.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

const VAR_SHORT: Record<string, string> = {
  pt: "P·tubing",
  pc: "P·casing",
  pl: "P·línea",
  temp: "Temp",
  q: "Caudal",
  choke: "Choke",
};
