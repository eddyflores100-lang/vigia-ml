// ---------------------------------------------------------------------------
// VIGÍA · motor de reproducción de histórico + puntuador de detección (v0.12)
// Reproduce las filas de un CSV parseado hacia un sumidero (el adaptador de la
// consola las fusiona con los últimos valores del pozo, igual que la fuente
// OPC-UA) a velocidad ajustable. El puntuador muestrea, al ritmo del ciclo de
// consola, la etiqueta de verdad de campo contra el diagnóstico dominante y
// compone: matriz de confusión, precisión/recuerdo/F1 por clase, retardo de
// detección por evento y eventos no detectados. Puro, sin DOM ni
// temporizadores internos: testeable con reloj inyectado.
// ---------------------------------------------------------------------------

import type { ReplayRow } from "./csvParser";

/** Clases canónicas del clasificador N3 + bucket honesto para reglas extra. */
export const SCORE_CLASSES = [
  "normal",
  "liquidLoading",
  "restriction",
  "sensorFault",
  "controlIssue",
  "otras",
] as const;
export type ScoreClass = (typeof SCORE_CLASSES)[number];

/** Mapea un id de hipótesis del pipeline a la clase puntuada. */
export function diagToClass(hypId: string): ScoreClass {
  switch (hypId) {
    case "normal":
      return "normal";
    case "liquid-loading":
      return "liquidLoading";
    case "restriction":
      return "restriction";
    case "control-issue":
      return "controlIssue";
    default:
      if (hypId.startsWith("sensor-") || hypId.startsWith("spike-")) return "sensorFault";
      return "otras"; // casing-leak, tubing-leak, hydrates, sanding (solo reglas)
  }
}

/** Normaliza una etiqueta del CSV a la clase puntuada (acepta variantes). */
export function labelToClass(label: string): ScoreClass | null {
  const s = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "");
  if (s === "") return null;
  if (s === "normal" || s === "ok" || s === "none" || s === "0" || s === "estable") return "normal";
  if (s.includes("liquid") || s.includes("loading") || s.includes("cargadeliquidos")) return "liquidLoading";
  if (s.includes("restric") || s.includes("restriction") || s.includes("linea")) return "restriction";
  if (s.includes("sensor") || s.includes("instrument") || s.includes("spike")) return "sensorFault";
  if (s.includes("control") || s.includes("actuador") || s.includes("choke")) return "controlIssue";
  if (
    s.includes("casing") || s.includes("tubing") || s.includes("fuga") || s.includes("leak") ||
    s.includes("hidrat") || s.includes("hydrate") || s.includes("arena") || s.includes("sand")
  ) return "otras";
  return "otras"; // etiqueta desconocida: cuenta como «otras» (no se descarta)
}

export type ReplayStatus = "idle" | "ready" | "playing" | "paused" | "done";

export interface ReplayProgress {
  status: ReplayStatus;
  idx: number; // filas emitidas
  total: number;
  ts: number; // ts de la última fila emitida
  etaSec: number; // estimación a la velocidad actual
}

export interface ScoredTick {
  truth: ScoreClass;
  pred: ScoreClass;
  ts: number;
}

export interface EventSegment {
  cls: ScoreClass;
  startTs: number;
  endTs: number;
  detectedAtTs: number | null;
  delayMin: number | null; // retardo de detección
}

export interface ClassMetric {
  cls: ScoreClass;
  precision: number; // 0..1 (NaN si sin predicciones)
  recall: number; // 0..1 (NaN si sin soporte)
  f1: number;
  support: number; // ticks con esta verdad
}

export interface ReplayScore {
  nTicks: number;
  accuracy: number;
  matrix: number[][]; // [verdad][predicción] sobre SCORE_CLASSES
  perClass: ClassMetric[];
  events: EventSegment[];
  meanDelayMin: number | null;
  missedEvents: number;
  hasLabels: boolean;
}

export const SPEEDS = [1, 2, 5, 15, 60, 300, 900] as const;
export type ReplaySpeed = (typeof SPEEDS)[number];

