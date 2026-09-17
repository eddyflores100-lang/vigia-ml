// ---------------------------------------------------------------------------
// VIGÍA · generador del CSV demo etiquetado (tools/gen-demo-csv.ts)
// Reproduce el simulador WellSim real con un guion de eventos y emite el CSV
// de telemetría con columna `event` — la "verdad de campo" contra la que el
// reproductor v0.12 puntúa la detección. Ejecutar: npx tsx tools/gen-demo-csv.ts
// ---------------------------------------------------------------------------
import { writeFileSync } from "node:fs";
import { WellSim } from "../src/lib/sim";
import type { Scenario } from "../src/lib/sim";

// guion: [minuto, régimen] — desarrollo y recuperación completos
const SCRIPT: Array<[number, Scenario]> = [
  [0, "normal"],
  [360, "liquidLoading"],
  [800, "normal"],
  [1160, "restriction"],
  [1520, "normal"],
  [1880, "sensorFault"],
  [2240, "normal"],
  [2600, "controlIssue"],
  [2960, "normal"],
];

const T0 = Date.UTC(2025, 0, 1, 0, 0);
const TOTAL = 3320;

const well = new WellSim({
  id: "PN-041",
  name: "Piedemonte Norte 41",
  field: "Piedemonte Llanero",
  depth: "3.842 m",
  base: { pt: 560, pc: 780, pl: 430, temp: 44, q: 2250, choke: 54 },
  seed: 4242,
  script: [],
  preRun: 0,
});

const lines: string[] = ["ts,pt,pc,pl,temp,q,choke,event"];
let scenario: Scenario = "normal";
for (let m = 1; m <= TOTAL; m++) {
  const next = SCRIPT.find(([at]) => at === m);
  if (next) {
    scenario = next[1];
    well.setScenario(scenario);
  }
  well.tick();
  const s = well.last;
  const ts = new Date(T0 + m * 60000).toISOString().slice(0, 16).replace("T", " ");
  lines.push(
    `${ts},${s.pt.toFixed(1)},${s.pc.toFixed(1)},${s.pl.toFixed(1)},${s.temp.toFixed(2)},${s.q.toFixed(1)},${s.choke.toFixed(1)},${scenario}`,
  );
}

const out = "public/data/demo-etiquetado.csv";
writeFileSync(out, lines.join("\n"), "utf8");
console.log(`${out}: ${lines.length - 1} filas, ${(lines.length - 1) / 60} h de telemetría, 5 regímenes etiquetados`);
