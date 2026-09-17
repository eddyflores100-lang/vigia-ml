// ---------------------------------------------------------------------------
// VIGÍA · figuras técnicas del landing «Cuaderno de laboratorio» (v0.12.1)
// FIG. 01 — esquema del pozo vigilado: corte con revestidor, tubing, packer,
//           perforaciones y los 6 transmisores que alimenta la consola.
// REG. 01 — registro continuo en papel de diagrama: historia sólida,
//           pronóstico LSTM punteado con banda, y el evento detectado.
// Dibujo lineal puro (tinta sobre papel): nada de degradados ni glow.
// ---------------------------------------------------------------------------

const INK = "#1b1812";
const INK2 = "#4c463a";
const INK3 = "#837b69";
const LINE2 = "#b3a98f";
const RED = "#b23a26";
const BLUE = "#1f5d9e";

/** Marca de registro (+) para las esquinas de las láminas. */
export function RegMark({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`reg-mark ${className}`}>+</span>;
}

// ------------------------------ FIG. 01 -------------------------------------

function Gauge({ x, y, tag }: { x: number; y: number; tag: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="10" fill="none" stroke={RED} strokeWidth="1.3" />
      <line x1={x - 14} y1={y} x2={x - 10} y2={y} stroke={RED} strokeWidth="1" />
      <line x1={x + 10} y1={y} x2={x + 14} y2={y} stroke={RED} strokeWidth="1" />
      <line x1={x} y1={y - 14} x2={x} y2={y - 10} stroke={RED} strokeWidth="1" />
      <line x1={x} y1={y + 10} x2={x} y2={y + 14} stroke={RED} strokeWidth="1" />
      <text x={x} y={y + 3.2} textAnchor="middle" fontSize="7.5" fontWeight="600" fill={RED} className="svg-mono">
        {tag}
      </text>
    </g>
  );
}

function Leader({ x1, y1, x2, y2, label, anchor = "start", dy = 0 }: { x1: number; y1: number; x2: number; y2: number; label: string; anchor?: "start" | "end"; dy?: number }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE2} strokeWidth="0.8" />
      <circle cx={x2} cy={y2} r="1.6" fill={INK2} />
      <text x={x1 + (anchor === "start" ? 4 : -4)} y={y1 + 3 + dy} textAnchor={anchor} fontSize="8.5" fill={INK2} className="svg-mono">
        {label}
      </text>
    </g>
  );
}

