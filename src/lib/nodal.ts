// ---------------------------------------------------------------------------
// VIGÍA · análisis nodal en el nodo de cabezal (v0.12)
// Análisis de sistemas clásico (IPR + VLP) llevado al nodo de cabezal:
//   · IPR (aporte): respuesta del yacimiento + tubing hacia el nodo, estimada
//     por regresión pt~q sobre la ventana reciente (misma pendiente «a» que
//     calibra el gemelo digital, sin requerir excitación del choke).
//   · VLP (demanda): presión de cabezal que el sistema de descarga exige para
//     mover cada caudal a través del choke a la apertura actual — inversa de
//     la fórmula de Bean con factor subcrítico (virtualMeter.ts), con Cd
//     calibrado contra el punto operativo medido.
// El punto de intersección es el punto de operación natural; la ventana
// operativa se acota con la velocidad crítica de Turner (mínimo) y el límite
// de erosión API RP 14E (máximo). Puro, sin DOM: testeable.
// ---------------------------------------------------------------------------

import type { Sample, VarKey } from "./sim";
import { RATIO_CRITICAL, SG_DEMO, beanRate, calibrateCd, effectiveDia, suggestDia, PSI_ATM } from "./virtualMeter";
import { turnerCriticalRate, erosionLimitRate } from "./setpoints";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const TUBING_ID_DEFAULT = 2.441; // 2-7/8" EUE (coherente con setpoints.ts)

export interface NodalPoint {
  q: number; // Mscf/d
  pt: number; // psig exigido/aportado en el nodo
}

export interface NodalResult {
  feasible: boolean;
  reason?: string;
  ipr: NodalPoint[];
  vlp: NodalPoint[];
  qOp: number; // caudal del punto de operación
  ptOp: number; // presión del nodo en el punto de operación
  aSlope: number; // psi por Mscf/d (pendiente del IPR)
  r2: number; // calidad del ajuste lineal del IPR
  cd: number | null; // Cd calibrado en el punto actual (null → 0.82 por defecto)
  chokePct: number;
  turnerQ: number | null; // mínimo por ascenso de líquidos
  erosionQ: number | null; // máximo por erosión API RP 14E
  windowOk: boolean; // qOp dentro de [turner, erosion]
  current: { q: number; pt: number }; // punto medido actual
}

export interface NodalOpts {
  window?: number; // muestras para el IPR (def 240)
  gridN?: number; // puntos de las curvas (def 48)
  tubingIdIn?: number;
  sg?: number;
}

function ols(x: number[], y: number[]): { m: number; b: number; r2: number } {
  const n = x.length;
  const sx = x.reduce((s, v) => s + v, 0);
  const sy = y.reduce((s, v) => s + v, 0);
  const sxx = x.reduce((s, v) => s + v * v, 0);
  const sxy = x.reduce((s, v, i) => s + v * y[i], 0);
  const d = n * sxx - sx * sx;
  if (Math.abs(d) < 1e-12) return { m: 0, b: sy / n, r2: 0 };
  const m = (n * sxy - sx * sy) / d;
  const b = (sy - m * sx) / n;
  const mean = sy / n;
  const sst = y.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  const sse = y.reduce((s, v, i) => s + (v - (m * x[i] + b)) * (v - (m * x[i] + b)), 0);
  return { m, b, r2: sst > 1e-9 ? clamp(1 - sse / sst, 0, 1) : 0 };
}

/** Presión de cabezal requerida (psia) para pasar q por el choke a apertura
 *  dada, con descarga a p2Psia. Inversa de Bean + factor subcrítico. */
export function requiredUpstream(
  qMscfD: number,
  p2Psia: number,
  tempC: number,
  chokeDiaIn: number,
  chokePct: number,
  cd: number,
  sg: number,
): number {
  if (qMscfD <= 0) return p2Psia;
  const d = effectiveDia(chokeDiaIn, chokePct);
  if (d <= 0) return NaN;
  const k = cd * 879 * d * d * Math.sqrt(1 / (sg * (tempC + 460)));
  if (k <= 0) return NaN;
  // flujo máximo alcanzable en régimen subcrítico (P1 = P2/rc)
  const qMaxSub = k * (p2Psia / RATIO_CRITICAL);
  if (qMscfD > qMaxSub) return qMscfD / k; // rama crítica (lineal en P1)
  // rama subcrítica: bisección de q = K·P1·f_sub(P2/P1)
  let lo = p2Psia;
  let hi = (p2Psia / RATIO_CRITICAL) * 1.0000001;
  const f = (p1: number) => {
    const r = clamp(p2Psia / p1, 0, 1);
    const sub = r > RATIO_CRITICAL ? Math.sqrt(Math.max(0, 1 - Math.pow((r - RATIO_CRITICAL) / (1 - RATIO_CRITICAL), 2))) : 1;
    return k * p1 * sub;
  };
  if (f(lo) > qMscfD) return p2Psia; // el choke no restringe a este caudal
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < qMscfD) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Análisis nodal del pozo sobre la ventana reciente.
 */
