// ---------------------------------------------------------------------------
// VIGÍA · asesor de setpoints (roadmap comercial #5)
// Optimiza la apertura del choke balanceando producción y riesgo de falla:
//     utilidad(c) = q(c) · S(horizonte | c)
// donde q(c) proviene de la medición virtual (fórmula de Bean + factor
// subcrítico, coherente con virtualMeter.ts) y S(horizonte | c) es la
// supervivencia Weibull condicional con covariables AFT recalculadas para el
// candidato (rul.ts): cerrar el choke por debajo de la velocidad crítica de
// Turner acelera la acumulación de líquidos; abrirlo más allá del límite de
// erosión (API RP 14E) acelera el desgaste del choke y la línea.
// Restricciones duras: margen de ascenso (Turner 1969 con ajuste del 20 %),
// límite de erosión y rango físico del choke. Puro, sin DOM: testeable.
// ---------------------------------------------------------------------------

import type { Sample, VarKey } from "./sim";
import { virtualRate, calibrateCd, suggestDia, PSI_ATM, SG_DEMO } from "./virtualMeter";
import { priorFor, etaEffective, survivalAt } from "./rul";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ------------------------------ física de referencia ------------------------

/** Densidad del gas en condiciones de línea, lb/ft³: ρg = 2.7·γg·P/(T·Z). */
export function gasDensityLbFt3(pPsig: number, tempC: number, sg = SG_DEMO, z = 0.9): number {
  const p = (pPsig + PSI_ATM);
  const tR = tempC + 460;
  if (p <= 0 || tR <= 0) return NaN;
  return (2.7 * sg * p) / (tR * z);
}

/**
 * Caudal crítico de ascenso (Turner 1969 con el ajuste del 20 %, σ en
 * dynes/cm y densidades en lb/ft³ → v_c en ft/s):
 *     v_c = 6.6 · σ^0.25 · (ρL − ρg)^0.25 / √ρg
 * convertido a caudal estándar con el área del tubing:
 *     q = v_c · A · 86400 · (P·520)/(14.65·T·Z)  [scf/d]
 * Por debajo de este caudal el gas no arrastra líquidos (liquid loading).
 */
export function turnerCriticalRate(
  pTubPsig: number,
  tempC: number,
  tubingIdIn: number,
  sg = SG_DEMO,
  sigmaDyneCm = 40,
  rhoLiquidLbFt3 = 66,
  z = 0.9,
): number {
  const rhoG = gasDensityLbFt3(pTubPsig, tempC, sg, z);
  if (!Number.isFinite(rhoG) || rhoG <= 0.01 || tubingIdIn <= 0) return NaN;
  const vC =
    (6.6 * Math.pow(sigmaDyneCm, 0.25) * Math.pow(Math.max(1, rhoLiquidLbFt3 - rhoG), 0.25)) /
    Math.sqrt(rhoG); // ft/s
  const areaFt2 = Math.PI * Math.pow(tubingIdIn / 2 / 12, 2);
  const pAbs = pTubPsig + PSI_ATM;
  const tR = tempC + 460;
  const qScfd = vC * areaFt2 * 86400 * ((pAbs * 520) / (14.65 * tR * z));
  return qScfd / 1000; // Mscf/d
}

/**
 * Límite de erosión API RP 14E: v_e = C/√ρg (ft/s), C = 100 para servicio
 * continuo sin sólidos. Devuelve el caudal estándar equivalente (Mscf/d).
 */
export function erosionLimitRate(
  pTubPsig: number,
  tempC: number,
  tubingIdIn: number,
  sg = SG_DEMO,
  cFactor = 100,
  z = 0.9,
): number {
  const rhoG = gasDensityLbFt3(pTubPsig, tempC, sg, z);
  if (!Number.isFinite(rhoG) || rhoG <= 0.01 || tubingIdIn <= 0) return NaN;
  const vE = cFactor / Math.sqrt(rhoG); // ft/s
  const areaFt2 = Math.PI * Math.pow(tubingIdIn / 2 / 12, 2);
  const pAbs = pTubPsig + PSI_ATM;
  const tR = tempC + 460;
  const qScfd = vE * areaFt2 * 86400 * ((pAbs * 520) / (14.65 * tR * z));
  return qScfd / 1000; // Mscf/d
}

