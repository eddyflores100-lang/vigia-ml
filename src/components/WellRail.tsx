import { STATUS_STYLE, Sparkline, StatusChip } from "./bits";

export interface WellSummary {
  id: string;
  name: string;
  field: string;
  status: string;
  score: number;
  qNow: number;
  spark: number[];
}

export function WellRail({
  wells,
  selId,
  onSelect,
}: {
  wells: WellSummary[];
  selId: string;
  onSelect: (id: string) => void;
}) {
  const counts = wells.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <aside className="flex flex-col gap-2.5 rise" style={{ animationDelay: "60ms" }}>
      <div className="flex items-baseline justify-between px-1">
        <span className="label-mono">Flota · {wells.length} pozos</span>
        <span className="font-mono text-[9px] text-fg3">muestreo 1 min</span>
      </div>

      <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
        {wells.map((w) => {
          const sel = w.id === selId;
          const st = STATUS_STYLE[w.status] ?? STATUS_STYLE["ÓPTIMO"];
          return (
            <button
              key={w.id}
              onClick={() => onSelect(w.id)}
              className={`group text-left shrink-0 md:shrink panel panel-glow px-3 py-2.5 w-[210px] md:w-auto transition-all duration-200 ${
                sel ? "!border-[#3fd0b677] bg-[#13242b]" : "hover:-translate-y-[1px]"
              }`}
              style={sel ? { boxShadow: "inset 2px 0 0 #3fd0b6" } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`font-display font-bold text-[15px] tracking-[0.08em] ${sel ? "text-fg" : "text-fg2 group-hover:text-fg"} transition-colors`}>
                  {w.id}
                </span>
                <StatusChip status={w.status} small />
              </div>
              <div className="text-[10.5px] text-fg3 mt-0.5 truncate">{w.field}</div>
              <div className="flex items-end justify-between mt-2 gap-2">
                <div className="font-mono leading-none">
                  <span className="text-[16px] font-semibold" style={{ color: st.color }}>
                    {Math.round(w.qNow).toLocaleString("es-CO")}
                  </span>
                  <span className="text-[9px] text-fg3 ml-1">Mscf/d</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[9px] text-fg3 tracking-[0.1em]">ANOMALÍA</span>
                    <span className="w-10 h-[3px] bg-[#1c2f38] overflow-hidden">
                      <span
                        className="block h-full ease-bar"
                        style={{ width: `${w.score}%`, background: st.color }}
                      />
                    </span>
                    <span className="text-[10px] font-semibold" style={{ color: st.color }}>
                      {w.score}
                    </span>
                  </div>
                </div>
                <Sparkline data={w.spark} color={st.color} w={64} h={26} fill={false} />
              </div>
            </button>
          );
        })}
      </div>

      {/* resumen de flota */}
      <div className="panel px-3 py-2.5 hidden md:block">
        <div className="label-mono mb-2">Estado de flota</div>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
          {(["ÓPTIMO", "VIGILAR", "ALERTA", "CRÍTICO"] as const).map((k) => (
            <div key={k} className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_STYLE[k].color }} />
              <span className="text-fg3">{k}</span>
              <span className="ml-auto text-fg font-semibold">{counts[k] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
