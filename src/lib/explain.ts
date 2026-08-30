// ---------------------------------------------------------------------------
// VIGÍA · explicabilidad de predicciones (roadmap comercial #7)
// Descompone el índice de anomalía en aportes por variable: z del último valor
// contra la línea base móvil, tendencia por hora y porcentaje del índice.
// Es la respuesta a "¿por qué el modelo dispara la alerta?": el ingeniero ve
// QUE variable domina, HACIA dónde se mueve y CUÁNTO pesa en el score.
// Reproduce la ponderación de anomaly() (models.ts) normalizada a 100 %.
// ---------------------------------------------------------------------------

import { VAR_KEYS, VAR_META } from "./sim";
import type { Sample, VarKey } from "./sim";
import type { AnomalyResult } from "./models";
import { trendPerHour } from "./models";

/** Pesos por variable — mismos relativos que anomaly() en models.ts. */
const W: Record<VarKey, number> = { pt: 0.28, q: 0.26, pl: 0.14, pc: 0.12, choke: 0.12, temp: 0.08 };

export type DriverDir = "sube" | "baja" | "plano";

export interface Driver {
  key: VarKey;
  tag: string; // "PT-101"
  label: string; // "Presión tubing"
  value: number; // último valor
  unit: string;
  ref: number; // media de la ventana (línea base)
  z: number; // |último − media| / σ de la ventana
  trend: number; // unidad/hora sobre la ventana
  dir: DriverDir;
  share: number; // % del índice de anomalía (0..100)
  flat: boolean; // señal congelada (sensor en corto / atascado)
  text: string; // frase explicativa lista para UI / copiloto
}

export interface ExplainResult {
  drivers: Driver[]; // ordenados por share descendente
  summary: string; // narrativa principal (1-2 frases)
  score: number;
  level: AnomalyResult["level"];
  windowMin: number; // minutos de ventana usados
}

const fmt1 = (v: number) =>
  v.toLocaleString("es-EC", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmtVal = (v: number, dec: number) =>
  v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec });

const DIR_WORD: Record<DriverDir, string> = { sube: "subiendo", baja: "cayendo", plano: "estable" };

/**
 * Descompone el índice de anomalía en drivers por variable.
 * @param samples buffer reciente (se usa la última ventana `windowMin` min)
 * @param anom resultado de anomaly() (score + nivel) sobre la misma ventana
 * @param windowMin minutos de ventana (def 120)
 */
export function explainSamples(
  samples: Sample[],
  anom: Pick<AnomalyResult, "score" | "level">,
  windowMin = 120,
): ExplainResult {
  const win = samples.slice(-windowMin);
  const n = win.length;
  const drivers: Driver[] = [];

  if (n < 5) {
    return {
      drivers: [],
      summary: "Serie insuficiente para descomponer el índice (se necesitan ≥ 5 muestras).",
      score: anom.score,
      level: anom.level,
      windowMin,
    };
  }

  // paso 1: señales planas (sensores congelados) — dominan el índice si existen
  const flatKeys = new Set<VarKey>();
  for (const key of VAR_KEYS) {
    if (key === "choke") continue; // setpoint: plano es su normal
    const tail = win.slice(-25).map((s) => s[key]);
    const tm = tail.reduce((a, b) => a + b, 0) / tail.length;
    const tsd = Math.sqrt(tail.reduce((a, b) => a + (b - tm) ** 2, 0) / tail.length);
    if (tsd < 0.05) flatKeys.add(key);
  }

  // paso 2: z, tendencia y peso bruto por variable (misma forma que anomaly())
  const raw: { key: VarKey; w: number; z: number; trend: number; sd: number; mean: number; last: number }[] = [];
  for (const key of VAR_KEYS) {
    const vals = win.map((s) => s[key]);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    const last = vals[n - 1];
    const z = sd > 1e-6 ? Math.abs(last - mean) / sd : 0;
    const trend = trendPerHour(win, key);
    const zt = sd > 1e-6 ? Math.abs(trend) / sd : 0;
    let w = W[key] * (Math.max(0, z - 1.2) + Math.max(0, zt - 0.6) * 2.6);
    if (flatKeys.has(key)) w += 1.6; // sensor congelado: aporte dominante
    raw.push({ key, w, z: flatKeys.has(key) ? 5.4 : z, trend, sd, mean, last });
  }

  // paso 3: normalizar a 100 %
  const total = raw.reduce((a, b) => a + b.w, 0);
  for (const r of raw) {
    const meta = VAR_META[r.key];
    const share = total > 1e-9 ? (r.w / total) * 100 : 0;
    const flat = flatKeys.has(r.key);
    const dir: DriverDir = flat
      ? "plano"
      : Math.abs(r.trend) * 2 > r.sd
        ? r.trend > 0
          ? "sube"
          : "baja"
        : Math.abs(r.last - r.mean) > r.sd
          ? r.last > r.mean
            ? "sube"
            : "baja"
          : "plano";
    const dec = meta.dec;
    const pctBase = r.mean !== 0 ? `${fmt1(((r.last - r.mean) / Math.abs(r.mean)) * 100)} %` : "—";
    const text = flat
      ? `${meta.short} (${meta.tag}) congelada en ${fmtVal(r.last, dec)} ${meta.unit} — señal plana ≥ 25 min: revisar el transmisor.`
      : share < 4
        ? `${meta.short} (${meta.tag}) en ${fmtVal(r.last, dec)} ${meta.unit}, ${DIR_WORD[dir]} ${r.trend >= 0 ? "+" : ""}${fmt1(r.trend)} ${meta.unit}/h — dentro de la envolvente, aporte marginal.`
        : `${meta.short} (${meta.tag}) en ${fmtVal(r.last, dec)} ${meta.unit} (${pctBase} vs base), ${DIR_WORD[dir]} ${r.trend >= 0 ? "+" : ""}${fmt1(r.trend)} ${meta.unit}/h — aporta ${fmt1(share)} % del índice (z ${fmt1(r.z)}).`;
    drivers.push({
      key: r.key,
      tag: meta.tag,
      label: meta.label,
      value: r.last,
      unit: meta.unit,
      ref: r.mean,
      z: r.z,
      trend: r.trend,
      dir,
      share,
      flat,
      text,
    });
  }
  drivers.sort((a, b) => b.share - a.share || a.key.localeCompare(b.key));

  // paso 4: narrativa
  const dom = drivers.filter((d) => d.share >= 12).slice(0, 3);
  let summary: string;
  if (flatKeys.size > 0) {
    const names = drivers.filter((d) => d.flat).map((d) => d.tag).join(", ");
    summary = `Índice ${anom.level} (${anom.score}/100) dominado por señales congeladas (${names}): probable falla de instrumento, no del pozo.`;
  } else if (dom.length === 0) {
    summary = `Índice ${anom.level} (${anom.score}/100): ninguna variable supera el 12 % de aporte — comportamiento consistente con la línea base móvil.`;
  } else {
    const chain = dom
      .map((d) => `${d.tag} (${Math.round(d.share)} %, ${DIR_WORD[d.dir]})`)
      .join(", ");
    summary = `Índice ${anom.level} (${anom.score}/100) en los últimos ${windowMin} min: dominado por ${chain}.`;
  }

  return { drivers, summary, score: anom.score, level: anom.level, windowMin };
}
