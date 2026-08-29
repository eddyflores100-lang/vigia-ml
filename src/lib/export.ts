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

// ---------------------------------------------------------------------------
// reporte imprimible (PDF vía el diálogo nativo del navegador)
// Abre una ventana limpia con el reporte en formato A4 y lanza window.print().
// Si el navegador bloquea la ventana emergente, cae a la descarga JSON.
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function reportHtml(report: WellReport): string {
  const r = report;
  const sevColor = (lvl: string) =>
    lvl === "ÓPTIMO" ? "#0a7d5c" : lvl === "VIGILAR" ? "#9a6a00" : lvl === "ALERTA" ? "#b04a12" : "#a12619";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>VIGÍA · Reporte ${esc(r.well.id)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif; color: #17242a; margin: 0; font-size: 12px; }
  header { border-bottom: 3px solid #0f8d72; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  h1 { margin: 0; font-size: 21px; letter-spacing: 0.04em; }
  h2 { font-size: 12px; letter-spacing: 0.12em; color: #4a5f66; margin: 16px 0 6px; text-transform: uppercase; border-bottom: 1px solid #d7e2e5; padding-bottom: 3px; }
  .meta { text-align: right; font-size: 11px; color: #4a5f66; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 3px; color: #fff; font-weight: 600; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  th { text-align: left; font-size: 10px; letter-spacing: 0.08em; color: #4a5f66; border-bottom: 1px solid #d7e2e5; padding: 4px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e8eef0; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .ev { color: #4a5f66; font-size: 11px; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #d7e2e5; font-size: 9.5px; color: #6d838a; display: flex; justify-content: space-between; }
  @media print { button { display: none; } }
  button { margin: 10px 0; padding: 8px 18px; background: #0f8d72; border: 0; color: #fff; font-size: 13px; border-radius: 4px; cursor: pointer; }
</style></head><body>
<header>
  <div>
    <h1>VIGÍA · Reporte operativo ${esc(r.well.id)}</h1>
    <div class="ev">${esc(r.well.name)} · ${esc(r.well.field)} · TVD ${esc(r.well.depth)}</div>
  </div>
  <div class="meta">Generado: ${esc(new Date(r.generatedAt).toLocaleString("es"))}<br>Minuto simulado: ${r.simMinute}<br>Fuente de anomalía: ${esc(r.anomaly.source)}</div>
</header>
<h2>Anomalía (N2)</h2>
<span class="badge" style="background:${sevColor(r.anomaly.level)}">${esc(r.anomaly.level)} · ${r.anomaly.score}/100</span>
<table><tr><th>Variable contribuyente</th><th class="num">z-score</th></tr>
${r.anomaly.contributions.map((c) => `<tr><td>${esc(c.variable)}</td><td class="num">${c.z.toFixed(2)}</td></tr>`).join("") || '<tr><td class="ev">sin contribuyentes destacados</td></tr>'}
</table>
<h2>Diagnóstico (N3)</h2>
<table><tr><th>Hipótesis</th><th class="num">Confianza</th><th>Evidencia</th></tr>
${r.diagnosis.map((d) => `<tr><td><b>${esc(d.name)}</b></td><td class="num">${(d.confidence * 100).toFixed(0)}%</td><td class="ev">${d.evidence.map(esc).join(" · ")}</td></tr>`).join("")}
</table>
<h2>Proyección a 24 h (N4)</h2>
<table><tr><th>Condición</th><th class="num">Probabilidad</th><th class="num">Horas estimadas</th><th class="num">Umbral</th></tr>
${r.projection.map((p) => `<tr><td>${esc(p.condition)}</td><td class="num">${(p.probability * 100).toFixed(0)}%</td><td class="num">${p.hoursEst !== null ? `${p.hoursEst} h` : "—"}</td><td class="num">${Math.round(p.threshold)}</td></tr>`).join("")}
</table>
<h2>Recomendaciones (N5)</h2>
<table><tr><th>Prioridad</th><th>Acción</th></tr>
${r.recommendations.map((x) => `<tr><td><b>${esc(x.priority)}</b></td><td>${esc(x.text)}</td></tr>`).join("")}
</table>
<h2>Calidad de datos</h2>
<p><b>Grado ${esc(r.dataQuality.grade)}</b> · ${r.dataQuality.overall}/100 — ${esc(r.dataQuality.verdict)}</p>
<h2>Eventos recientes</h2>
<table><tr><th class="num">Min</th><th>Pozo</th><th>Mensaje</th></tr>
${r.events.slice(0, 15).map((e) => `<tr><td class="num">${e.m}</td><td>${esc(e.wellId)}</td><td class="ev">${esc(e.msg)}</td></tr>`).join("")}
</table>
<footer><span>VIGÍA ML · telemetría sintética con fines de demostración · AliceLabs Source-Available License v1.0 (AL-1.0)</span><span>legal@alicelabs.site</span></footer>
<button onclick="window.print()">Guardar como PDF / Imprimir</button>
<script>window.onload = () => setTimeout(() => window.print(), 350);</script>
</body></html>`;
}

export function printWellReport(report: WellReport) {
  const w = window.open("", "_blank", "width=920,height=1080");
  if (!w) {
    // popup bloqueado → fallback honesto: descarga el mismo reporte en JSON
    downloadWellReportJson(report);
    return;
  }
  w.document.open();
  w.document.write(reportHtml(report));
  w.document.close();
  w.focus();
}
