import { describe, it, expect } from "vitest";
import {
  ReplayEngine,
  diagToClass,
  labelToClass,
  SPEEDS,
  type ReplayRow,
} from "../src/lib/replay/replayEngine";

const T0 = Date.UTC(2025, 0, 1);

function row(min: number, label: string | null, q = 2000): ReplayRow {
  return {
    ts: T0 + min * 60000,
    pt: 560,
    pc: 780,
    pl: 430,
    temp: 44,
    q,
    choke: 54,
    label,
  };
}

describe("replayEngine — mapeos de clase", () => {
  it("mapea ids de hipótesis a clases puntuadas", () => {
    expect(diagToClass("normal")).toBe("normal");
    expect(diagToClass("liquid-loading")).toBe("liquidLoading");
    expect(diagToClass("restriction")).toBe("restriction");
    expect(diagToClass("control-issue")).toBe("controlIssue");
    expect(diagToClass("sensor-pt")).toBe("sensorFault");
    expect(diagToClass("spike-pc")).toBe("sensorFault");
    expect(diagToClass("casing-leak")).toBe("otras");
    expect(diagToClass("hydrates")).toBe("otras");
  });

  it("normaliza etiquetas de CSV con variantes de idioma y tildes", () => {
    expect(labelToClass("normal")).toBe("normal");
    expect(labelToClass("Normal")).toBe("normal");
    expect(labelToClass("liquid_loading")).toBe("liquidLoading");
    expect(labelToClass("Liquid Loading")).toBe("liquidLoading");
    expect(labelToClass("carga de líquidos")).toBe("liquidLoading");
    expect(labelToClass("restriction")).toBe("restriction");
    expect(labelToClass("sensor fault")).toBe("sensorFault");
    expect(labelToClass("fuga anular")).toBe("otras");
    expect(labelToClass("hidratos")).toBe("otras");
    expect(labelToClass("")).toBeNull();
  });
});

describe("replayEngine — reproducción", () => {
  it("emite filas a la velocidad pedida con reloj inyectado", () => {
    const rows = Array.from({ length: 150 }, (_, i) => row(i, null));
    const batches: ReplayRow[][] = [];
    const eng = new ReplayEngine(rows, (b) => batches.push(b));
    expect(eng.progress.status).toBe("ready");

    // velocidad 300× → 500 filas/s → 0.2 s de pared = 100 filas
    eng.setSpeed(300);
    const t0 = 1_000;
    expect(eng.play(t0)).toBe(true);
    expect(eng.pump(t0)).toHaveLength(0); // aún no ha transcurrido EMIT_MS
    const out = eng.pump(t0 + 200); // +200 ms
    expect(out.length).toBe(100);
    expect(eng.progress.idx).toBe(100);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(100);
  });

  it("acumula filas fraccionarias entre emisiones (velocidad 1×)", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i, null));
    const eng = new ReplayEngine(rows, () => {});
    eng.setSpeed(1); // 1 fila / 0.6 s
    const t0 = 5_000;
    eng.play(t0);
    let emitted = 0;
    for (let t = t0 + 200; t <= t0 + 3000; t += 200) emitted += eng.pump(t).length;
    // 3 s de pared a 1× → ~5 filas (±1 por acarreo)
    expect(emitted).toBeGreaterThanOrEqual(4);
    expect(emitted).toBeLessThanOrEqual(6);
  });

  it("pause/stop/reset controlan el estado", () => {
    const rows = Array.from({ length: 100 }, (_, i) => row(i, null));
    const eng = new ReplayEngine(rows, () => {});
    eng.setSpeed(60);
    const t0 = 100;
    eng.play(t0);
    eng.pump(t0);
    eng.pump(t0 + 300);
    expect(eng.progress.status).toBe("playing");
    eng.pause();
    expect(eng.progress.status).toBe("paused");
    expect(eng.pump(t0 + 600)).toHaveLength(0); // en pausa no emite
    eng.play(t0 + 600);
    eng.stop();
    expect(eng.progress.status).toBe("ready");
    expect(eng.progress.idx).toBeGreaterThan(0);
    eng.reset();
    expect(eng.progress.idx).toBe(0);
  });

  it("termina (done) al agotar las filas y puede reiniciar con play", () => {
    const rows = [row(0, null), row(1, null), row(2, null)];
    const eng = new ReplayEngine(rows, () => {});
    eng.setSpeed(900);
    eng.play(1_000);
    eng.pump(1_000);
    eng.pump(2_000);
    expect(eng.progress.status).toBe("done");
    expect(eng.play(3_000)).toBe(true); // reinicia
    expect(eng.progress.idx).toBe(0);
  });

  it("seek salta a una posición sin emitir y respeta límites", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i, null));
    const eng = new ReplayEngine(rows, () => {});
    eng.seek(5);
    expect(eng.progress.idx).toBe(5);
    expect(eng.currentLabel).toBe(rows[4].label);
    eng.seek(999);
    expect(eng.progress.idx).toBe(10);
    expect(eng.progress.status).toBe("done");
    eng.seek(-3);
    expect(eng.progress.idx).toBe(0);
    expect(eng.progress.status).not.toBe("done");
  });
});

