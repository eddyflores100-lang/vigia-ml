import { useId, type ReactNode } from "react";

// ------------------------------- iconos SVG --------------------------------
type IconProps = { size?: number; className?: string; strokeWidth?: number };
const I = ({ size = 16, className = "", strokeWidth = 1.7, children }: IconProps & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const IconWell = (p: IconProps) => (
  <I {...p}>
    <path d="M12 2 8 9h8L12 2Z" />
    <path d="M9.5 9 7 22h10L14.5 9" />
    <path d="M8.4 13.5h7.2M7.7 17.5h8.6" />
  </I>
);
export const IconDroplet = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3.5S6 10 6 14.5a6 6 0 0 0 12 0C18 10 12 3.5 12 3.5Z" />
    <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
  </I>
);
export const IconValve = (p: IconProps) => (
  <I {...p}>
    <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
    <circle cx="15.5" cy="8" r="2" />
    <circle cx="9.5" cy="16" r="2" />
  </I>
);
export const IconChip = (p: IconProps) => (
  <I {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1" />
    <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
  </I>
);
export const IconGauge = (p: IconProps) => (
  <I {...p}>
    <path d="M4.5 18a9 9 0 1 1 15 0" />
    <path d="M12 13.5 15.5 9" />
    <circle cx="12" cy="14.5" r="1.2" />
  </I>
);
export const IconCheck = (p: IconProps) => (
  <I {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </I>
);
export const IconWarn = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3.5 22 20H2L12 3.5Z" />
    <path d="M12 10v4.5M12 17.4v.1" />
  </I>
);
export const IconPulse = (p: IconProps) => (
  <I {...p}>
    <path d="M3 12h4l2.5-6 4 12L16 12h5" />
  </I>
);
export const IconWrench = (p: IconProps) => (
  <I {...p}>
    <path d="M14.5 6.5a4 4 0 0 0-5.4 5L4 16.6 7.4 20l5.1-5.1a4 4 0 0 0 5-5.4L14.6 12l-2.6-2.6 2.5-2.9Z" />
  </I>
);
export const IconPlay = (p: IconProps) => (
  <I {...p}>
    <path d="M7 4.5v15l12-7.5-12-7.5Z" />
  </I>
);
export const IconPause = (p: IconProps) => (
  <I {...p}>
    <path d="M8 5v14M16 5v14" />
  </I>
);
export const IconClock = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </I>
);
export const IconArrow = ({ dir, ...p }: IconProps & { dir: "up" | "down" }) => (
  <I {...p}>
    {dir === "up" ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
  </I>
);
export const IconBolt = (p: IconProps) => (
  <I {...p}>
    <path d="M13 2 5 13.5h5.5L11 22l8-11.5h-5.5L13 2Z" />
  </I>
);
export const IconTarget = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <path d="M12 11.5v1" />
  </I>
);

// ------------------------------- sparkline ---------------------------------
export function Sparkline({
  data,
  color = "#3fd0b6",
  w = 120,
  h = 34,
  fill = true,
}: {
  data: number[];
  color?: string;
  w?: number;
  h?: number;
  fill?: boolean;
}) {
  const id = useId();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 2) + 1;
    const y = h - 3 - ((v - min) / span) * (h - 7);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`1,${h - 1} ${pts.join(" ")} ${w - 1},${h - 1}`} fill={`url(#${id})`} />
        </>
      )}
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2.1" fill={color} />
    </svg>
  );
}

// --------------------------- encabezado de sección -------------------------
export function SectionHead({
  level,
  title,
  right,
  accent = "#3fd0b6",
}: {
  level: string;
  title: string;
  right?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span
        className="font-mono text-[10px] font-semibold tracking-widest px-1.5 py-0.5 border"
        style={{ color: accent, borderColor: `${accent}55`, background: `${accent}0d` }}
      >
        {level}
      </span>
      <h3 className="font-display font-semibold text-[13px] tracking-[0.14em] uppercase text-fg">{title}</h3>
      <div className="flex-1 h-px bg-line" />
      {right}
    </div>
  );
}

// ------------------------------ chip de estado -----------------------------
export const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  "ÓPTIMO": { color: "#3fd0b6", label: "ÓPTIMO" },
  "VIGILAR": { color: "#f2b33d", label: "VIGILAR" },
  "ALERTA": { color: "#f2873d", label: "ALERTA" },
  "CRÍTICO": { color: "#f26d5f", label: "CRÍTICO" },
};

export function StatusChip({ status, small = false }: { status: string; small?: boolean }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE["ÓPTIMO"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border font-mono font-semibold tracking-[0.12em] ${
        small ? "text-[9px] px-1.5 py-[2px]" : "text-[10px] px-2 py-[3px]"
      }`}
      style={{ color: s.color, borderColor: `${s.color}66`, background: `${s.color}12` }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${status === "CRÍTICO" ? "blink" : ""}`}
        style={{ background: s.color }}
      />
      {s.label}
    </span>
  );
}

export function PrioChip({ prio }: { prio: "ALTA" | "MEDIA" | "RUTINA" }) {
  const c = prio === "ALTA" ? "#f26d5f" : prio === "MEDIA" ? "#f2b33d" : "#5f7a82";
  return (
    <span
      className="font-mono text-[9px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
      style={{ color: c, borderColor: `${c}55`, background: `${c}0f` }}
    >
      {prio}
    </span>
  );
}

export const HYPO_ICON = {
  droplet: IconDroplet,
  valve: IconValve,
  chip: IconChip,
  gauge: IconGauge,
  check: IconCheck,
} as const;

// --------------------- chip de motor (ML vs estadístico) --------------------
export function EngineChip({ ml, small = false }: { ml: boolean; small?: boolean }) {
  const c = ml ? "#c9b8f0" : "#5f7a82";
  return (
    <span
      className={`inline-flex items-center gap-1 border font-mono font-semibold tracking-[0.12em] ${
        small ? "text-[8px] px-1.5 py-[1px]" : "text-[9px] px-1.5 py-[2px]"
      }`}
      style={{ color: c, borderColor: `${c}55`, background: `${c}0f` }}
    >
      {ml ? "LSTM · TF.JS" : "HOLT"}
    </span>
  );
}