export function nodalAnalysis(samples: Sample[], base: Record<VarKey, number>, opts: NodalOpts = {}): NodalResult {
  const winLen = opts.window ?? 240;
  const gridN = opts.gridN ?? 48;
  const tubingId = opts.tubingIdIn ?? TUBING_ID_DEFAULT;
  const sg = opts.sg ?? SG_DEMO;

  const last = samples[samples.length - 1];
  if (!last) {
    return reject("sin muestras en la ventana", base);
  }

  const win = samples.slice(-winLen).filter(
    (s) => Number.isFinite(s.pt) && Number.isFinite(s.q) && s.q > 1 && s.pt > 0,
  );
  if (win.length < 40) {
    return reject(`ventana insuficiente (${win.length} muestras válidas, mínimo 40)`, base);
  }

  // --- IPR: pt = b − a·q (el aporte cae con más caudal) --------------------
  const fit = ols(win.map((s) => s.q), win.map((s) => s.pt));
  const a = clamp(-fit.m, 0, 0.5); // psi por Mscf/d, físicamente ≥ 0
  const qMean = win.reduce((s, v) => s + v.q, 0) / win.length;
  const ptMean = win.reduce((s, v) => s + v.pt, 0) / win.length;
  const iprPt = (q: number) => Math.max(0, ptMean - a * (q - qMean));
  // caudal donde el aporte se agota (pt = 0)
  const qIprMax = a > 1e-9 ? qMean + ptMean / a : qMean * 1.6 + 1;

  // --- VLP: demanda del choke a la apertura actual --------------------------
  const chokePct = clamp(last.choke, 2, 100);
  const dia = suggestDia(base.q, base.pt, base.pl, base.temp, base.choke);
  const cd = calibrateCd(
    { chokePct: last.choke, pUpPsig: last.pt, pDownPsig: last.pl, tempC: last.temp, chokeDiaIn: dia, sg },
    last.q,
  );
  const cdEff = cd ?? 0.82;
  const p2Psia = Math.max(0, last.pl) + PSI_ATM;
  const vlpPt = (q: number) =>
    requiredUpstream(q, p2Psia, last.temp, dia, chokePct, cdEff, sg) - PSI_ATM; // → psig

  // --- punto de operación: intersección IPR ∩ VLP ---------------------------
  const qHi = Math.max(qIprMax, last.q * 1.5);
  const diff = (q: number) => iprPt(q) - vlpPt(q);
  let qOp = NaN;
  if (diff(0) > 0 && diff(qHi) < 0) {
    let lo = 0;
    let hi = qHi;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (diff(mid) > 0) lo = mid;
      else hi = mid;
    }
    qOp = (lo + hi) / 2;
  } else if (Math.abs(diff(0)) < 1e-9) {
    qOp = 0;
  }

  // --- curvas para la gráfica ----------------------------------------------
  const qMaxPlot = Math.max(qIprMax, Number.isFinite(qOp) ? qOp * 1.25 : 0, last.q * 1.4);
  const ipr: NodalPoint[] = [];
  const vlp: NodalPoint[] = [];
  for (let i = 0; i <= gridN; i++) {
    const q = (qMaxPlot * i) / gridN;
    ipr.push({ q, pt: iprPt(q) });
    const pv = vlpPt(q);
    if (Number.isFinite(pv) && pv <= 15000) vlp.push({ q, pt: pv });
  }

  // --- ventana operativa ----------------------------------------------------
  const turnerQ = turnerCriticalRate(last.pt, last.temp, tubingId, sg);
  const erosionQ = erosionLimitRate(last.pt, last.temp, tubingId, sg);
  const windowOk =
    Number.isFinite(qOp) &&
    (!Number.isFinite(turnerQ) || qOp >= turnerQ * 0.98) &&
    (!Number.isFinite(erosionQ) || qOp <= erosionQ * 1.02);

  if (!Number.isFinite(qOp)) {
    return {
      feasible: false,
      reason: "las curvas no se cruzan en el dominio físico (¿choke cerrado o línea sobre el aporte del pozo?)",
      ipr,
      vlp,
      qOp: NaN,
      ptOp: NaN,
      aSlope: a,
      r2: fit.r2,
      cd,
      chokePct,
      turnerQ: Number.isFinite(turnerQ) ? turnerQ : null,
      erosionQ: Number.isFinite(erosionQ) ? erosionQ : null,
      windowOk: false,
      current: { q: last.q, pt: last.pt },
    };
  }

  return {
    feasible: true,
    ipr,
    vlp,
    qOp,
    ptOp: iprPt(qOp),
    aSlope: a,
    r2: fit.r2,
    cd,
    chokePct,
    turnerQ: Number.isFinite(turnerQ) ? turnerQ : null,
    erosionQ: Number.isFinite(erosionQ) ? erosionQ : null,
    windowOk,
    current: { q: last.q, pt: last.pt },
  };
}

function reject(reason: string, _base: Record<VarKey, number>): NodalResult {
  return {
    feasible: false,
    reason,
    ipr: [],
    vlp: [],
    qOp: NaN,
    ptOp: NaN,
    aSlope: NaN,
    r2: 0,
    cd: null,
    chokePct: NaN,
    turnerQ: null,
    erosionQ: null,
    windowOk: false,
    current: { q: NaN, pt: NaN },
  };
}

/** Bean puro reexportado para tests del inverso. */
export const beanForward = beanRate;