describe("replayEngine — puntuación", () => {
  it("compone matriz de confusión, F1 y exactitud sobre ticks etiquetados", () => {
    // 10 min normal, 10 min liquid loading, 10 min normal
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row(i, "normal")),
      ...Array.from({ length: 10 }, (_, i) => row(10 + i, "liquid_loading")),
      ...Array.from({ length: 10 }, (_, i) => row(20 + i, "normal")),
    ];
    const eng = new ReplayEngine(rows, () => {});
    // el diagnóstico dominante acierta todo salvo los primeros 3 min del evento
    const preds = [
      ...Array(10).fill("normal"),
      ...Array(3).fill("normal"),
      ...Array(7).fill("liquid-loading"),
      ...Array(10).fill("normal"),
    ];
    for (let i = 1; i <= 30; i++) {
      eng.seek(i);
      eng.scoreTick(preds[i - 1]);
    }
    const sc = eng.score();
    expect(sc.hasLabels).toBe(true);
    expect(sc.nTicks).toBe(30);
    // exactitud: 27/30
    expect(sc.accuracy).toBeCloseTo(27 / 30, 6);
    const ll = sc.perClass.find((c) => c.cls === "liquidLoading")!;
    expect(ll.support).toBe(10);
    expect(ll.precision).toBeCloseTo(1, 6);
    expect(ll.recall).toBeCloseTo(0.7, 6);
    expect(ll.f1).toBeCloseTo((2 * 1 * 0.7) / 1.7, 6);
  });

  it("mide el retardo de detección del evento", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => row(i, "normal")),
      ...Array.from({ length: 10 }, (_, i) => row(5 + i, "liquid_loading")),
      ...Array.from({ length: 5 }, (_, i) => row(15 + i, "normal")),
    ];
    const eng = new ReplayEngine(rows, () => {});
    // detecta en el minuto 8 del evento (3 min de retardo)
    const preds = [
      ...Array(5).fill("normal"), // minutos 0-4
      ...Array(3).fill("normal"), // minutos 5-7: aún no detecta
      "liquid-loading", // minuto 8
      ...Array(6).fill("liquid-loading"),
      ...Array(5).fill("normal"),
    ];
    for (let i = 1; i <= 20; i++) {
      eng.seek(i);
      eng.scoreTick(preds[i - 1]);
    }
    const sc = eng.score();
    expect(sc.events).toHaveLength(1);
    expect(sc.events[0].delayMin).toBeCloseTo(3, 6);
    expect(sc.meanDelayMin).toBeCloseTo(3, 6);
    expect(sc.missedEvents).toBe(0);
  });

  it("cuenta eventos no detectados y separa segmentos lejanos", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => row(i, "normal")),
      ...Array.from({ length: 5 }, (_, i) => row(5 + i, "restriction")),
      ...Array.from({ length: 5 }, (_, i) => row(10 + i, "normal")),
      ...Array.from({ length: 5 }, (_, i) => row(30 + i, "restriction")), // evento 2 (lejano)
      ...Array.from({ length: 5 }, (_, i) => row(35 + i, "normal")),
    ];
    const eng = new ReplayEngine(rows, () => {});
    // el diagnóstico nunca acierta ninguna restricción
    for (let i = 1; i <= 25; i++) {
      eng.seek(i);
      eng.scoreTick("normal");
    }
    const sc = eng.score();
    expect(sc.events).toHaveLength(2);
    expect(sc.missedEvents).toBe(2);
    expect(sc.meanDelayMin).toBeNull();
  });

  it("sin etiquetas no puntúa pero reporta hasLabels=false", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i, null));
    const eng = new ReplayEngine(rows, () => {});
    expect(eng.hasLabels).toBe(false);
    eng.seek(10);
    expect(eng.scoreTick("normal")).toBeNull();
    const sc = eng.score();
    expect(sc.hasLabels).toBe(false);
    expect(sc.nTicks).toBe(0);
  });

  it("SPEEDS está ordenado y contiene 1× y 900×", () => {
    expect(SPEEDS[0]).toBe(1);
    expect(SPEEDS[SPEEDS.length - 1]).toBe(900);
    expect([...SPEEDS]).toEqual([...SPEEDS].sort((a, b) => a - b));
  });
});