/** Intervalo pared entre emisiones del reproductor (ms). */
export const EMIT_MS = 200;
/** Segundos pared que representa avanzar una fila a velocidad 1×. */
export const SEC_PER_ROW_1X = 0.6;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Motor de reproducción. `sink` recibe cada lote de filas; el adaptador de la
 * consola decide a qué pozo van y cómo fusionar los valores ausentes. El
 * motor no toca el DOM ni crea temporizadores: `pump(nowMs)` se llama desde
 * el ciclo de la UI, lo que mantiene un único reloj por aplicación.
 */
export class ReplayEngine {
  private rows: ReplayRow[];
  private idx = 0;
  private status: ReplayStatus = "idle";
  private speed: ReplaySpeed = 60;
  private carry = 0; // filas fraccionarias acumuladas entre emisiones
  private lastEmit = 0;
  private scored: ScoredTick[] = [];
  private segments: EventSegment[] = [];
  private sink: (batch: ReplayRow[]) => void;
  private firstTs: number;

  constructor(rows: ReplayRow[], sink: (batch: ReplayRow[]) => void) {
    this.rows = rows;
    this.sink = sink;
    this.firstTs = rows.length ? rows[0].ts : 0;
    this.buildSegments();
    if (rows.length) this.status = "ready";
  }

  /** Segmentos de evento = tramos contiguos con etiqueta ≠ normal. */
  private buildSegments() {
    let cur: EventSegment | null = null;
    const closeCur = () => {
      if (cur) this.segments.push(cur);
      cur = null;
    };
    for (const r of this.rows) {
      const cls = r.label ? labelToClass(r.label) : null;
      const isEvent = cls !== null && cls !== "normal";
      if (isEvent && cur && cur.cls === cls && r.ts - cur.endTs <= 3 * 60000) {
        cur.endTs = r.ts; // extensión (tolera huecos ≤ 3 min)
      } else if (isEvent) {
        closeCur();
        cur = { cls, startTs: r.ts, endTs: r.ts, detectedAtTs: null, delayMin: null };
      } else {
        closeCur();
      }
    }
    closeCur();
  }

  get progress(): ReplayProgress {
    const remaining = this.rows.length - this.idx;
    const rowsPerSec = this.speed / SEC_PER_ROW_1X;
    return {
      status: this.status,
      idx: this.idx,
      total: this.rows.length,
      ts: this.idx > 0 ? this.rows[this.idx - 1].ts : this.firstTs,
      etaSec: this.status === "playing" ? remaining / Math.max(0.1, rowsPerSec) : 0,
    };
  }

  get hasLabels(): boolean {
    return this.rows.some((r) => r.label !== null);
  }

  get currentLabel(): string | null {
    return this.idx > 0 ? this.rows[this.idx - 1].label : null;
  }

  setSpeed(s: ReplaySpeed) {
    this.speed = s;
  }

  play(nowMs?: number): boolean {
    if (this.status === "ready" || this.status === "paused" || this.status === "done") {
      if (this.status === "done") this.reset(); // replay de nuevo desde el inicio
      this.status = "playing";
      this.lastEmit = nowMs ?? now();
      return true;
    }
    return false;
  }

  pause() {
    if (this.status === "playing") this.status = "paused";
  }

  stop() {
    this.status = this.idx >= this.rows.length ? "done" : "ready";
  }

  reset() {
    this.idx = 0;
    this.carry = 0;
    this.scored = [];
    for (const e of this.segments) { e.detectedAtTs = null; e.delayMin = null; }
    this.status = this.rows.length ? "ready" : "idle";
  }

  /** Filas emitidas hasta ahora (para leer el punto de reproducción). */
  get emitted(): ReplayRow[] {
    return this.rows.slice(0, this.idx);
  }

  /**
   * Salta a una posición de la línea de tiempo sin emitir filas (el sumidero
   * no se invoca). Útil para saltar al siguiente evento etiquetado y para
   * pruebas deterministas.
   */
  seek(idx: number) {
    this.idx = Math.min(this.rows.length, Math.max(0, Math.floor(idx)));
    if (this.rows.length > 0 && this.idx >= this.rows.length) this.status = "done";
    else if (this.status === "done") this.status = "ready";
  }

