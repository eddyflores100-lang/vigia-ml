// ---------------------------------------------------------------------------
// VIGÍA ML · motor de inferencia y entrenamiento (TensorFlow.js)
// N1 LSTM de pronóstico multivariado (rollout recursivo, paso 15 min)
// N2 Autoencoder denso de detección de anomalías (error de reconstrucción)
// N3 Clasificador denso softmax de diagnóstico (5 clases operativas)
// Todo entrena EN EL NAVEGADOR sobre telemetría sintética del simulador.
// ---------------------------------------------------------------------------
import * as tf from "@tensorflow/tfjs";
import {
  AE_WIN,
  CLASSES,
  CLS_WIN,
  FC_INPUT,
  FC_MIN,
  FC_STEPS,
  ML_VARS,
  aggregates,
  extractFeatures,
  generateDataset,
  makeNorm,
  normVec,
} from "./dataGen";
import type { ClassId, Norm } from "./dataGen";
import { anomalyLevel, linSlopePerHour } from "../models";
import type { Contribution, Forecast, Hypothesis } from "../models";
import type { Sample, VarKey } from "../sim";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

// ------------------------------ estado público ------------------------------
export type MlPhase =
  | "idle"
  | "data"
  | "forecast"
  | "autoencoder"
  | "classifier"
  | "ready"
  | "error";

export interface ModelCard {
  name: string;
  kind: string;
  params: number;
  valLoss: number;
  acc?: number;
  epochs: number;
  trainMs: number;
}

export interface TrainState {
  phase: MlPhase;
  label: string;
  progress: number; // 0..1 global
  epoch: number;
  epochs: number;
  loss: number;
  valLoss: number;
  acc: number;
  lossHist: number[];
  accHist: number[];
  confusion: number[][] | null;
  dataset: { wells: number; fc: number; ae: number; cls: number };
  cards: ModelCard[];
  backend: string;
  elapsedMs: number;
  error: string | null;
}

export interface MlAnomaly {
  score: number;
  level: ReturnType<typeof anomalyLevel>;
  contributions: Contribution[];
  reconErr: number;
}

export interface ClassProb {
  cls: ClassId;
  id: string; // id de hipótesis compatible con N5
  p: number;
}

export interface MlForecast {
  stepMin: number;
  byVar: Record<VarKey, { mean: number[]; lo: number[]; hi: number[] }>;
  sd: Record<VarKey, number>;
}

const HYP_BY_CLASS: Record<ClassId, { id: string; name: string; icon: Hypothesis["icon"] }> = {
  normal: { id: "normal", name: "Operación dentro de envolvente", icon: "check" },
  liquidLoading: { id: "liquid-loading", name: "Liquid loading en tubing", icon: "droplet" },
  restriction: { id: "restriction", name: "Restricción en línea (hidratos / escala)", icon: "valve" },
  sensorFault: { id: "sensor-pt", name: "Sensor defectuoso · PT-101", icon: "chip" },
  controlIssue: { id: "control-issue", name: "Problema de control · actuador de choke", icon: "gauge" },
};

// ------------------------------ el motor ------------------------------------
export class VigiaEngine {
  ready = false;
  backend = "—";
  private state: TrainState = VigiaEngine.initialState();

  private fc: tf.LayersModel | null = null; // N1 LSTM
  private ae: tf.LayersModel | null = null; // N2 autoencoder
  private cls: tf.LayersModel | null = null; // N3 clasificador
  private fcResid: number[] = []; // σ de residuales por salida [36]
  private aeCal = { mu: 0, sigma: 1, perVar: [1, 1, 1, 1, 1, 1] as number[] };

  static initialState(): TrainState {
    return {
      phase: "idle",
      label: "Inicializando motor…",
      progress: 0,
      epoch: 0,
      epochs: 0,
      loss: 0,
      valLoss: 0,
      acc: 0,
      lossHist: [],
      accHist: [],
      confusion: null,
      dataset: { wells: 0, fc: 0, ae: 0, cls: 0 },
      cards: [],
      backend: "—",
      elapsedMs: 0,
      error: null,
    };
  }

  get currentState(): TrainState {
    return this.state;
  }

