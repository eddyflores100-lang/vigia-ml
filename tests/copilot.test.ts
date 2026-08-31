import { describe, it, expect } from "vitest";
import { createFleet } from "../src/lib/sim";
import type { WellSim } from "../src/lib/sim";
import { anomaly, dataQuality, diagnose, projections, recommend } from "../src/lib/models";
import {
  answerQuestion,
  explainOf,
  fmtHours,
  normalizeQ,
  narrativeReport,
} from "../src/lib/copilot";
import type { CopilotContext } from "../src/lib/copilot";

/** Contexto realista: flota demo con PN-041 en liquid loading establecido. */
function buildCtx(id = "PN-041"): CopilotContext {
  const fleet: WellSim[] = createFleet();
  for (const w of fleet) {
    const a = anomaly(w.buf.slice(-240));
    w.score = a.score;
    w.level = a.level;
  }
  const sel = fleet.find((w) => w.id === id)!;
  const samples = sel.buf.slice(-240);
  const anom = anomaly(samples);
  const diag = diagnose(sel.buf.slice(-160));
  const proj = projections(samples, sel.base, null);
  return {
    well: { id: sel.id, name: sel.name, field: sel.field, depth: sel.depth },
    samples,
    base: sel.base,
    anom: { score: anom.score, level: anom.level, contributions: anom.contributions, ml: false },
    diag,
    diagMl: false,
    proj,
    recs: recommend(diag, proj, samples),
    dq: dataQuality(sel.buf.slice(-260)),
    events: fleet.flatMap((w) => w.events).sort((a, b) => b.m - a.m).slice(0, 42),
    fleet: fleet.map((w) => ({ id: w.id, name: w.name, level: w.level, score: w.score, qNow: w.last.q })),
  };
}

describe("copiloto — normalización y utilidades", () => {
  it("normalizeQ quita acentos, signos y espacios redundantes", () => {
    expect(normalizeQ("¿Cómo está el pozo?")).toBe("como esta el pozo");
    expect(normalizeQ("¿Cuál es el EUR?")).toBe("cual es el eur");
    expect(normalizeQ("Medición  virtual    ")).toBe("medicion virtual");
  });

  it("fmtHours cambia a días legibles por encima de 72 h", () => {
    expect(fmtHours(34)).toContain("h");
    expect(fmtHours(100)).toContain("d");
  });
});