/** FIG. 01 — corte esquemático del pozo con instrumentación. */
export function WellSchematic() {
  return (
    <svg viewBox="0 0 400 480" role="img" aria-labelledby="fig01-title" className="w-full h-auto">
      <title id="fig01-title">Esquema del pozo de gas vigilado por VIGÍA: cabezal, revestidor, tubing, packer, perforaciones y los seis transmisores medidos</title>
      <defs>
        <pattern id="hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="7" stroke={LINE2} strokeWidth="0.9" />
        </pattern>
        <pattern id="hatch2" width="5" height="5" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="5" stroke={INK3} strokeWidth="0.8" />
        </pattern>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={INK} />
        </marker>
        <marker id="arrS" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={INK} />
        </marker>
      </defs>

      {/* superficie del terreno */}
      <line x1="24" y1="88" x2="256" y2="88" stroke={INK} strokeWidth="1.4" />
      {Array.from({ length: 20 }, (_, i) => (
        <line key={i} x1={30 + i * 11} y1="88" x2={24 + i * 11} y2="95" stroke={INK3} strokeWidth="0.8" />
      ))}
      <text x="24" y="104" fontSize="8" fill={INK3} className="svg-mono">0 m</text>

      {/* cabezal: carrete + válvulas maestras */}
      <rect x="168" y="26" width="24" height="14" fill="none" stroke={INK} strokeWidth="1.4" />
      <rect x="152" y="40" width="56" height="14" fill="none" stroke={INK} strokeWidth="1.4" />
      <rect x="156" y="54" width="48" height="34" fill="none" stroke={INK} strokeWidth="1.4" />
      {/* volantes de las válvulas maestras (cruz) */}
      {[
        [140, 47],
        [224, 47],
      ].map(([cx, cy]) => (
        <g key={cx} stroke={INK} strokeWidth="1.2">
          <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} />
          <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} />
          <circle cx={cx} cy={cy} r="3.4" fill="none" />
        </g>
      ))}
      <line x1="148" y1="47" x2="156" y2="47" stroke={INK} strokeWidth="1.4" />
      <line x1="204" y1="47" x2="216" y2="47" stroke={INK} strokeWidth="1.4" />

      {/* línea de flujo: choke y salida a separador */}
      <line x1="232" y1="47" x2="252" y2="47" stroke={INK} strokeWidth="1.4" />
      {/* símbolo del choke (corbatín con restricción) */}
      <path d="M252 40 L262 47 L252 54 Z M272 40 L262 47 L272 54 Z" fill="none" stroke={INK} strokeWidth="1.3" />
      <path d="M255 42 Q262 47 269 42" fill="none" stroke={INK} strokeWidth="0.9" />
      <line x1="272" y1="47" x2="336" y2="47" stroke={INK} strokeWidth="1.4" markerEnd="url(#arrS)" />
      <text x="340" y="50" fontSize="8.5" fill={INK2} className="svg-mono">A SEPARADOR</text>

      {/* pozo: revestidor (casing) y tubing */}
      <rect x="112" y="92" width="10" height="336" fill="url(#hatch)" stroke="none" />
      <rect x="232" y="92" width="10" height="336" fill="url(#hatch)" stroke="none" />
      <line x1="152" y1="88" x2="152" y2="428" stroke={INK} strokeWidth="1.5" />
      <line x1="208" y1="88" x2="208" y2="428" stroke={INK} strokeWidth="1.5" />
      <line x1="170" y1="88" x2="170" y2="322" stroke={INK} strokeWidth="1.2" />
      <line x1="190" y1="88" x2="190" y2="322" stroke={INK} strokeWidth="1.2" />
      {/* zapatas del revestidor */}
      <path d="M152 428 l-6 8 M208 428 l6 8" stroke={INK} strokeWidth="1.2" fill="none" />

      {/* packer */}
      <rect x="154" y="322" width="52" height="12" fill="url(#hatch2)" stroke={INK} strokeWidth="1.3" />
      <path d="M152 322 l-5 -5 M152 334 l-5 5 M208 322 l5 -5 M208 334 l5 5" stroke={INK} strokeWidth="1.1" fill="none" />

      {/* yacimiento + perforaciones */}
      <rect x="30" y="352" width="122" height="60" fill="url(#hatch)" opacity="0.55" stroke="none" />
      <rect x="208" y="352" width="122" height="60" fill="url(#hatch)" opacity="0.55" stroke="none" />
      {Array.from({ length: 5 }, (_, i) => (
        <g key={i} stroke={INK} strokeWidth="1.1" fill="none">
          <path d={`M152 ${356 + i * 12} l-9 -4 l0 8 Z`} />
          <path d={`M208 ${356 + i * 12} l9 -4 l0 8 Z`} />
        </g>
      ))}

      {/* cota de profundidad */}
      <line x1="356" y1="88" x2="356" y2="382" stroke={INK} strokeWidth="0.9" markerStart="url(#arrS)" markerEnd="url(#arrS)" />
      <line x1="348" y1="88" x2="364" y2="88" stroke={INK} strokeWidth="0.9" />
      <line x1="348" y1="382" x2="364" y2="382" stroke={INK} strokeWidth="0.9" />
      <text x="368" y="235" fontSize="9" fill={INK2} className="svg-mono" transform="rotate(-90 368 235)">2 850 m (MD)</text>

      {/* instrumentos vigilados (rojo) */}
      <Gauge x={128} y={26} tag="PT" />
      <Gauge x={196} y={14} tag="TT" />
      <Gauge x={262} y={18} tag="ZT" />
      <Gauge x={330} y={18} tag="FT" />
      <Gauge x={352} y={70} tag="PL" />
      <Gauge x={128} y={150} tag="PC" />
      <line x1={138} y1={150} x2={176} y2={150} stroke={RED} strokeWidth="0.8" strokeDasharray="3 2" />

      {/* anotaciones con línea guía */}
      <Leader x1={36} y1={30} x2={168} y2={26} label="CABEZAL · VÁLVULAS MAESTRAS" anchor="start" />
      <Leader x1={36} y1={200} x2={152} y2={200} label="REVESTIDOR 7&quot;" anchor="start" />
      <Leader x1={36} y1={262} x2={170} y2={262} label="TUBING 2 7/8&quot;" anchor="start" />
      <Leader x1={60} y1={130} x2={174} y2={130} label="ANULAR (pc)" anchor="start" />
      <Leader x1={244} y1={328} x2={206} y2={328} label="PACKER" anchor="end" />
      <Leader x1={244} y1={382} x2={208} y2={382} label="PERFORACIONES" anchor="end" />
      <Leader x1={60} y1={396} x2={104} y2={382} label="YACIMIENTO" anchor="start" />
      <text x="244" y="66" fontSize="8.5" fill={INK2} className="svg-mono">CHOKE 64/64&quot;</text>

      {/* bloque de título */}
      <g>
        <rect x="24" y="436" width="352" height="34" fill="none" stroke={INK} strokeWidth="1.2" />
        <line x1="150" y1="436" x2="150" y2="470" stroke={INK} strokeWidth="1" />
        <line x1="258" y1="436" x2="258" y2="470" stroke={INK} strokeWidth="1" />
        <line x1="24" y1="452" x2="376" y2="452" stroke={INK} strokeWidth="0.8" />
        <text x="32" y="447" fontSize="8.5" fontWeight="600" fill={INK} className="svg-mono">ESQUEMA DE POZO DE GAS</text>
        <text x="32" y="464" fontSize="7.5" fill={INK3} className="svg-mono">SEÑALES VIGILADAS: PT · PC · PL · TT · FT · ZT</text>
        <text x="158" y="447" fontSize="8.5" fill={INK} className="svg-mono">FIG. 01</text>
        <text x="158" y="464" fontSize="7.5" fill={INK3} className="svg-mono">ESC. S/E</text>
        <text x="266" y="447" fontSize="8.5" fill={INK} className="svg-mono">DOC. VIG-012</text>
        <text x="266" y="464" fontSize="7.5" fill={INK3} className="svg-mono">REV. C · HOJA 1/1</text>
      </g>
    </svg>
  );
}

