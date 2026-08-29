// ---------------------------------------------------------------------------
// VIGÍA ML · exportación de telemetría y reporte operativo
// Descarga en el navegador, sin backend: CSV de la serie temporal y JSON con
// el reporte completo de la konsola (anomalía, diagnóstico, proyección N4,
// recomendaciones N5 y calidad de datos).
// ---------------------------------------------------------------------------

import type { Sample, VarKey, WellEvent } from "./sim";
import { VAR_META, VAR_KEYS } from "./sim";
import type { AnomalyResult, DataQuality, Hypothesis, ProjRow, Recommendation } from "./models";

function download(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // liberar el objeto tras el ciclo actual: evita fuga en descargas repetidas
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const stamp = (m: number) => {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/** Serie temporal completa del pozo en CSV (BOM UTF-8 para Excel). */
export function downloadWellCsv(wellId: string, samples: Sample[]) {
  const header = ["minuto", ...VAR_KEYS.map((k) => `${VAR_META[k].tag} ${VAR_META[k].label} (${VAR_META[k].unit})`)];
  const lines = samples.map((s) =>
    [s.m, ...VAR_KEYS.map((k) => s[k].toFixed(2))].join(","),
  );
  const csv = "\uFEFF" + [header.join(","), ...lines].join("\r\n");
  download(`vigia-${wellId}-telemetria-${stamp(0)}.csv`, "text/csv;charset=utf-8", csv);
}

export interface WellReport {
  well: { id: string; name: string; field: string; depth: string };
  generatedAt: string;
  simMinute: number;
  anomaly: { score: number; level: string; source: "ML" | "estadístico"; contributions: { variable: string; z: number }[] };
  diagnosis: { id: string; name: string; confidence: number; evidence: string[] }[];
  projection: { variable: string; condition: string; probability: number; hoursEst: number | null; threshold: number }[];
  recommendations: { priority: string; text: string }[];
  dataQuality: { overall: number; grade: string; verdict: string };
  events: WellEvent[];
  samples: Sample[];
}

/** Reporte operativo completo del pozo en JSON estructurado. */
export function buildWellReport(args: {
  well: { id: string; name: string; field: string; depth: string };
  samples: Sample[];
  anom: AnomalyResult;
  anomMl: boolean;
  diag: Hypothesis[];
  proj: ProjRow[];
  recs: Recommendation[];
  dq: DataQuality;
  events: WellEvent[];
}): WellReport {
  const { well, samples, anom, anomMl, diag, proj, recs, dq, events } = args;
  return {
    well: { id: well.id, name: well.name, field: well.field, depth: well.depth },
    generatedAt: new Date().toISOString(),
    simMinute: samples[samples.length - 1]?.m ?? 0,
    anomaly: {
      score: anom.score,
      level: anom.level,
      source: anomMl ? "ML" : "estadístico",
      contributions: anom.contributions.map((c) => ({ variable: VAR_META[c.key as VarKey].tag, z: c.z })),
    },
    diagnosis: diag.map((h) => ({ id: h.id, name: h.name, confidence: h.conf, evidence: h.evidence })),
    projection: proj.map((p) => ({
      variable: VAR_META[p.key].tag,
      condition: p.condition,
      probability: p.prob,
      hoursEst: p.hoursEst,
      threshold: p.thr,
    })),
    recommendations: recs.map((r) => ({ priority: r.prio, text: r.text })),
    dataQuality: { overall: dq.overall, grade: dq.grade, verdict: dq.verdict },
    events: events.slice(0, 40),
    samples,
  };
}

export function downloadWellReportJson(report: WellReport) {
  download(
    `vigia-${report.well.id}-reporte-${stamp(report.simMinute)}.json`,
    "application/json;charset=utf-8",
    JSON.stringify(report, null, 2),
  );
}
