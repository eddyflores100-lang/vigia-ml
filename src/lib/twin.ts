// ---------------------------------------------------------------------------
// VIGÍA · calibración del gemelo digital (roadmap comercial #8)
// El gemelo es la respuesta determinista del pozo: caudal vs apertura del
// choke (exponente k), P·tubing vs caudal (pendiente de drawdown a) y
// P·casing vs caudal (pendiente b). La calibración ajusta (k, a, b) por
// mínimos cuadrados sobre la ventana reciente y reporta la calidad del
// ajuste (NRMSE por salida, ponderado) y la brecha actual del gemelo.
// Requiere excitación: si el choke apenas se movió en la ventana, la
// sensibilidad no es observable y la calibración se rechaza (en lugar de
// inventar parámetros). Puro, sin DOM: testeable.
// ---------------------------------------------------------------------------

import type { Sample } from "./sim";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface TwinRefs {
  chokeRef: number; // % — centro de la ventana
  qRef: number; // Mscf/d
  ptRef: number; // psi
  pcRef: number; // psi
}

export interface TwinCalibration {
  feasible: boolean;
  reason?: string;
  k: number; // exponente q ∝ choke^k (0.3..1.3 típico en chokes)
  a: number; // psi por Mscf/d — drawdown: pt cae al aumentar q
  b: number; // psi por Mscf/d — el casing gana presión al aumentar q
  refs: TwinRefs;
  n: number; // muestras usadas
  chokeRange: number; // % recorrido del choke en la ventana (excitación)
  nrmseQ: number; // error normalizado 0..~1
  nrmsePt: number;
  nrmsePc: number;
  quality: number; // 0..100 ponderado (q 60 %, pt 25 %, pc 15 %)
  grade: "A" | "B" | "C" | "D";
  verdict: string;
}

export interface TwinOpts {
  window?: number; // muestras (def 240 min)
  kGrid?: number[]; // malla de exponentes (def 0.3..1.3 paso 0.05)
  minChokeRange?: number; // % mínimo de excitación (def 3)
}

const DEFAULT_K_GRID = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];