  /** Salta al índice de la primera fila con ts ≥ pedido. */
  seekToTs(ts: number) {
    const idx = this.rows.findIndex((r) => r.ts >= ts);
    if (idx >= 0) this.seek(idx);
  }

  /** ts de inicio del siguiente evento etiquetado tras la posición actual. */
  nextEventTs(): number | null {
    const cur = this.idx > 0 ? this.rows[this.idx - 1].ts : Number.NEGATIVE_INFINITY;
    for (const e of this.segments) {
      if (e.startTs > cur) return e.startTs;
    }
    return null;
  }

  /**
   * Avanza el reloj pared y emite los lotes que correspondan. Devuelve las
   * filas emitidas (también se entregan al sink). Llamar en cada ciclo de UI.
   */
  pump(nowMs?: number): ReplayRow[] {
    if (this.status !== "playing") return [];
    const t = nowMs ?? now();
    const elapsed = Math.max(0, t - this.lastEmit);
    if (elapsed < EMIT_MS) return [];
    this.lastEmit = t;
    const rowsDue = (elapsed / 1000) * (this.speed / SEC_PER_ROW_1X) + this.carry;
    let n = Math.floor(rowsDue);
    this.carry = rowsDue - n;
    n = Math.min(n, this.rows.length - this.idx);
    if (n <= 0) return [];
    const batch = this.rows.slice(this.idx, this.idx + n);
    this.idx += n;
    this.sink(batch);
    if (this.idx >= this.rows.length) this.status = "done";
    return batch;
  }

  /**
   * Puntuación por muestreo: registra (verdad, predicción) para el estado
   * actual y marca el retardo de detección del segmento en curso. Llamar una
   * vez por ciclo de consola con el id de la hipótesis dominante.
   */
  scoreTick(topDiagId: string): ScoredTick | null {
    if (this.idx === 0) return null;
    const row = this.rows[this.idx - 1];
    if (!row.label) return null;
    const truth = labelToClass(row.label);
    if (!truth) return null;
    const pred = diagToClass(topDiagId);
    this.scored.push({ truth, pred, ts: row.ts });

    if (truth !== "normal") {
      const seg = this.segments.find((e) => row.ts >= e.startTs && row.ts <= e.endTs);
      if (seg && seg.detectedAtTs === null && pred === truth) {
        seg.detectedAtTs = row.ts;
        seg.delayMin = Math.max(0, (row.ts - seg.startTs) / 60000);
      }
    }
    return { truth, pred, ts: row.ts };
  }

  /** Compone la métrica completa del replay hasta ahora. */
  score(): ReplayScore {
    const n = SCORE_CLASSES.length;
    const matrix = Array.from({ length: n }, () => Array<number>(n).fill(0));
    for (const t of this.scored) {
      matrix[SCORE_CLASSES.indexOf(t.truth)][SCORE_CLASSES.indexOf(t.pred)]++;
    }
    const perClass: ClassMetric[] = SCORE_CLASSES.map((cls, i) => {
      const support = matrix[i].reduce((s, v) => s + v, 0);
      const tp = matrix[i][i];
      let predTotal = 0;
      for (let j = 0; j < n; j++) predTotal += matrix[j][i];
      const precision = predTotal > 0 ? tp / predTotal : NaN;
      const recall = support > 0 ? tp / support : NaN;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : NaN;
      return { cls, precision, recall, f1, support };
    });
    const total = this.scored.length;
    const correct = matrix.reduce((s, row, i) => s + row[i], 0);
    const detected = this.segments.filter((e) => e.detectedAtTs !== null);
    const delays = detected.map((e) => e.delayMin ?? 0);
    return {
      nTicks: total,
      accuracy: total > 0 ? correct / total : NaN,
      matrix,
      perClass,
      events: this.segments,
      meanDelayMin: delays.length ? delays.reduce((s, v) => s + v, 0) / delays.length : null,
      missedEvents: this.segments.length - detected.length,
      hasLabels: this.hasLabels,
    };
  }
}
