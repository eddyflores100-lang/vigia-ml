import type { WellEvent } from "../lib/sim";
import { fmtClock } from "../lib/sim";
import type { MlPhase } from "../lib/ml/engine";
import { IconClock, IconPause, IconPlay, IconPulse, IconWarn, IconWell } from "./bits";

const ML_PHASE_LABEL: Partial<Record<MlPhase, string>> = {
  data: "DATOS",
  forecast: "LSTM N1",
  autoencoder: "AUTOENC N2",
  classifier: "CLASIF N3",
};

export function TopBar({
  simM,
  paused,
  onTogglePause,
  alarmCount,
  latestEvent,
  observing,
  ml,
}: {
  simM: number;
  paused: boolean;
  onTogglePause: () => void;
  alarmCount: number;
  latestEvent: WellEvent | null;
  observing: number;
  ml?: { phase: MlPhase; progress: number };
}) {
  return (
    <header className="relative z-10 border-b border-line bg-[#0c161bcc] backdrop-blur-[2px]">
      <div className="max-w-[1600px] mx-auto px-3 md:px-4 h-14 flex items-center gap-3 md:gap-5">
        {/* marca */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="w-8 h-8 grid place-items-center border border-[#3fd0b655] bg-[#3fd0b60d] text-ok">
            <IconWell size={19} />
          </span>
          <div className="leading-none">
            <div className="font-display font-bold text-[19px] tracking-[0.22em] text-fg">
              VIGÍA
            </div>
            <div className="label-mono mt-1 !text-[8.5px]">consola predictiva · pozos de gas</div>
          </div>
        </div>

        <div className="hidden md:block h-7 w-px bg-line" />

        {/* enlace + reloj */}
        <div className="hidden md:flex items-center gap-4 shrink-0">
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-fg2">
            <span className={`w-2 h-2 rounded-full ${paused ? "bg-watch" : "bg-ok live-dot"}`} />
            {paused ? "ENLACE PAUSADO" : "SCADA OPC-UA · ACTIVO"}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-fg2">
            <IconClock size={13} />
            {fmtClock(simM)}
            <span className="text-fg3">· t+{simM} min</span>
          </span>
        </div>

        {/* último evento (ticker) */}
        <div className="flex-1 min-w-0 hidden lg:block">
          {latestEvent && (
            <div key={latestEvent.id} className="swap flex items-center gap-2 text-[12px] text-fg2 truncate">
              <IconPulse size={13} className="text-ok shrink-0" />
              <span className="font-mono text-[10px] text-fg3 shrink-0">
                {fmtClock(latestEvent.m)} · {latestEvent.wellId}
              </span>
              <span className="truncate">{latestEvent.msg}</span>
            </div>
          )}
        </div>

        {/* alarmas + pausa */}
        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          {ml && (
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] px-2 py-1 border ${
                ml.phase === "error" ? "blink" : ""
              }`}
              style={
                ml.phase === "ready"
                  ? { color: "#3fd0b6", borderColor: "#3fd0b644", background: "#3fd0b60a" }
                  : ml.phase === "error"
                    ? { color: "#f26d5f", borderColor: "#f26d5f55", background: "#f26d5f0f" }
                    : { color: "#c9b8f0", borderColor: "#c9b8f055", background: "#c9b8f00f" }
              }
              title="Motor de machine learning (TensorFlow.js)"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${ml.phase === "ready" ? "" : "live-dot"}`}
                style={{ background: ml.phase === "ready" ? "#3fd0b6" : ml.phase === "error" ? "#f26d5f" : "#c9b8f0" }}
              />
              {ml.phase === "ready"
                ? "ML · LISTO"
                : ml.phase === "error"
                  ? "ML · ERROR"
                  : `ML · ${ML_PHASE_LABEL[ml.phase] ?? "ENTRENANDO"} ${Math.round(ml.progress * 100)}%`}
            </span>
          )}
          <span className="hidden sm:inline-flex font-mono text-[10px] tracking-[0.12em] text-fg3 border border-line px-2 py-1">
            {observing} POZOS EN VIGILANCIA
          </span>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold px-2 py-1 border ${
              alarmCount > 0 ? "text-crit border-[#f26d5f55] bg-[#f26d5f0f]" : "text-ok border-[#3fd0b644] bg-[#3fd0b60a]"
            }`}
          >
            <IconWarn size={13} className={alarmCount > 0 ? "blink" : ""} />
            {alarmCount}
          </span>
          <button
            onClick={onTogglePause}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] px-2.5 py-[7px] border border-line text-fg2 hover:text-fg hover:border-line2 transition-colors"
            title={paused ? "Reanudar telemetría" : "Pausar telemetría"}
          >
            {paused ? <IconPlay size={12} /> : <IconPause size={12} />}
            {paused ? "REANUDAR" : "PAUSAR"}
          </button>
          <span className="hidden xl:inline font-mono text-[9px] tracking-[0.14em] text-fg3 border border-dashed border-line px-2 py-1">
            DATOS SINTÉTICOS
          </span>
        </div>
      </div>
    </header>
  );
}