// --------------------------------- asesor -----------------------------------

export interface SetpointConstraint {
  id: "lift" | "erosion" | "subcritico" | "rango";
  label: string;
  ok: boolean; // en el setpoint recomendado
  detail: string; // texto humano
}

export interface SetpointAdvice {
  feasible: boolean;
  reason?: string;
  chokeNow: number; // % actual
  chokeRec: number; // % recomendado
  qNow: number; // Mscf/d medido (última muestra)
  qRec: number; // Mscf/d esperado al setpoint recomendado
  gainPct: number; // (qRec − qNow)/qNow · 100
  expectedDeltaMscf: number; // volumen adicional esperado al horizonte (Mscf)
  survNow: number; // S(horizonte) en el setpoint actual
  survRec: number; // S(horizonte) en el recomendado
  qTurner: number; // caudal crítico de ascenso (Mscf/d)
  qErosion: number; // límite de erosión (Mscf/d)
  horizonH: number;
  cd: number; // Cd calibrado usado para la curva q(choke)
  constraints: SetpointConstraint[];
  rationale: string[];
}

export interface SetpointInput {
  samples: Sample[];
  base: Record<VarKey, number>;
  diagId: string; // id del diagnóstico top ("normal" si no hay falla)
  diagConf: number; // 0..1
  anomScore: number; // 0..100
  chokeDiaIn?: number; // diámetro nominal del choke (def: sugerido desde base)
  tubingIdIn?: number; // diámetro interno del tubing (def 2.441" = 2-7/8" EUE)
  horizonH?: number; // horizonte de optimización (def 24 h)
  grid?: [number, number, number]; // [inicio, fin, paso] del choke (def 15..95×1)
  sg?: number;
}

const TUBING_ID_DEFAULT = 2.441; // pulgadas — 2-7/8" EUE

/** q(c) con el mismo modelo físico del soft-sensor (Bean + subcrítico). */
function qAtChoke(
  chokePct: number,
  chokeDiaIn: number,
  cd: number,
  pUp: number,
  pDown: number,
  tempC: number,
  sg: number,
): number {
  const r = virtualRate({ chokePct, pUpPsig: pUp, pDownPsig: pDown, tempC, chokeDiaIn, cd, sg });
  return r.valid ? r.qVirtual : 0;
}

/**
 * Asesor de setpoints: recorre la malla de aperturas, evalúa producción
 * esperada × supervivencia y devuelve el setpoint con máxima utilidad que
 * cumpla las restricciones duras. Si el setpoint actual ya es el mejor, lo
 * confirma (gainPct ≈ 0) en lugar de sugerir cambios cosméticos.
 */
