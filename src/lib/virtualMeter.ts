// ---------------------------------------------------------------------------
// VIGÍA · medición virtual por choke (soft-sensor de caudal)
// Fórmula de Bean para flujo crítico a través de estrangulador (Guo &
// Ghalambor, "Well Productivity Handbook"; equivalente simplificado de la
// ISO/API 14B para chokes):
//     Q [Mscf/d] = 879 · Cd · d² · P1 · sqrt( 1 / (γg · T_R) )
// con P1 en psia (aguas arriba), T_R en °R (T_F + 460), d en pulgadas y γg la
// gravedad específica del gas (aire = 1).
// Para flujo subcrítico (P2/P1 > 0.70) se aplica un factor parabólico
// f_sub = sqrt(1 − ((r − r_c)/(1 − r_c))²) que vale 1 en r_c y 0 en r = 1.
// Modo de uso en planta: calibrar el Cd efectivo contra el medidor fiscal
// (calibrateCd) y usar la estimación como respaldo cuando el medidor decae
// (meterCheck marca la divergencia sostenida). Puro, sin DOM: testeable.
// ---------------------------------------------------------------------------

export const RATIO_CRITICAL = 0.7; // relación de presiones crítica para gas natural (r_c)
export const SG_DEMO = 0.68; // gravedad específica del gas de demostración
export const PSI_ATM = 14.7; // psia atmosférica: las tags llegan en psig

export interface VmInput {
  chokePct: number; // apertura del choke 0..100
  pUpPsig: number; // presión aguas arriba (psig) — tubing en cabeza de pozo
  pDownPsig: number; // presión aguas abajo (psig) — presión de línea
  tempC: number; // temperatura de flujo (°C)
  sg?: number; // gravedad específica del gas (def 0.68)
  chokeDiaIn: number; // diámetro efectivo del choke a apertura completa (in)
  cd?: number; // coeficiente de descarga (def 0.82)
}