// ------------------------------ REG. 01 -------------------------------------

const HISTORY = Array.from({ length: 91 }, (_, i) => i * 10); // 0..900 px = −24 h → t₀
const FORECAST = Array.from({ length: 31 }, (_, i) => 900 + i * 10); // 900..1200 = t₀ → +8 h

const ptH = (x: number) => 46 + 7 * Math.sin(x / 95) + 2.6 * Math.sin(x / 31 + 1) - (x > 760 ? (x - 760) * 0.03 : 0);
const qH = (x: number) => 86 + 4.5 * Math.sin(x / 70 + 2) + 1.8 * Math.sin(x / 24) - (x > 760 ? (x - 760) * 0.022 : 0);
const n2H = (x: number) => 131 - (x < 740 ? 1.4 + 0.8 * Math.sin(x / 46) : Math.min(26, (x - 740) * 0.16));
const ptF = (x: number) => ptH(900) - (x - 900) * 0.012 - 1.5 * Math.sin((x - 900) / 40);
const qF = (x: number) => qH(900) - (x - 900) * 0.009 - 1.2 * Math.sin((x - 900) / 34);
const n2F = (x: number) => 105 + 2 * Math.sin((x - 900) / 55);

const poly = (xs: number[], f: (x: number) => number) => xs.map((x) => `${x},${f(x).toFixed(1)}`).join(" ");