export function adviseSetpoints(inp: SetpointInput): SetpointAdvice {
  const horizonH = inp.horizonH ?? 24;
  const sg = inp.sg ?? SG_DEMO;
  const tubingId = inp.tubingIdIn ?? TUBING_ID_DEFAULT;
  const n = inp.samples.length;

  const empty = (reason: string): SetpointAdvice => ({
    feasible: false,
    reason,
    chokeNow: NaN,
    chokeRec: NaN,
    qNow: NaN,
    qRec: NaN,
    gainPct: NaN,
    expectedDeltaMscf: 0,
    survNow: NaN,
    survRec: NaN,
    qTurner: NaN,
    qErosion: NaN,
    horizonH,
    cd: NaN,
    constraints: [],
    rationale: [],
  });

  if (n < 30) return empty("serie insuficiente (mínimo 30 muestras)");
  const last = inp.samples[n - 1];
  if (!(last.q > 1) || !(last.pt > 0)) return empty("caudal o presión no física en la muestra actual");

  const chokeNow = clamp(last.choke, 2, 100);
  const chokeDia = inp.chokeDiaIn ?? suggestDia(inp.base.q, inp.base.pt, inp.base.pl, inp.base.temp, inp.base.choke);
  const cd = calibrateCd(
    { chokePct: last.choke, pUpPsig: last.pt, pDownPsig: last.pl, tempC: last.temp, chokeDiaIn: chokeDia, sg },
    last.q,
  );
  if (cd === null) return empty("calibración del choke no defendible en las condiciones actuales");

  const qTurner = turnerCriticalRate(last.pt, last.temp, tubingId, sg);
  const qErosion = erosionLimitRate(last.pt, last.temp, tubingId, sg);
  if (!Number.isFinite(qTurner) || !Number.isFinite(qErosion)) return empty("condiciones de línea no físicas");

  const qNow = last.q;
  const prior = priorFor(inp.diagId);

  /** Supervivencia al horizonte para un candidato de choke. */
  const survAt = (q: number): number => {
    const qDropFrac = clamp((inp.base.q - q) / Math.max(1, inp.base.q), 0, 0.6);
    // abrir más allá del límite de erosión o caer bajo el ascenso crítico
    // acelera la falla (se añade como severidad operativa virtual)
    const stress =
      (q > qErosion ? Math.min(1.2, (q / qErosion - 1) * 2.4) : 0) +
      (q < qTurner ? Math.min(1.2, (1 - q / Math.max(1, qTurner)) * 2.2) : 0);
    const anomC = clamp(inp.anomScore + 55 * clamp(stress, 0, 1.2) + 35 * clamp(inp.diagConf * (inp.diagId === "normal" ? 0 : 1), 0, 1), 0, 100);
    const etaEff = etaEffective(prior.eta, { anomScore: anomC, diagConf: inp.diagId === "normal" ? 0 : inp.diagConf, qDropFrac });
    return survivalAt(horizonH, etaEff, prior.beta);
  };

  // curva q(choke) con la presión aguas arriba sostenida por el pozo
  const qOf = (c: number) => qAtChoke(c, chokeDia, cd, inp.base.pt, inp.base.pl, inp.base.temp, sg);

  const [g0, g1, gStep] = inp.grid ?? [15, 95, 1];
  const cands: number[] = [];
  for (let c = g0; c <= g1 + 1e-9; c += gStep) cands.push(Math.round(c * 10) / 10);

  let best: { c: number; q: number; s: number; util: number } | null = null;
  let bestFeasible: { c: number; q: number; s: number; util: number } | null = null;
  for (const c of cands) {
    const q = qOf(c);
    if (!(q > 0)) continue;
    const s = survAt(q);
    const util = q * s;
    const cur = { c, q, s, util };
    if (!best || util > best.util) best = cur;
    const liftOk = q >= qTurner * 0.98; // 2 % de tolerancia de redondeo
    const erosionOk = q <= qErosion * 1.02;
    const subOk = (inp.base.pl + PSI_ATM) / (inp.base.pt + PSI_ATM) <= 0.86; // margen subcrítico
    if (liftOk && erosionOk && subOk && (!bestFeasible || util > bestFeasible.util)) bestFeasible = cur;
  }

  if (!best) return empty("sin aperturas viables en la malla evaluada");

  // el recomendado es el mejor factible; si ningún candidato cumple todas las
  // restricciones duras, se queda con la mejor utilidad global y lo marca
  const chosen = bestFeasible ?? best;

  // no sugerir cambios cosméticos: si la mejora esperada es < 1 % de caudal y
  // la supervivencia no mejora, confirma el setpoint actual
  let rec = chosen;
  const qCur = qOf(chokeNow);
  if (Number.isFinite(qCur) && qCur > 0) {
    const sCur = survAt(qCur);
    if (chosen.util < qCur * sCur * 1.01 && qCur >= qTurner * 0.98 && qCur <= qErosion * 1.02) {
      rec = { c: chokeNow, q: qCur, s: sCur, util: qCur * sCur };
    }
  } else {
    rec = { c: chokeNow, q: qNow, s: survAt(qNow), util: qNow * survAt(qNow) };
  }

  const gainPct = ((rec.q - qNow) / Math.max(1, qNow)) * 100;
  const survNow = survAt(qNow);
  const expectedDeltaMscf = ((rec.q * rec.s - qNow * survNow) * horizonH) / 24;

  const liftOk = rec.q >= qTurner * 0.98;
  const erosionOk = rec.q <= qErosion * 1.02;
  const ratioNow = (inp.base.pl + PSI_ATM) / (inp.base.pt + PSI_ATM);
  const subOk = ratioNow <= 0.86;
  const constraints: SetpointConstraint[] = [
    {
      id: "lift",
      label: "Ascenso (Turner)",
      ok: liftOk,
      detail: liftOk
        ? `q ${Math.round(rec.q)} ≥ crítico ${Math.round(qTurner)} Mscf/d — el gas arrastra líquidos`
        : `q ${Math.round(rec.q)} bajo el crítico ${Math.round(qTurner)} Mscf/d — riesgo de liquid loading`,
    },
    {
      id: "erosion",
      label: "Erosión (API 14E)",
      ok: erosionOk,
      detail: erosionOk
        ? `q ${Math.round(rec.q)} ≤ límite ${Math.round(qErosion)} Mscf/d — velocidad dentro de servicio continuo`
        : `q ${Math.round(rec.q)} excede el límite de erosión ${Math.round(qErosion)} Mscf/d`,
    },
    {
      id: "subcritico",
      label: "Margen subcrítico",
      ok: subOk,
      detail: subOk
        ? `P₂/P₁ ${ratioNow.toFixed(2)} ≤ 0.86 — el choke absorbe el ΔP (control estable)`
        : `P₂/P₁ ${ratioNow.toFixed(2)} > 0.86 — el choke opera en el límite subcrítico (control poco estable)`,
    },
    {
      id: "rango",
      label: "Rango del choke",
      ok: rec.c >= 10 && rec.c <= 95,
      detail: `apertura propuesta ${Math.round(rec.c)} % dentro del rango operativo 10–95 %`,
    },
  ];

  const rationale: string[] = [];
  if (rec.c > chokeNow + 1.5) {
    rationale.push(
      `Abrir el choke ${Math.round(chokeNow)} % → ${Math.round(rec.c)} % añade ≈ ${Math.round(rec.q - qNow)} Mscf/d manteniendo la velocidad sobre el crítico de Turner.`,
    );
  } else if (rec.c < chokeNow - 1.5) {
    rationale.push(
      `Cerrar el choke ${Math.round(chokeNow)} % → ${Math.round(rec.c)} % sacrifica caudal pero reduce la severidad operativa: la supervivencia al horizonte sube de ${(survNow * 100).toFixed(1)} % a ${(rec.s * 100).toFixed(1)} %.`,
    );
  } else {
    rationale.push(
      `El setpoint actual (${Math.round(chokeNow)} %) ya es la mejor apertura factible: utilidad producción×supervivencia maximal en la malla evaluada.`,
    );
  }
  if (!liftOk || !erosionOk) {
    rationale.push(
      "Ninguna apertura de la malla cumple todas las restricciones duras: se entrega la de mayor utilidad global — revisar los límites del completamiento (tamaño de tubing / presión de línea).",
    );
  }
  if (inp.diagId !== "normal") {
    rationale.push(
      `Riesgo activo (${inp.diagId}): la supervivencia Weibull al horizonte pondera la utilidad — prior η₀ ${Math.round(prior.eta)} h, β ${prior.beta}.`,
    );
  }

  return {
    feasible: true,
    chokeNow,
    chokeRec: rec.c,
    qNow,
    qRec: rec.q,
    gainPct,
    expectedDeltaMscf,
    survNow,
    survRec: rec.s,
    qTurner,
    qErosion,
    horizonH,
    cd,
    constraints,
    rationale,
  };
}
