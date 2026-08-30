// ---------------------------------------------------------------------------
// VIGÍA · histórico de producción diaria (capa demo determinista)
// Cada pozo lleva embebida una declinación "verdadera" (qi, Di, b) derivada de
// su identificador: la tarjeta DCA ajusta Arps sobre esta serie y el usuario
// puede comparar el ajuste contra la verdad conocida. Sin ruido aleatorio de
// reloj: mismas entradas → misma serie (testeable).
// Cuando el puente OPC-UA aporta histórico real, la misma tarjeta consume esa
// serie sin cambios de código.
// ---------------------------------------------------------------------------

import { arpsRate } from "./arps";

export interface DailyHistory {
  t: number[]; // días desde el inicio del histórico (último punto = hoy)
  q: number[]; // caudal medio diario (Mscf/d)
  truth: { qi: number; Di: number; b: number }; // parámetros embebidos (demo)
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash estable de cadena (FNV-1a 32 bit) — semilla determinista por pozo. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Genera `days` días de caudal medio diario con declinación hiperbólica
 * embebida, ruido gaussiano suave (~2 %) y oscilación semanal (~1.5 %).
 * @param baseQ caudal de referencia del pozo (WellSim.base.q) — el qi del
 *        histórico es algo superior para reflejar producción temprana.
 */
export function dailyHistory(id: string, baseQ: number, days = 180): DailyHistory {
  const h = hashId(id);
  const rnd = mulberry32(h);
  const rnorm = () => {
    // Box–Muller con el PRNG determinista
    const u1 = Math.max(rnd(), 1e-9);
    const u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const b = 0.35 + (h % 1000) / 1000 * 0.8; // 0.35 .. 1.15
  const DiMonth = 0.02 + ((h >>> 10) % 1000) / 1000 * 0.05; // 2 % .. 7 % mensual
  const Di = Math.pow(1 + DiMonth, 1 / 30) - 1; // nominal diaria equivalente
  const qi = baseQ * (1.18 + ((h >>> 20) % 100) / 100 * 0.25);
  const phase = (h % 628) / 100;

  const t: number[] = [];
  const q: number[] = [];
  for (let d = 0; d < days; d++) {
    const base = arpsRate(d, qi, Di, b);
    const week = 1 + 0.015 * Math.sin((2 * Math.PI * d) / 7 + phase);
    const noise = 1 + 0.02 * rnorm();
    const v = base * week * noise;
    t.push(d);
    q.push(Math.max(baseQ * 0.15, v)); // piso físico: nunca por debajo del 15 %
  }
  return { t, q, truth: { qi, Di, b } };
}