/** REG. 01 — registro continuo: historia sólida + pronóstico punteado. */
export function StripChart() {
  return (
    <svg viewBox="0 0 1200 150" role="img" aria-labelledby="reg01-title" className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <title id="reg01-title">Registro continuo de presión, caudal e índice de anomalía: 24 horas de historia, evento detectado y pronóstico a 8 horas con banda</title>
      {/* retícula del papel de diagrama */}
      {Array.from({ length: 29 }, (_, i) => (
        <line key={`v${i}`} x1={i * 40 + 20} y1="8" x2={i * 40 + 20} y2="138" stroke={LINE2} strokeWidth="0.5" opacity={i % 5 === 0 ? 0.9 : 0.45} />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1="12" y1={8 + i * 26} x2="1188" y2={8 + i * 26} stroke={LINE2} strokeWidth="0.5" opacity={i % 2 === 0 ? 0.9 : 0.45} />
      ))}

      {/* banda del pronóstico (tras t₀) */}
      <polygon points={`900,${ptF(1200) - 6} 1200,${ptF(1200) - 6} 1200,${ptF(1200) + 6} 900,${ptF(1200) + 6}`} fill={BLUE} opacity="0.10" />
      <line x1="900" y1="8" x2="900" y2="138" stroke={INK} strokeWidth="1" strokeDasharray="5 4" />
      <text x="906" y="18" fontSize="8.5" fontWeight="600" fill={INK} className="svg-mono">t₀ · AHORA</text>
      <text x="1194" y="18" textAnchor="end" fontSize="8.5" fill={BLUE} className="svg-mono">PRONÓSTICO N1 · +8 h</text>

      {/* evento detectado */}
      <line x1="760" y1="8" x2="760" y2="138" stroke={RED} strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="760" cy={n2H(760)} r="3" fill={RED} />
      <text x="754" y="132" textAnchor="end" fontSize="8.5" fontWeight="600" fill={RED} className="svg-mono">EVENTO N3 · CARGA DE LÍQUIDOS</text>

      {/* trazas: historia (sólida) y pronóstico (punteada) */}
      <polyline points={poly(HISTORY, ptH)} fill="none" stroke={INK} strokeWidth="1.3" />
      <polyline points={poly(FORECAST, ptF)} fill="none" stroke={BLUE} strokeWidth="1.2" strokeDasharray="6 4" />
      <polyline points={poly(HISTORY, qH)} fill="none" stroke={INK2} strokeWidth="1.1" />
      <polyline points={poly(FORECAST, qF)} fill="none" stroke={BLUE} strokeWidth="1" strokeDasharray="6 4" />
      <polyline points={poly(HISTORY, n2H)} fill="none" stroke={INK3} strokeWidth="1.1" />
      <polyline points={poly(FORECAST, n2F)} fill="none" stroke={BLUE} strokeWidth="1" strokeDasharray="6 4" />

      {/* rótulos de canales */}
      <text x="16" y="42" fontSize="8.5" fill={INK} className="svg-mono">PT (psig)</text>
      <text x="16" y="82" fontSize="8.5" fill={INK2} className="svg-mono">Q (Mscf/d)</text>
      <text x="16" y="127" fontSize="8.5" fill={INK3} className="svg-mono">ÍNDICE N2</text>
      {[
        [20, "−24 h"],
        [470, "−12 h"],
        [890, "−1 h"],
        [1190, "+8 h"],
      ].map(([x, t]) => (
        <text key={t} x={x as number} y="148" textAnchor={x === 1190 ? "end" : "middle"} fontSize="8" fill={INK3} className="svg-mono">
          {t as string}
        </text>
      ))}
    </svg>
  );
}