function ols(x: number[], y: number[]): { a: number; m: number } {
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

const nrmseOf = (actual: number[], pred: number[]): number => {
  const n = actual.length;
  const mean = actual.reduce((s, v) => s + v, 0) / n;
  const sst = actual.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  const sse = actual.reduce((s, v, i) => s + (v - pred[i]) * (v - pred[i]), 0);
  // serie plana: la normalización por σ explota → usar el rango
  const range = Math.max(...actual) - Math.min(...actual) || Math.abs(mean) || 1;
  return Math.sqrt(sse / n) / Math.max(range, Math.sqrt(sst / n) || range, 1e-9);
};

/** Caudal predicho por el gemelo calibrado a una apertura dada. */
export function twinRateAt(chokePct: number, cal: TwinCalibration): number {
  if (!cal.feasible) return NaN;
  const ratio = Math.max(1e-6, chokePct / Math.max(1, cal.refs.chokeRef));
  return cal.refs.qRef * Math.pow(ratio, cal.k);
}

/** P·tubing predicha por el gemelo a un caudal dado. */
export function twinPtAt(q: number, cal: TwinCalibration): number {
  if (!cal.feasible) return NaN;
  return cal.refs.ptRef - cal.a * (q - cal.refs.qRef);
}

/** P·casing predicha por el gemelo a un caudal dado. */
export function twinPcAt(q: number, cal: TwinCalibration): number {
  if (!cal.feasible) return NaN;
  return cal.refs.pcRef + cal.b * (q - cal.refs.qRef);
}

/** Brecha del gemelo en una muestra: (medido − gemelo)/gemelo · 100. */
export function twinGapPct(s: Sample, cal: TwinCalibration): number {
  const qTwin = twinRateAt(s.choke, cal);
  if (!Number.isFinite(qTwin) || qTwin <= 1) return NaN;
  return ((s.q - qTwin) / qTwin) * 100;
}

const reject = (reason: string, n: number, chokeRange: number): TwinCalibration => ({
  feasible: false,
  reason,
  k: NaN,
  a: NaN,
  b: NaN,
  refs: { chokeRef: NaN, qRef: NaN, ptRef: NaN, pcRef: NaN },
  n,
  chokeRange,
  nrmseQ: NaN,
  nrmsePt: NaN,
  nrmsePc: NaN,
  quality: 0,
  grade: "D",
  verdict: reason,
});

/**
 * Calibra el gemelo sobre la ventana reciente del buffer.
 * Lógica de aceptación: la sensibilidad caudal↔choke solo es observable si el
 * choke se movió lo suficiente (excitación mínima); con señal plana se
 * rechaza con diagnóstico explícito en lugar de reportar parámetros falsos.
 */
export function calibrateTwin(samples: Sample[], opts: TwinOpts = {}): TwinCalibration {
  const winLen = opts.window ?? 240;
  const grid = opts.kGrid && opts.kGrid.length >= 2 ? opts.kGrid : DEFAULT_K_GRID;
  const minRange = opts.minChokeRange ?? 3;

  const win = samples.slice(-winLen).filter(
    (s) =>
      Number.isFinite(s.q) && Number.isFinite(s.choke) && Number.isFinite(s.pt) && Number.isFinite(s.pc) &&
      s.q > 1 && s.choke >= 2 && s.choke <= 100,
  );
  const chokeVals = win.map((s) => s.choke);
  const chokeRange = chokeVals.length ? Math.max(...chokeVals) - Math.min(...chokeVals) : 0;
  if (win.length < 40) return reject("ventana insuficiente (mínimo 40 muestras válidas)", win.length, chokeRange);
  if (chokeRange < minRange)
    return reject(
      `excitación insuficiente: el choke solo recorrió ${chokeRange.toFixed(1)} % en la ventana (mínimo ${minRange} %)`,
      win.length,
      chokeRange,
    );

  const qMean = win.reduce((s, v) => s + v.q, 0) / win.length;
  const chokeMean = chokeVals.reduce((s, v) => s + v, 0) / win.length;
  const ptMean = win.reduce((s, v) => s + v.pt, 0) / win.length;
  const pcMean = win.reduce((s, v) => s + v.pc, 0) / win.length;
  const refs: TwinRefs = { chokeRef: chokeMean, qRef: qMean, ptRef: ptMean, pcRef: pcMean };

  // --- 1) exponente k: q/qRef ≈ (choke/chokeRef)^k  (malla + OLS sin término libre)
  let bestK = 1;
  let bestSse = Infinity;
  for (const k of grid) {
    let sse = 0;
    let valid = 0;
    for (const s of win) {
      const ratio = Math.max(1e-6, s.choke / Math.max(1, chokeMean));
      const pred = qMean * Math.pow(ratio, k);
      if (!Number.isFinite(pred)) continue;
      sse += (s.q - pred) * (s.q - pred);
      valid++;
    }
    if (valid < win.length * 0.9) continue;
    if (sse < bestSse) {
      bestSse = sse;
      bestK = k;
    }
  }

  // --- 2) pendientes a y b: presión vs Δq
  const dq = win.map((s) => s.q - qMean);
  const ptOls = ols(dq, win.map((s) => s.pt));
  const pcOls = ols(dq, win.map((s) => s.pc));
  // físicamente: pt cae con más caudal (a ≥ 0); el casing gana con menos toma (b ≥ 0)
  const a = clamp(-ptOls.m, 0, 0.5);
  const b = clamp(pcOls.m, 0, 0.5);

  // --- 3) calidad: NRMSE por salida sobre el modelo completo
  const predQ = win.map((s) => twinRateAt(s.choke, { ...cal0, feasible: true, k: bestK, refs }));
  function ptRefAt(q: number) { return ptMean - a * (q - qMean); }
  function pcRefAt(q: number) { return pcMean + b * (q - qMean); }
  const predPt = win.map((_s, i) => ptRefAt(predQ[i]));
  const predPc = win.map((_s, i) => pcRefAt(predQ[i]));

  const nrmseQ = nrmseOf(win.map((s) => s.q), predQ);
  const nrmsePt = nrmseOf(win.map((s) => s.pt), predPt.filter(Number.isFinite));
  const nrmsePc = nrmseOf(win.map((s) => s.pc), predPc.filter(Number.isFinite));

  const quality = Math.round(clamp(100 * (1 - 0.6 * nrmseQ - 0.25 * nrmsePt - 0.15 * nrmsePc), 0, 100));
  const grade: TwinCalibration["grade"] = quality >= 85 ? "A" : quality >= 70 ? "B" : quality >= 50 ? "C" : "D";

  const verdict =
    grade === "A"
      ? "Gemelo alineado: la respuesta del pozo se reproduce con el modelo calibrado."
      : grade === "B"
        ? "Gemelo utilizable: residuos moderados, apto para brechas y detección de deriva."
        : grade === "C"
          ? "Gemelo degradado: recalibrar con una ventana con más excitación o revisar instrumentos."
          : "Gemelo no confiable: el modelo no reproduce la respuesta observada del pozo.";

  return {
    feasible: true,
    k: bestK,
    a,
    b,
    refs,
    n: win.length,
    chokeRange,
    nrmseQ,
    nrmsePt,
    nrmsePc,
    quality,
    grade,
    verdict,
  };
}

// objeto mínimo interno para reutilizar twinRateAt dentro de calibrateTwin
const cal0: TwinCalibration = {
  feasible: true,
  k: 1,
  a: 0,
  b: 0,
  refs: { chokeRef: 50, qRef: 1, ptRef: 0, pcRef: 0 },
  n: 0,
  chokeRange: 0,
  nrmseQ: 0,
  nrmsePt: 0,
  nrmsePc: 0,
  quality: 0,
  grade: "A",
  verdict: "",
};

/**
 * Brecha reciente del gemelo: media de |brecha| en los últimos N minutos y
 * bandera de desalineación (brecha media > umbral %). Útil para disparar
 * recalibración o revisión de instrumentos.
 */
export interface TwinGap {
  gapPct: number; // brecha media con signo (medido − gemelo)/gemelo
  absGapPct: number;
  n: number;
  misaligned: boolean;
}

export function twinGapRecent(samples: Sample[], cal: TwinCalibration, lastN = 30, thresholdPct = 6): TwinGap {
  const gaps = samples.slice(-lastN).map((s) => twinGapPct(s, cal)).filter(Number.isFinite);
  if (gaps.length === 0) return { gapPct: NaN, absGapPct: NaN, n: 0, misaligned: false };
  const gapPct = gaps.reduce((s, v) => s + v, 0) / gaps.length;
  const absGapPct = gaps.reduce((s, v) => s + Math.abs(v), 0) / gaps.length;
  return { gapPct, absGapPct, n: gaps.length, misaligned: Math.abs(gapPct) > thresholdPct };
}