export interface VmResult {
  valid: boolean;
  reason?: string;
  qVirtual: number; // Mscf/d
  ratio: number; // P2/P1
  regime: "crítico" | "subcrítico";
  subFactor: number; // factor de corrección subcrítico aplicado (1 en crítico)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Diámetro efectivo a una apertura dada: el área crece ~lineal con la apertura. */
export function effectiveDia(diaNominalIn: number, chokePct: number): number {
  const pct = clamp(chokePct, 0, 100) / 100;
  if (!Number.isFinite(diaNominalIn) || diaNominalIn <= 0) return 0;
  return diaNominalIn * Math.sqrt(pct);
}

/** Fórmula de Bean con Cd = 1 (flujo crítico puro). */
export function beanRate(P1Psia: number, tempC: number, sg: number, diaIn: number): number {
  const tR = tempC + 460; // °R desde °C
  return 879 * diaIn * diaIn * P1Psia * Math.sqrt(1 / (sg * tR));
}

/** Valida rangos físicos de la entrada; devuelve razón de rechazo o null. */
function validate(inp: VmInput): string | null {
  const sg = inp.sg ?? SG_DEMO;
  const cd = inp.cd ?? 0.82;
  if (!Number.isFinite(inp.pUpPsig) || inp.pUpPsig + PSI_ATM <= 0)
    return "presión aguas arriba no física";
  if (!Number.isFinite(inp.tempC) || inp.tempC < -40 || inp.tempC > 200)
    return "temperatura fuera de rango físico";
  if (!Number.isFinite(sg) || sg < 0.5 || sg > 1.2) return "gravedad específica fuera de rango";
  if (!Number.isFinite(inp.chokeDiaIn) || inp.chokeDiaIn <= 0) return "diámetro de choke no físico";
  if (!Number.isFinite(cd) || cd < 0.5 || cd > 1.0) return "coeficiente de descarga fuera de rango";
  if (inp.chokePct <= 0) return "choque cerrado";
  return null;
}

/**
 * Estimación de caudal por el choke. Si la relación de presiones es superior
 * a la crítica, aplica el factor subcrítico (el choke ya no absorbe todo el
 * ΔP y la fórmula crítica sobreestimaría).
 */
export function virtualRate(inp: VmInput): VmResult {
  const bad = validate(inp);
  if (bad) {
    return { valid: false, reason: bad, qVirtual: 0, ratio: NaN, regime: "crítico", subFactor: 0 };
  }
  const sg = inp.sg ?? SG_DEMO;
  const cd = inp.cd ?? 0.82;
  const p1 = inp.pUpPsig + PSI_ATM;
  const p2 = Math.max(0, (inp.pDownPsig || 0) + PSI_ATM);
  const ratio = clamp(p2 / p1, 0, 1); // ratio 1 = sin flujo neto a través del choke
  const d = effectiveDia(inp.chokeDiaIn, inp.chokePct);
  const qCrit = beanRate(p1, inp.tempC, sg, d);
  const regime: VmResult["regime"] = ratio > RATIO_CRITICAL ? "subcrítico" : "crítico";
  const subFactor =
    ratio > RATIO_CRITICAL
      ? Math.sqrt(Math.max(0, 1 - Math.pow((ratio - RATIO_CRITICAL) / (1 - RATIO_CRITICAL), 2)))
      : 1;
  return {
    valid: true,
    qVirtual: cd * qCrit * subFactor,
    ratio,
    regime,
    subFactor,
  };
}

/**
 * Cd efectivo del pozo: qué coeficiente de descarga hace que la fórmula
 * reproduzca el caudal del medidor en las condiciones actuales.
 */
export function calibrateCd(inp: VmInput, qMeasured: number): number | null {
  if (!Number.isFinite(qMeasured) || qMeasured <= 0 || validate(inp)) return null;
  const sg = inp.sg ?? SG_DEMO;
  const p1 = inp.pUpPsig + PSI_ATM;
  const p2 = Math.max(0, (inp.pDownPsig || 0) + PSI_ATM);
  const ratio = clamp(p2 / p1, 0, 1);
  const subFactor =
    ratio > RATIO_CRITICAL
      ? Math.sqrt(Math.max(0, 1 - Math.pow((ratio - RATIO_CRITICAL) / (1 - RATIO_CRITICAL), 2)))
      : 1;
  if (subFactor <= 0) return null;
  const d = effectiveDia(inp.chokeDiaIn, inp.chokePct);
  const qCd1 = beanRate(p1, inp.tempC, sg, d) * subFactor;
  const cd = qMeasured / qCd1;
  // fuera del rango físico de un choke real la calibración no es defendible
  return cd >= 0.5 && cd <= 1.0 ? cd : null;
}

export interface MeterCheckResult {
  qVirtual: number;
  qMeasured: number;
  devPct: number; // (medido − virtual) / virtual · 100
  flag: boolean; // true si la divergencia supera el umbral
  cdCalibrated: number | null;
}

/**
 * Contraste medidor vs medición virtual. Una divergencia sostenida > 5 %
 * sugiere decaimiento del medidor (FT) o un cambio de régimen no capturado.
 */
export function meterCheck(
  inp: VmInput,
  qMeasured: number,
  cdCalibrated?: number | null,
  devThresholdPct = 5,
): MeterCheckResult {
  const cd = cdCalibrated ?? calibrateCd(inp, qMeasured) ?? inp.cd ?? 0.82;
  const r = virtualRate({ ...inp, cd });
  const qMeasuredSafe = Number.isFinite(qMeasured) ? Math.max(0, qMeasured) : 0;
  const devPct = r.qVirtual > 1 ? ((qMeasuredSafe - r.qVirtual) / r.qVirtual) * 100 : 0;
  return {
    qVirtual: r.qVirtual,
    qMeasured: qMeasuredSafe,
    devPct,
    flag: Math.abs(devPct) > devThresholdPct,
    cdCalibrated: cd,
  };
}

/**
 * Diámetro nominal sugerido para que, a la apertura y presión base del pozo,
 * el Cd calibrado quede cerca del 0.82 típico de un choke de aguja y jaula.
 */
export function suggestDia(
  baseQ: number,
  basePUpPsig: number,
  basePDownPsig: number,
  baseTempC: number,
  chokePct: number,
  sg = SG_DEMO,
  cdTarget = 0.82,
): number {
  const p1 = basePUpPsig + PSI_ATM;
  const p2 = Math.max(0, basePDownPsig + PSI_ATM);
  const ratio = clamp(p2 / p1, 0, 0.999);
  const subFactor =
    ratio > RATIO_CRITICAL
      ? Math.sqrt(Math.max(0, 1 - Math.pow((ratio - RATIO_CRITICAL) / (1 - RATIO_CRITICAL), 2)))
      : 1;
  const dFullSq =
    baseQ /
    Math.max(1e-9, cdTarget * 879 * p1 * Math.sqrt(1 / (sg * (baseTempC + 460))) * subFactor);
  const dFull = Math.sqrt(Math.max(1e-6, dFullSq)) / Math.sqrt(Math.max(1e-6, chokePct / 100));
  // chokes de superficie típicos: 1/8" .. 2"
  return clamp(dFull, 0.125, 2);
}