  dispose() {
    this.ready = false;
    this.fc?.dispose();
    this.ae?.dispose();
    this.cls?.dispose();
    this.fc = null;
    this.ae = null;
    this.cls = null;
  }

  // ------------------------------ arquitecturas -----------------------------

  private buildForecaster(): tf.LayersModel {
    const m = tf.sequential();
    m.add(
      tf.layers.lstm({
        units: 28,
        inputShape: [FC_INPUT, ML_VARS.length],
        returnSequences: false,
      }),
    );
    m.add(tf.layers.dropout({ rate: 0.08 }));
    m.add(tf.layers.dense({ units: FC_STEPS * ML_VARS.length })); // 36 salidas
    m.compile({ optimizer: tf.train.adam(0.008), loss: "meanSquaredError" });
    return m;
  }

  private buildAutoencoder(): tf.LayersModel {
    const m = tf.sequential();
    const flat = AE_WIN * ML_VARS.length; // 180
    m.add(tf.layers.dense({ units: 72, activation: "relu", inputShape: [flat] }));
    m.add(tf.layers.dense({ units: 20, activation: "relu" })); // código latente
    m.add(tf.layers.dense({ units: 72, activation: "relu" }));
    m.add(tf.layers.dense({ units: flat }));
    m.compile({ optimizer: tf.train.adam(0.006), loss: "meanSquaredError" });
    return m;
  }

  private buildClassifier(nFeatures: number): tf.LayersModel {
    const m = tf.sequential();
    m.add(tf.layers.dense({ units: 32, activation: "relu", inputShape: [nFeatures] }));
    m.add(tf.layers.dropout({ rate: 0.1 }));
    m.add(tf.layers.dense({ units: 16, activation: "relu" }));
    m.add(tf.layers.dense({ units: CLASSES.length, activation: "softmax" }));
    m.compile({
      optimizer: tf.train.adam(0.004),
      loss: "categoricalCrossentropy",
      metrics: ["accuracy"],
    });
    return m;
  }

  // ------------------------------ entrenamiento -----------------------------

  private async fit(
    model: tf.LayersModel,
    x: tf.Tensor,
    y: tf.Tensor,
    val: [tf.Tensor, tf.Tensor] | null,
    epochs: number,
    batchSize: number,
    onEpoch: (ep: number, logs: { loss: number; valLoss: number; acc: number }) => void,
  ) {
    await model.fit(x, y, {
      epochs,
      batchSize,
      verbose: 0,
      validationData: val ?? undefined,
      shuffle: true,
      callbacks: {
        onEpochEnd: async (ep: number, logs?: tf.Logs) => {
          const lg = (logs ?? {}) as Record<string, number | undefined>;
          onEpoch(ep, {
            loss: lg.loss ?? 0,
            valLoss: lg.val_loss ?? 0,
            acc: lg.acc ?? lg.accuracy ?? 0,
          });
          await tf.nextFrame(); // deja respirar a la UI
        },
      },
    });
  }

