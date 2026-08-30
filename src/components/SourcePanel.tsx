import { useState } from "react";
import type { LinkStatus, LinkStats } from "../lib/ingest/opcuaBridge";
import { SectionHead } from "./bits";

const STATUS_UI: Record<LinkStatus, { color: string; label: string; blink?: boolean }> = {
  idle: { color: "#5f7a82", label: "INACTIVO" },
  connecting: { color: "#f2b33d", label: "CONECTANDO", blink: true },
  online: { color: "#3fd0b6", label: "EN LÍNEA" },
  degraded: { color: "#f2b33d", label: "DEGRADADO", blink: true },
  error: { color: "#f26d5f", label: "ERROR" },
};

/**
 * Selector de fuente de telemetría: simulador demo integrado (WellSim) o
 * puente OPC-UA → WebSocket (bridge/opcua-bridge.mjs). Al conectar una fuente
 * externa, las muestras entran saneadas al buffer del pozo seleccionado.
 */
export function SourcePanel({
  status,
  stats,
  info,
  url,
  onUrl,
  onConnect,
  onDisconnect,
}: {
  status: LinkStatus;
  stats: LinkStats;
  info: string;
  url: string;
  onUrl: (u: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [mode, setMode] = useState<"demo" | "opcua">("demo");
  const st = STATUS_UI[status];
  const external = mode === "opcua" && status !== "idle";

  return (
    <div className="panel corners p-3.5 rise" style={{ animationDelay: "200ms" }}>
      <SectionHead
        level="INGESTA"
        title="Fuente de datos"
        accent="#7fb4e6"
        right={
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[8.5px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
            style={{ color: st.color, borderColor: `${st.color}55`, background: `${st.color}0f` }}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${st.blink ? "blink" : ""}`} style={{ background: st.color }} />
            {mode === "demo" ? "SIMULADOR DEMO" : st.label}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-line overflow-hidden">
          {(
            [
              ["demo", "SIMULADOR"],
              ["opcua", "PUENTE OPC-UA"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] transition-colors ${
                mode === m ? "bg-okdim text-ok" : "text-fg3 hover:text-fg2"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "opcua" && (
          <>
            <input
              value={url}
              onChange={(e) => onUrl(e.target.value)}
              spellCheck={false}
              aria-label="URL del puente WebSocket"
              placeholder="ws://192.168.1.50:8082"
              className="flex-1 min-w-[180px] bg-panel2 border border-line px-2 py-1 font-mono text-[10px] text-fg2 placeholder:text-fg3/60 focus:outline-none focus:border-fc/60"
            />
            {external ? (
              <button
                onClick={onDisconnect}
                className="px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] border border-crit/50 text-crit hover:bg-crit/10 transition-colors"
              >
                DESCONECTAR
              </button>
            ) : (
              <button
                onClick={onConnect}
                className="px-2.5 py-1 font-mono text-[9px] tracking-[0.12em] border border-ok/50 text-ok hover:bg-ok/10 transition-colors"
              >
                CONECTAR
              </button>
            )}
          </>
        )}
      </div>

      <p className="mt-2 text-[10px] text-fg3 leading-relaxed">
        {mode === "demo" ? (
          <>
            Telemetría sintética WellSim a 1 minuto por pozo: el pipeline N1→N5 y el DCA corren sobre esta
            fuente sin configuración. Para conectar datos reales, levanta el puente{" "}
            <code className="text-fg2">bridge/opcua-bridge.mjs</code> (ver <code className="text-fg2">bridge/README.md</code>)
            y selecciona la pestaña Puente OPC-UA.
          </>
        ) : (
          <>
            {info || "Sin intentos aún."}{" "}
            {status !== "idle" && (
              <span className="font-mono text-[9px] text-fg3">
                RECIBIDAS {stats.received} · ACEPTADAS {stats.accepted} · RECHAZADAS {stats.rejected} ·{" "}
                REINTENTOS {stats.reconnects}
              </span>
            )}
            {external && status === "online" && (
              <> Las muestras entrantes alimentan el pozo seleccionado (el simulador se pausa).</>
            )}
          </>
        )}
      </p>
    </div>
  );
}
