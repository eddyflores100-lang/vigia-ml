// ---------------------------------------------------------------------------
// VIGÍA · Análisis de declinación de producción (DCA) — Arps (1945)
// q(t) = qi / (1 + b·Di·t)^(1/b)   (hiperbólica; b=1 armónica)
// q(t) = qi·e^(−Di·t)              (exponencial, b=0)
// Ajuste por linealización sobre una malla de b + mínimos cuadrados, EUR por
// integración numérica hasta abandono. Puro y sin DOM: testeable y reusable
// tanto para histórico demo (wellHistory.ts) como para series reales vía puente
// OPC-UA.
// ---------------------------------------------------------------------------

export type ArpsModel = "exponencial" | "hiperbólica" | "armónica";

export interface ArpsFit {
  feasible: boolean;
  reason?: string;
  qi: number; // caudal inicial en t=0 (unidades de la serie, p. ej. Mscf/d)
  Di: number; // tasa de declinación nominal inicial, 1/día
  b: number; // exponente de declinación (0 = exponencial)
  model: ArpsModel;
  r2: number; // R² sobre la escala original
  rmse: number; // RMSE en unidades de caudal
  eur: number; // EUR hasta abandono (qAbandono), tope horizonte 30 años
  eur1y: number; // EUR acumulado a 1 año
  eur5y: number; // EUR acumulado a 5 años
  tAbandonDays: number | null; // tiempo hasta qAbandono (null si excede tope)
  n: number; // puntos usados
}

export interface ArpsOpts {
  qAbandon?: number; // caudal de abandono para el EUR (def: 5 % de qi)
  maxYears?: number; // tope de integración (def: 30 años)
  bGrid?: number[]; // malla de exponentes a explorar
}

const DEFAULT_GRID = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4];
const DAY = 1;
const YEAR = 365 * DAY;

/** Caudal de Arps en el tiempo t (días desde t0). */
export function arpsRate(t: number, qi: number, Di: number, b: number): number {
  if (b === 0) return qi * Math.exp(-Di * t);
  return qi / Math.pow(1 + b * Di * t, 1 / b);
}

/** Modelo legible a partir del exponente. */
export function arpsModelOf(b: number): ArpsModel {
  if (b === 0) return "exponencial";
  if (Math.abs(b - 1) < 1e-9) return "armónica";
  return "hiperbólica";
}

interface LinReg {
  a: number; // intersección
  m: number; // pendiente
}

/** Regresión lineal simple y = a + m·x (mínimos cuadrados). */
function ols(x: number[], y: number[]): LinReg {
  const n = x.length;
  const sx = x.reduce((s, v) => s + v, 0);
  const sy = y.reduce((s, v) => s + v, 0);
  const sxx = x.reduce((s, v) => s + v * v, 0);
  const sxy = x.reduce((s, v, i) => s + v * y[i], 0);
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-12) return { a: sy / n, m: 0 };
  const m = (n * sxy - sx * sy) / d;
  const a = (sy - m * sx) / n;
  return { a, m };
}

/** EUR por trapecios sobre malla fina hasta el abandono (o tope de años). */
function integrateEur(
  qi: number,
  Di: number,
  b: number,
  qAbandon: number,
  maxDays: number,
): { eur: number; tAbandon: number | null } {
  const tEndAband = b === 0
    ? (Di > 0 ? Math.log(qi / qAbandon) / Di : Infinity)
    : (Math.pow(qi / qAbandon, b) - 1) / (b * Di);
  const tAbandon = Number.isFinite(tEndAband) && tEndAband > 0 ? tEndAband : null;
  const tMax = tAbandon !== null ? Math.min(tAbandon, maxDays) : maxDays;
  const steps = 720;
  const dt = tMax / steps;
  let acc = 0;
  let prev = arpsRate(0, qi, Di, b);
  for (let i = 1; i <= steps; i++) {
    const cur = arpsRate(i * dt, qi, Di, b);
    acc += ((prev + cur) / 2) * dt;
    prev = cur;
  }
  return { eur: acc, tAbandon };
}

/** EUR acumulado hasta t días (trapecios, malla ~mensual). */
export function eurTo(qi: number, Di: number, b: number, tDays: number): number {
  if (tDays <= 0) return 0;
  const steps = Math.max(12, Math.min(720, Math.round(tDays)));
  const dt = tDays / steps;
  let acc = 0;
  let prev = arpsRate(0, qi, Di, b);
  for (let i = 1; i <= steps; i++) {
    const cur = arpsRate(i * dt, qi, Di, b);
    acc += ((prev + cur) / 2) * dt;
    prev = cur;
  }
  return acc;
}

const emptyFit = (reason: string, n: number): ArpsFit => ({
  feasible: false,
  reason,
  qi: NaN,
  Di: NaN,
  b: NaN,
  model: "exponencial",
  r2: 0,
  rmse: NaN,
  eur: 0,
  eur1y: 0,
  eur5y: 0,
  tAbandonDays: null,
  n,
});

