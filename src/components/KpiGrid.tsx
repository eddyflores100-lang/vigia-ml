import { VAR_META, VAR_KEYS } from "../lib/sim";
import type { Sample, VarKey } from "../lib/sim";
import { IconArrow, Sparkline } from "./bits";

export function KpiGrid({ samples }: { samples: Sample[] }) {
  const last = samples[samples.length - 1];
  const ago = samples[Math.max(0, samples.length - 61)];
  const win = samples.slice(-240);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 rise" style={{ animationDelay: "120ms" }}>
      {VAR_KEYS.map((key: VarKey, i) => {
        const meta = VAR_META[key];
        const value = last[key];
        const delta = value - ago[key];
        const spark = win.slice(-60).map((s) => s[key]);
        const min = Math.min(...win.map((s) => s[key]));
        const max = Math.max(...win.map((s) => s[key]));
        const pos = max - min > 1e-6 ? (value - min) / (max - min) : 0.5;
        const deltaGood = meta.dir === "none" ? null : delta >= 0;
        const deltaColor = deltaGood === null ? "#5f7a82" : deltaGood ? "#3fd0b6" : "#f2b33d";

        return (
          <div
            key={key}
            className="panel corners panel-glow px-3 pt-2.5 pb-2 transition-transform duration-200 hover:-translate-y-[2px]"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="label-mono !tracking-[0.14em]">{meta.short}</span>
              <span className="font-mono text-[9px] text-fg3">{meta.tag}</span>
            </div>
            <div className="flex items-end justify-between mt-1.5 gap-2">
              <div className="leading-none min-w-0">
                <span
                  key={Math.round(value * 10)}
                  className="swap inline-block font-mono font-semibold text-[24px] text-fg tabular-nums"
                >
                  {value.toFixed(meta.dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                </span>
                <span className="font-mono text-[10px] text-fg3 ml-1.5">{meta.unit}</span>
                <div
                  className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] tabular-nums"
                  style={{ color: deltaColor }}
                >
                  {Math.abs(delta) > 0.05 && <IconArrow dir={delta >= 0 ? "up" : "down"} size={10} />}
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(meta.dec)}
                  <span className="text-fg3">/ 60 min</span>
                </div>
              </div>
              <Sparkline data={spark} color={meta.color} w={86} h={32} />
            </div>
            <div className="mt-2">
              <div className="h-[3px] bg-[#1b2e37] relative overflow-hidden">
                <span
                  className="absolute inset-y-0 left-0 ease-bar"
                  style={{ width: `${Math.round(pos * 100)}%`, background: `${meta.color}88` }}
                />
              </div>
              <div className="flex justify-between font-mono text-[8.5px] text-fg3 mt-1 tabular-nums">
                <span>{min.toFixed(0)}</span>
                <span className="text-fg3/70">rango 4 h</span>
                <span>{max.toFixed(0)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