describe("copiloto — intents sobre la flota demo", () => {
  it("estado: identifica el pozo, el nivel y el caudal", () => {
    const a = answerQuestion("¿Cómo está el pozo?", buildCtx());
    expect(a.intent).toBe("estado");
    expect(a.answer).toContain("PN-041");
    expect(a.answer).toContain("Mscf/d");
    expect(a.bullets.length).toBeGreaterThanOrEqual(3);
  });

  it("diagnóstico: reporta la hipótesis activa con confianza", () => {
    const a = answerQuestion("¿Qué le pasa a este pozo?", buildCtx());
    expect(a.intent).toBe("diagnostico");
    expect(a.answer).toMatch(/Diagnóstico activo|Sin fallas activas/);
    expect(a.bullets.length).toBeGreaterThan(0);
  });

  it("caudal: valor actual, comparación con base y tendencia por hora", () => {
    const a = answerQuestion("¿Cuánto caudal está produciendo?", buildCtx());
    expect(a.intent).toBe("caudal");
    expect(a.answer).toContain("Mscf/d");
    expect(a.bullets.some((b) => b.includes("Tendencia"))).toBe(true);
  });

  it("presión: distingue tubing, casing y línea por sus tags", () => {
    const ctx = buildCtx();
    expect(answerQuestion("¿Cómo va la presión de tubing?", ctx).answer).toContain("PT-101");
    expect(answerQuestion("¿Y la presión de casing?", ctx).answer).toContain("PT-102");
    expect(answerQuestion("Presión de línea?", ctx).answer).toContain("PT-108");
  });

  it("anomalía: la respuesta usa la explicabilidad (drivers con tag)", () => {
    const a = answerQuestion("¿Por qué subió el índice de anomalía?", buildCtx());
    expect(a.intent).toBe("anomalia");
    expect(a.answer).toContain("/100");
    expect(a.bullets.length).toBe(3);
  });

  it("RUL: con episodio activo entrega falla estimada y rango p10–p90", () => {
    const a = answerQuestion("¿Cuándo se estima la falla?", buildCtx());
    expect(a.intent).toBe("rul");
    expect(a.answer).toMatch(/falla se estima en/);
    expect(a.answer).toContain("p10");
    expect(a.bullets.length).toBeGreaterThanOrEqual(3);
  });

  it("declinación: EUR en MMscf con R² del ajuste Arps", () => {
    const a = answerQuestion("¿Cuál es el EUR del pozo?", buildCtx());
    expect(a.intent).toBe("declinacion");
    expect(a.answer).toContain("MMscf");
    expect(a.answer).toMatch(/R²/);
  });

  it("medidor: contrasta Q virtual contra el medidor con Cd calibrado", () => {
    const a = answerQuestion("¿El medidor concuerda con la medición virtual?", buildCtx());
    expect(a.intent).toBe("medidor");
    expect(a.answer).toMatch(/Q virtual|Cd calibrado/);
  });

  it("eventos: resume severidades del registro de la flota", () => {
    const a = answerQuestion("Muéstrame los eventos recientes", buildCtx());
    expect(a.intent).toBe("eventos");
    expect(a.answer).toContain("eventos");
  });

  it("calidad de datos: nota y veredicto de telemetría", () => {
    const a = answerQuestion("¿Cómo está la calidad de datos?", buildCtx());
    expect(a.intent).toBe("calidad");
    expect(a.answer).toMatch(/\/100/);
  });

  it("recomendaciones: prioridad y texto de la acción principal", () => {
    const a = answerQuestion("¿Qué recomendaciones hay?", buildCtx());
    expect(a.intent).toBe("recomendaciones");
    expect(a.answer.length).toBeGreaterThan(20);
  });

  it("flota: señala el pozo más crítico con su identificador", () => {
    const a = answerQuestion("¿Cuál es el peor pozo de la flota?", buildCtx());
    expect(a.intent).toBe("flota");
    expect(a.answer).toMatch(/[A-Z]{2}-\d{3}/);
    expect(a.bullets.length).toBeGreaterThan(0);
  });

  it("proyección: riesgo 24 h con condición y probabilidad", () => {
    const a = answerQuestion("¿Cuál es el riesgo de cruzar el umbral?", buildCtx());
    expect(a.intent).toBe("proyeccion");
    expect(a.answer).toContain("24 h");
  });

  it("resumen narrativo: 8 secciones numeradas de estado a acciones", () => {
    const a = narrativeReport(buildCtx());
    expect(a.intent).toBe("resumen");
    expect(a.answer).toContain("1 · ESTADO");
    expect(a.answer).toContain("5 · VIDA ÚTIL");
    expect(a.answer).toContain("8 · ACCIONES");
  });

  it("ayuda y fallback: capacidades y reformulación sugerida", () => {
    const ctx = buildCtx();
    expect(answerQuestion("¿Qué puedes hacer?", ctx).intent).toBe("ayuda");
    const f = answerQuestion("color favorito del choke", ctx);
    expect(f.intent).toBe("fallback");
    expect(f.bullets.length).toBe(5);
  });

  it("tolerante a acentos y mayúsculas: 'CUAL ES EL EUR DEL POZO' también responde DCA", () => {
    const a = answerQuestion("CUAL ES EL EUR DEL POZO", buildCtx());
    expect(a.intent).toBe("declinacion");
  });

  it("sinónimos en inglés básicos: 'gas flow' cae en caudal", () => {
    const a = answerQuestion("what about the gas flow", buildCtx());
    expect(a.intent).toBe("caudal");
  });

  it("determinismo: la misma consulta da la misma respuesta byte a byte", () => {
    const ctx = buildCtx();
    const a1 = JSON.stringify(answerQuestion("¿Cómo está el pozo?", ctx));
    const a2 = JSON.stringify(answerQuestion("¿Cómo está el pozo?", ctx));
    expect(a1).toBe(a2);
  });

  it("explainOf integra el módulo de explicabilidad con el contexto del copiloto", () => {
    const ex = explainOf(buildCtx());
    expect(ex.drivers.length).toBe(6);
    expect(ex.score).toBeGreaterThanOrEqual(0);
  });
});

describe("copilot v0.11 — setpoints y gemelo digital", () => {
  it("'¿Cuál es el choke óptimo?' activa el intent setpoints con consejo cuantitativo", () => {
    const a = answerQuestion("¿Cuál es el choke óptimo?", buildCtx("GN-118"));
    expect(a.intent).toBe("setpoints");
    expect(a.answer).toMatch(/choke|apertura/i);
    expect(a.answer).toMatch(/Mscf\/d/);
    expect(a.bullets.some((b) => b.includes("Ascenso") || b.includes("Erosión"))).toBe(true);
  });

  it("'¿Cómo está el gemelo digital?' activa el intent gemelo con calidad y brecha", () => {
    const a = answerQuestion("¿Cómo está el gemelo digital?", buildCtx("GN-118"));
    expect(a.intent).toBe("gemelo");
    expect(a.answer).toMatch(/gemelo/i);
    expect(a.bullets.length).toBeGreaterThan(1);
  });

  it("los modos nuevos de falla se nombran correctamente en RUL", () => {
    const ctx = buildCtx("PN-041"); // liquid loading en curso
    const a = answerQuestion("¿Cuándo se estima la falla?", ctx);
    expect(a.intent).toBe("rul");
    expect(a.answer.length).toBeGreaterThan(10);
  });
});