/**
 * Ajusta Arps a una serie de producción.
 * @param t días (se normaliza internamente al primer punto; no hace falta que
 *        empiece en 0; se admiten pasos no uniformes)
 * @param q caudal en las mismas unidades que se quieren de salida (Mscf/d…)
 */
export function fitArps(t: number[], q: number[], opts: ArpsOpts = {}): ArpsFit {
  const n = Math.min(t.length, q.length);
  if (n < 8) return emptyFit("serie insuficiente (mínimo 8 puntos)", n);

  const t0 = t[0];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const dt = t[i] - t0;
    const v = q[i];
    if (!Number.isFinite(dt) || !Number.isFinite(v) || v <= 0 || dt < 0) continue;
    xs.push(dt);
    ys.push(v);
  }
  if (xs.length < 8) return emptyFit("puntos válidos insuficientes tras saneo", xs.length);

  const span = xs[xs.length - 1];
  if (span <= 0) return emptyFit("rango temporal nulo", xs.length);

  const grid = opts.bGrid && opts.bGrid.length >= 2 ? [...opts.bGrid].sort((a, b) => a - b) : DEFAULT_GRID;
  const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
  const sst = ys.reduce((s, v) => s + (v - mean) * (v - mean), 0) || 1e-9;

  let best: { qi: number; Di: number; b: number; sse: number } | null = null;
  for (const b of grid) {
    let qi: number, Di: number;
    if (b === 0) {
      const { a, m } = ols(xs, ys.map((v) => Math.log(v)));
      if (m >= 0) continue; // sin declinación en esta forma
      qi = Math.exp(a);
      Di = -m;
    } else {
      const { a, m } = ols(xs, ys.map((v) => Math.pow(1 / v, b)));
      if (!(a > 0) || m <= 0) continue;
      qi = Math.pow(a, -1 / b);
      Di = m / (b * a);
    }
    if (!Number.isFinite(qi) || !Number.isFinite(Di) || qi <= 0 || Di <= 0) continue;
    // ruido numérico: una serie plana produce pendientes ~1e-10 que no son
    // declinación física (umbral: 0.001 %/día ≈ 0.03 %/mes)
    if (Di < 1e-8) continue;

    let sse = 0;
    for (let i = 0; i < xs.length; i++) {
      const e = ys[i] - arpsRate(xs[i], qi, Di, b);
      sse += e * e;
    }
    // el ajuste debe explicar más varianza que predecir la media
    if (sse >= sst) continue;
    if (!best || sse < best.sse) best = { qi, Di, b, sse };
  }

  if (!best) return emptyFit("sin declinación ajustable (serie plana o creciente)", xs.length);

  const rmse = Math.sqrt(best.sse / xs.length);
  const r2 = 1 - best.sse / sst;

  const qAbandon = opts.qAbandon ?? best.qi * 0.05;
  const maxYears = opts.maxYears ?? 30;
  const maxDays = maxYears * YEAR;
  const { eur, tAbandon } = integrateEur(best.qi, best.Di, best.b, qAbandon, maxDays);

  return {
    feasible: true,
    qi: best.qi,
    Di: best.Di,
    b: best.b,
    model: arpsModelOf(best.b),
    r2,
    rmse,
    eur,
    eur1y: eurTo(best.qi, best.Di, best.b, YEAR),
    eur5y: eurTo(best.qi, best.Di, best.b, 5 * YEAR),
    tAbandonDays: tAbandon,
    n: xs.length,
  };
}

/** Declinación efectiva inicial mensual en %: (qi − q(30 d)) / qi. */
export function monthlyDeclinePct(fit: ArpsFit): number {
  if (!fit.feasible) return NaN;
  const q30 = arpsRate(30, fit.qi, fit.Di, fit.b);
  return ((fit.qi - q30) / fit.qi) * 100;
}

/**
 * Serie de ajuste + pronóstico a partir de un fit.
 * @param fromX día inicial (días desde t0 del ajuste, p. ej. el último dato)
 * @param toX   día final del pronóstico
 * @param stepDays paso de la serie (def: 15)
 */
export function arpsSeries(fit: ArpsFit, fromX: number, toX: number, stepDays = 15): { t: number[]; q: number[] } {
  const t: number[] = [];
  const q: number[] = [];
  if (!fit.feasible || toX <= fromX) return { t, q };
  const steps = Math.max(2, Math.min(240, Math.ceil((toX - fromX) / stepDays) + 1));
  for (let i = 0; i < steps; i++) {
    const x = fromX + ((toX - fromX) * i) / (steps - 1);
    t.push(x);
    q.push(arpsRate(x, fit.qi, fit.Di, fit.b));
  }
  return { t, q };
}
