// ---------------------------------------------------------------------------
// VIGÍA ML · proxy del motor de ML que corre en un Web Worker
// Expone EXACTAMENTE la misma interfaz EngineLike que VigiaEngine, de modo
// que la app no sabe (ni le importa) si el ML corre en el hilo principal o
// en el worker. Incluye fábrica createEngine() con fallback al motor en
// hilo principal si el entorno no soporta workers con módulos.
// ---------------------------------------------------------------------------
import { VigiaEngine } from "./engine";
import type { ClassProb, EngineLike, MlAnomaly, MlForecast, TrainState } from "./engine";
import type { Sample, VarKey } from "../sim";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

type WorkerRes =
  | { type: "progress"; state: TrainState }
  | { type: "trainDone"; ok: boolean; backend: string; error?: string }
  | { type: "result"; id: number; result: unknown };

export class EngineProxy implements EngineLike {
  ready = false;
  backend = "—";

  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private progressCb: ((s: TrainState) => void) | null = null;
  private trainResolve: ((ok: boolean) => void) | null = null;

  constructor() {
    this.worker = new Worker(new URL("./engineWorker.ts", import.meta.url), {
      type: "module",
      name: "vigia-ml-engine",
    });
    this.worker.onmessage = (e: MessageEvent<WorkerRes>) => {
      const m = e.data;
      if (m.type === "progress") {
        this.progressCb?.(m.state);
      } else if (m.type === "trainDone") {
        this.ready = m.ok;
        this.backend = m.backend;
        const res = this.trainResolve;
        this.trainResolve = null;
        this.progressCb = null;
        res?.(m.ok);
      } else if (m.type === "result") {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (p) p.resolve(m.result);
      }
    };
    this.worker.onerror = () => {
      // fallo del worker (p. ej. sin soporte): se resuelven los pendientes
      // como "sin resultado" y el pipeline estadístico toma el control
      for (const [, p] of this.pending) p.resolve(null);
      this.pending.clear();
      const res = this.trainResolve;
      this.trainResolve = null;
      this.progressCb = null;
      res?.(false);
    };
  }

  trainAll(cb: (s: TrainState) => void): Promise<boolean> {
    this.progressCb = cb;
    const promise = new Promise<boolean>((resolve) => {
      this.trainResolve = resolve;
    });
    this.worker.postMessage({ type: "train" });
    return promise;
  }

  abort(): void {
    this.worker.postMessage({ type: "abort" });
  }

  dispose(): void {
    this.ready = false;
    this.worker.terminate();
    for (const [, p] of this.pending) p.resolve(null);
    this.pending.clear();
    const res = this.trainResolve;
    this.trainResolve = null;
    this.progressCb = null;
    res?.(false);
  }

  assess(
    samples: Sample[],
    base: Record<VarKey, number>,
  ): Promise<{ anom: MlAnomaly; probs: ClassProb[] } | null> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ type: "assess", id, buf: samples, base });
    });
  }

  forecastSeries(
    samples: Sample[],
    base: Record<VarKey, number>,
    steps: number,
  ): Promise<MlForecast | null> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ type: "forecast", id, buf: samples, base, steps });
    });
  }
}

/** Motor en worker; si el entorno no soporta module workers, fallback local. */
export function createEngine(): EngineLike {
  try {
    return new EngineProxy();
  } catch {
    return new VigiaEngine();
  }
}