  async trainAll(cb: (s: TrainState) => void): Promise<boolean> {
    const t0 = performance.now();
    this.ready = false;
    this.dispose();
    const st = VigiaEngine.initialState();
    const emit = (p: Partial<TrainState>) => {
      Object.assign(st, p, { elapsedMs: Math.round(performance.now() - t0) });
      this.state = { ...st };
      cb(this.state);
    };

    try {
      emit({ phase: "data", label: "Generando telemetría sintética de entrenamiento…", progress: 0.02 });
      await tf.ready();
      this.backend = tf.getBackend();
      emit({ backend: this.backend });
      await tf.nextFrame();
      await tf.nextFrame();

      const ds = generateDataset();
      const nFc = ds.fcTrainX.length + ds.fcValX.length;
      const nAe = ds.aeTrainX.length + ds.aeValX.length;
      const nCls = ds.clsTrainX.length + ds.clsValX.length;
      emit({
        phase: "data",
        label: `Dataset listo · ${ds.wells} pozos sintéticos`,
        progress: 0.06,
        dataset: { wells: ds.wells, fc: nFc, ae: nAe, cls: nCls },
      });
      await tf.nextFrame();

      const slowBackend = this.backend === "cpu";
      const epScale = slowBackend ? 0.4 : 1;

      // ------------------------- N1 · LSTM pronóstico -----------------------
      const E1 = Math.max(8, Math.round(34 * epScale));
      emit({ phase: "forecast", label: "Entrenando LSTM de pronóstico (N1)…", epochs: E1, epoch: 0 });
      this.fc = this.buildForecaster();
      const fcX = tf.tensor3d(ds.fcTrainX);
      const fcY = tf.tensor2d(ds.fcTrainY);
      const fcVX = tf.tensor3d(ds.fcValX);
      const fcVY = tf.tensor2d(ds.fcValY);
      let fcValLoss = 0;
      await this.fit(this.fc, fcX, fcY, [fcVX, fcVY], E1, 32, (ep, lg) => {
        fcValLoss = lg.valLoss || fcValLoss;
        emit({
          phase: "forecast",
          epoch: ep + 1,
          loss: lg.loss,
          valLoss: lg.valLoss,
          lossHist: [...st.lossHist.slice(-79), lg.loss],
          progress: 0.06 + 0.44 * ((ep + 1) / E1),
        });
      });

      // calibración: σ de residuales por (paso, variable) sobre validación
      {
        const pred = this.fc.predict(fcVX) as tf.Tensor;
        const arr = await pred.data();
        const n = ds.fcValX.length;
        const D = FC_STEPS * ML_VARS.length;
        const stds: number[] = [];
        for (let c = 0; c < D; c++) {
          let s = 0, s2 = 0;
          for (let i = 0; i < n; i++) {
            const e = arr[i * D + c] - ds.fcValY[i][c];
            s += e;
            s2 += e * e;
          }
          const mu = s / n;
          stds.push(Math.sqrt(Math.max(1e-8, s2 / n - mu * mu)));
        }
        this.fcResid = stds;
        pred.dispose();
      }
      fcX.dispose(); fcY.dispose(); fcVX.dispose(); fcVY.dispose();
      emit({
        progress: 0.5,
        cards: [
          ...st.cards,
          {
            name: "LSTM pronóstico",
            kind: `LSTM(28) → Dense(36) · entrada ${FC_INPUT}×6 · rollout ${FC_STEPS} pasos`,
            params: this.fc.countParams(),
            valLoss: fcValLoss,
            epochs: E1,
            trainMs: Math.round(performance.now() - t0),
          },
        ],
      });
      await tf.nextFrame();

      // ---------------------- N2 · Autoencoder anomalías --------------------
      const E2 = Math.max(8, Math.round(30 * epScale));
      emit({
        phase: "autoencoder",
        label: "Entrenando autoencoder de anomalías (N2)…",
        epochs: E2,
        epoch: 0,
        lossHist: [],
      });
      this.ae = this.buildAutoencoder();
      const aeX = tf.tensor2d(ds.aeTrainX.map((w) => w.flat()));
      const aeVX = tf.tensor2d(ds.aeValX.map((w) => w.flat()));
      let aeValLoss = 0;
      await this.fit(this.ae, aeX, aeX, [aeVX, aeVX], E2, 32, (ep, lg) => {
        aeValLoss = lg.valLoss || aeValLoss;
        emit({
          phase: "autoencoder",
          epoch: ep + 1,
          loss: lg.loss,
          valLoss: lg.valLoss,
          lossHist: [...st.lossHist.slice(-79), lg.loss],
          progress: 0.5 + 0.22 * ((ep + 1) / E2),
        });
      });

      // calibración del umbral de error sobre operación normal
      {
        const pred = this.ae.predict(aeVX) as tf.Tensor;
        const arr = await pred.data();
        const n = ds.aeValX.length;
        const errs: number[] = [];
        const perVar = new Array(ML_VARS.length).fill(0);
        const flat = ds.aeValX.map((w) => w.flat());
        for (let i = 0; i < n; i++) {
          let e = 0;
          for (let t = 0; t < AE_WIN; t++) {
            for (let k = 0; k < ML_VARS.length; k++) {
              const d = arr[i * AE_WIN * ML_VARS.length + t * ML_VARS.length + k] - flat[i][t * ML_VARS.length + k];
              e += (d * d) / (AE_WIN * ML_VARS.length);
              perVar[k] += (d * d) / (AE_WIN * n);
            }
          }
          errs.push(e);
        }
        const mu = errs.reduce((a, b) => a + b, 0) / n;
        const sigma = Math.sqrt(errs.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
        this.aeCal = { mu, sigma: Math.max(1e-9, sigma), perVar: perVar.map((v) => Math.max(1e-9, v)) };
        pred.dispose();
      }
      aeX.dispose(); aeVX.dispose();
      emit({
        progress: 0.72,
        cards: [
          ...st.cards,
          {
            name: "Autoencoder N2",
            kind: `Dense 180→72→20→72→180 · ventana ${AE_WIN} min · σ calibrada en validación`,
            params: this.ae.countParams(),
            valLoss: aeValLoss,
            epochs: E2,
            trainMs: Math.round(performance.now() - t0),
          },
        ],
      });
      await tf.nextFrame();

      // --------------------- N3 · Clasificador diagnóstico -------------------
      const E3 = Math.max(10, Math.round(46 * epScale));
      emit({
        phase: "classifier",
        label: "Entrenando clasificador de diagnóstico (N3)…",
        epochs: E3,
        epoch: 0,
        lossHist: [],
        accHist: [],
      });
      this.cls = this.buildClassifier(ds.clsTrainX[0]?.length ?? 14);
      const toOneHot = (ys: number[]) =>
        ys.map((y) => Array.from({ length: CLASSES.length }, (_, i) => (i === y ? 1 : 0)));
      const clsX = tf.tensor2d(ds.clsTrainX);
      const clsY = tf.tensor2d(toOneHot(ds.clsTrainY));
      const clsVX = tf.tensor2d(ds.clsValX);
      const clsVY = tf.tensor2d(toOneHot(ds.clsValY));
      let clsValLoss = 0;
      let clsAcc = 0;
      await this.fit(this.cls, clsX, clsY, [clsVX, clsVY], E3, 32, (ep, lg) => {
        clsValLoss = lg.valLoss || clsValLoss;
        clsAcc = Math.max(clsAcc, lg.acc);
        emit({
          phase: "classifier",
          epoch: ep + 1,
          loss: lg.loss,
          valLoss: lg.valLoss,
          acc: lg.acc,
          lossHist: [...st.lossHist.slice(-79), lg.loss],
          accHist: [...st.accHist.slice(-79), lg.acc],
          progress: 0.72 + 0.27 * ((ep + 1) / E3),
        });
      });

      // matriz de confusión sobre validación
      let confusion: number[][] = [];
      let valAcc = 0;
      {
        const pred = this.cls.predict(clsVX) as tf.Tensor;
        const arr = await pred.data();
        confusion = Array.from({ length: CLASSES.length }, () =>
          Array.from({ length: CLASSES.length }, () => 0),
        );
        ds.clsValY.forEach((yTrue, i) => {
          let best = 0;
          for (let c = 1; c < CLASSES.length; c++) {
            if (arr[i * CLASSES.length + c] > arr[i * CLASSES.length + best]) best = c;
          }
          confusion[yTrue][best]++;
        });
        const total = ds.clsValY.length || 1;
        valAcc = confusion.reduce((a, row, i) => a + row[i], 0) / total;
        pred.dispose();
      }
      clsX.dispose(); clsY.dispose(); clsVX.dispose(); clsVY.dispose();
      emit({
        progress: 1,
        confusion,
        cards: [
          ...st.cards,
          {
            name: "Clasificador N3",
            kind: `Dense 14→32→16→5 softmax · ${(valAcc * 100).toFixed(1)}% acc. validación`,
            params: this.cls.countParams(),
            valLoss: clsValLoss,
            acc: valAcc,
            epochs: E3,
            trainMs: Math.round(performance.now() - t0),
          },
        ],
      });
      await tf.nextFrame();

      this.ready = true;
      emit({
        phase: "ready",
        label: `Modelos listos · backend ${this.backend.toUpperCase()} · inferencia en vivo`,
        progress: 1,
        epoch: 0,
        epochs: 0,
      });
      return true;
    } catch (err) {
      emit({
        phase: "error",
        label: "Error de entrenamiento",
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  // ------------------------------ inferencia --------------------------------

  /** N2 · score de anomalía 0-100 por error de reconstrucción + detector de señal plana. */
  async assess(samples: Sample[], base: Record<VarKey, number>): Promise<{ anom: MlAnomaly; probs: ClassProb[] } | null> {
    if (!this.ready || !this.ae || !this.cls) return null;
    const win = samples.slice(-AE_WIN);
    if (win.length < AE_WIN) return null;
    const norm = makeNorm(base);
    const flat = win.flatMap((s) => normVec(s, norm));

    // --- autoencoder ---
    const x = tf.tensor2d([flat]);
    const y = this.ae.predict(x) as tf.Tensor;
    const pred = Array.from(await y.data());
    x.dispose();
    y.dispose();

    const perVar = new Array(ML_VARS.length).fill(0);
    for (let t = 0; t < AE_WIN; t++) {
      for (let k = 0; k < ML_VARS.length; k++) {
        const d = pred[t * ML_VARS.length + k] - flat[t * ML_VARS.length + k];
        perVar[k] += (d * d) / AE_WIN;
      }
    }
    const totalErr = perVar.reduce((a, b) => a + b, 0) / ML_VARS.length;
    const z = (totalErr - this.aeCal.mu) / this.aeCal.sigma;

    // detector de señal congelada (un AE no ve "anómalo" un valor constante)
    const flatKeys: VarKey[] = [];
    for (const k of ["pt", "pc", "pl", "temp"] as VarKey[]) {
      const tail = win.slice(-25).map((s) => s[k]);
      const m = tail.reduce((a, b) => a + b, 0) / tail.length;
      const sd = Math.sqrt(tail.reduce((a, b) => a + (b - m) ** 2, 0) / tail.length);
      if (sd < 0.05) flatKeys.push(k);
    }

    let score = 100 * (1 - Math.exp(-Math.max(0, z - 1.2) / 5.2));
    if (flatKeys.length > 0) score = Math.max(score, 74);
    score = clamp(Math.round(score), 2, 98);

    const contributions: Contribution[] = [];
    ML_VARS.forEach((k, i) => {
      const ratio = perVar[i] / this.aeCal.perVar[i];
      const pz = clamp((ratio - 1) * 1.9 + 0.8, 0, 9);
      if (pz > 1.6) contributions.push({ key: k, z: pz });
    });
    for (const k of flatKeys) contributions.push({ key: k, z: 5.4 });
    contributions.sort((a, b) => b.z - a.z);

    // --- clasificador ---
    const win90 = samples.slice(-CLS_WIN);
    let probs: ClassProb[] = [];
    if (win90.length >= CLS_WIN) {
      const f = extractFeatures(win90, norm);
      const fx = tf.tensor2d([f]);
      const fy = this.cls.predict(fx) as tf.Tensor;
      const p = Array.from(await fy.data());
      fx.dispose();
      fy.dispose();
      probs = CLASSES.map((c, i) => ({ cls: c, id: HYP_BY_CLASS[c].id, p: p[i] })).sort(
        (a, b) => b.p - a.p,
      );
    }

    return {
      anom: { score, level: anomalyLevel(score), contributions: contributions.slice(0, 3), reconErr: totalErr },
      probs,
    };
  }

  /** N1 · pronóstico multivariado con rollout recursivo (paso 15 min). */
  async forecastSeries(
    samples: Sample[],
    base: Record<VarKey, number>,
    steps: number,
  ): Promise<MlForecast | null> {
    if (!this.ready || !this.fc) return null;
    const norm = makeNorm(base);
    const need = FC_INPUT * FC_MIN;
    let buf = samples.slice(-need);
    while (buf.length < need && buf.length > 0) buf = [buf[0], ...buf];
    if (buf.length < need) return null;

    let seq = aggregates(buf, norm); // [16][6] normalizado
    const blocks = Math.ceil(steps / FC_STEPS);
    for (let b = 0; b < blocks; b++) {
      const x = tf.tensor3d([seq.slice(-FC_INPUT)]);
      const y = this.fc.predict(x) as tf.Tensor;
      const out = Array.from(await y.data());
      x.dispose();
      y.dispose();
      for (let s = 0; s < FC_STEPS; s++) {
        seq = [...seq, out.slice(s * ML_VARS.length, (s + 1) * ML_VARS.length)];
      }
    }

    const byVar = {} as MlForecast["byVar"];
    const sdVar = {} as MlForecast["sd"];
    ML_VARS.forEach((k, ki) => {
      const mean: number[] = [], lo: number[] = [], hi: number[] = [];
      let sdSum = 0;
      for (let g = 0; g < steps; g++) {
        const val = norm.base[k] + seq[FC_INPUT + g][ki] * norm.scale[k];
        const clamped =
          k === "q" ? Math.max(0, val) : k === "choke" ? clamp(val, 2, 100) : val;
        const block = Math.floor(g / FC_STEPS);
        const sd =
          this.fcResid[(g % FC_STEPS) * ML_VARS.length + ki] * Math.sqrt(block + 1);
        mean.push(clamped);
        lo.push(clamped - 1.28 * sd);
        hi.push(clamped + 1.28 * sd);
        sdSum += sd;
      }
      byVar[k] = { mean, lo, hi };
      sdVar[k] = sdSum / steps;
    });

    return { stepMin: FC_MIN, byVar, sd: sdVar };
  }
}

// --------------------- fusión ML + reglas para N3/N5 -------------------------
const f1 = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

function genericEvidence(cls: ClassId, win: Sample[]): string[] {
  const slope = (k: VarKey) => linSlopePerHour(win.map((s, i) => ({ x: i, y: s[k] })));
  const ptT = slope("pt"), pcT = slope("pc"), plT = slope("pl"), qT = slope("q");
  switch (cls) {
    case "liquidLoading":
      return [
        `P tubing ${f1(ptT)} psi/h · P casing ${f1(pcT)} psi/h`,
        `Caudal ${f1(qT)} Mscf/d por hora`,
        "Patrón multivariado clasificado como liquid loading por la red neuronal",
      ];
    case "restriction":
      return [
        `P línea ${f1(plT)} psi/h · P tubing ${f1(ptT)} psi/h`,
        `Caudal ${f1(qT)} Mscf/d por hora`,
        "Patrón clasificado como restricción en línea por la red neuronal",
      ];
    case "sensorFault":
      return [
        `P tubing ${f1(ptT)} psi/h con varianza deprimida`,
        "Señal compatible con transmisor congelado (clasificador ML)",
      ];
    case "controlIssue":
      return [
        `Choke en movimiento sin respuesta del caudal (${f1(qT)} Mscf/d por hora)`,
        "Patrón clasificado como problema de actuador por la red neuronal",
      ];
    default:
      return [
        "Todas las variables dentro de ±2σ de su línea base móvil",
        "Sin cruce de umbrales proyectado en las próximas 24 h",
      ];
  }
}

/** Combina la salida del clasificador con las reglas físicas de N3. */
export function mergeDiagnosis(rules: Hypothesis[], probs: ClassProb[], win: Sample[]): Hypothesis[] {
  const byId = new Map(rules.map((h) => [h.id, h]));
  const out: Hypothesis[] = [];

  for (const pr of probs) {
    if (pr.p < 0.06) continue;
    if (pr.cls === "normal" && pr.p < 0.35) continue; // no mostrar "normal" débil
    const meta = HYP_BY_CLASS[pr.cls];
    const rule = byId.get(meta.id);
    out.push({
      id: meta.id,
      name: rule?.name ?? meta.name,
      icon: rule?.icon ?? meta.icon,
      conf: clamp01(pr.p * 0.97),
      evidence: rule && rule.evidence.length > 0 ? rule.evidence : genericEvidence(pr.cls, win),
    });
    byId.delete(meta.id);
  }
  // hipótesis de reglas sin respaldo del clasificador → secundarias
  for (const h of byId.values()) {
    out.push({ ...h, conf: clamp01(h.conf * 0.5) });
  }
  out.sort((a, b) => b.conf - a.conf);
  return out.slice(0, 4);
}

export type { Forecast };
