// ---------------------------------------------------------------------------
// VIGÍA ML · agente del motor DENTRO del Web Worker
// Todo el ML (entrenamiento N1/N2/N3 + inferencia) corre aquí, fuera del
// hilo principal: la interfaz mantiene 60 fps durante el entrenamiento.
// El motor es el mismo VigiaEngine — solo cambia el contexto de ejecución.
// ---------------------------------------------------------------------------
import { VigiaEngine } from "./engine";
import type { Sample, VarKey } from "../sim";

// tf.nextFrame usa requestAnimationFrame cuando está disponible; en un worker
// no existe, así que se pisa con un setTimeout de 16 ms (mismo ritmo visual).
const g = self as unknown as {
  requestAnimationFrame?: (cb: (t: number) => void) => number;
  onmessage: unknown;
};
if (typeof g.requestAnimationFrame === "undefined") {
  g.requestAnimationFrame = (cb) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

type Buf = Sample[];
type Base = Record<VarKey, number>;

type WorkerReq =
  | { type: "train" }
  | { type: "abort" }
  | { type: "dispose" }
  | { type: "assess"; id: number; buf: Buf; base: Base }
  | { type: "forecast"; id: number; buf: Buf; base: Base; steps: number };

let eng: VigiaEngine | null = null;

async function handle(m: WorkerReq): Promise<void> {
  switch (m.type) {
    case "train": {
      eng = new VigiaEngine();
      try {
        const ok = await eng.trainAll((s) => {
          (self as unknown as Worker).postMessage({ type: "progress", state: s });
        });
        (self as unknown as Worker).postMessage({
          type: "trainDone",
          ok,
          backend: eng.backend,
        });
      } catch (err) {
        (self as unknown as Worker).postMessage({
          type: "trainDone",
          ok: false,
          backend: "—",
          error: String((err as Error)?.message ?? err),
        });
      }
      break;
    }
    case "abort":
      eng?.abort();
      break;
    case "dispose":
      eng?.dispose();
      eng = null;
      break;
    case "assess": {
      if (!eng) {
        (self as unknown as Worker).postMessage({ type: "result", id: m.id, result: null });
        break;
      }
      try {
        const result = await eng.assess(m.buf, m.base);
        (self as unknown as Worker).postMessage({ type: "result", id: m.id, result });
      } catch {
        (self as unknown as Worker).postMessage({ type: "result", id: m.id, result: null });
      }
      break;
    }
    case "forecast": {
      if (!eng) {
        (self as unknown as Worker).postMessage({ type: "result", id: m.id, result: null });
        break;
      }
      try {
        const result = await eng.forecastSeries(m.buf, m.base, m.steps);
        (self as unknown as Worker).postMessage({ type: "result", id: m.id, result });
      } catch {
        (self as unknown as Worker).postMessage({ type: "result", id: m.id, result: null });
      }
      break;
    }
  }
}

g.onmessage = (e: MessageEvent<WorkerReq>) => void handle(e.data);
