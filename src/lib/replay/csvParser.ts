// ---------------------------------------------------------------------------
// VIGÍA · parser de CSV de telemetría para el reproductor de histórico (v0.12)
// Acepta CSV/TSV con separador , ; o tabulación (autodetectado), decimales con
// punto o coma (según separador), encabezados flexibles (sinónimos en ES/EN y
// nombres comunes de exportadores SCADA/historiadores) y columna opcional de
// etiqueta de evento (`event`). Valida y reporta calidad: huecos, duplicados,
// filas inválidas, valores fuera de rango físico y columnas sin fuente.
// Puro, sin DOM: testeable.
// ---------------------------------------------------------------------------

export type ReplayVar = "pt" | "pc" | "pl" | "temp" | "q" | "choke";

export interface ReplayRow {
  ts: number; // epoch ms
  pt: number | null;
  pc: number | null;
  pl: number | null;
  temp: number | null;
  q: number | null;
  choke: number | null;
  label: string | null; // etiqueta de evento (columna opcional)
}

export interface ColumnMap {
  ts: string;
  vars: Partial<Record<ReplayVar, string>>;
  label: string | null;
}

export interface QualityReport {
  nRows: number; // filas de datos leídas
  nValid: number; // filas válidas (ts parseable)
  nDropped: number; // filas descartadas (ts inválido o todo vacío)
  nDupes: number; // timestamps duplicados (se conserva el último)
  nGaps: number; // huecos > 3× intervalo mediano
  intervalMin: number; // intervalo mediano (minutos)
  spanMin: number; // duración total (minutos)
  outOfRange: Partial<Record<ReplayVar, number>>; // valores clampeados por rango físico
  missing: ReplayVar[]; // columnas sin fuente (se mantendrá el último valor)
  firstTs: number;
  lastTs: number;
}

export interface ParseResult {
  rows: ReplayRow[]; // ordenadas por ts, únicas
  columns: ColumnMap;
  quality: QualityReport;
  warnings: string[];
}

// rangos físicos de saneamiento (coherentes con sim.ts SAN_LO/SAN_HI)
const RANGE: Record<ReplayVar, [number, number]> = {
  pt: [0, 15000],
  pc: [0, 15000],
  pl: [0, 15000],
  temp: [-20, 200],
  q: [0, 60000],
  choke: [0, 100],
};

// sinónimos de encabezado (normalizados: minúsculas, sin espacios laterales)
const SYNONYMS: Record<string, ReplayVar | "ts" | "label"> = {
  // tiempo
  ts: "ts", time: "ts", fecha: "ts", date: "ts", timestamp: "ts", "dateprd": "ts",
  // presiones
  pt: "pt", whp: "pt", "pt-101": "pt", "presion tubing": "pt", tubing: "pt",
  "avg whp p": "pt", whp_p: "pt", p_tubing: "pt", ptub: "pt", "pthp": "pt",
  pc: "pc", annulus: "pc", "pt-102": "pc", "presion casing": "pc", casing: "pc",
  "avg annulus press": "pc", p_casing: "pc", pann: "pc", "ctp": "pc",
  pl: "pl", "pt-108": "pl", "presion linea": "pl", linea: "pl", line: "pl",
  "thdp": "pl", "downstream": "pl", p_linea: "pl", manifold: "pl",
  // temperatura
  temp: "temp", temperatura: "temp", "tt-201": "temp", "wht": "temp", "avg wht p": "temp", t: "temp",
  // caudal
  q: "q", caudal: "q", rate: "q", "qg": "q", gas: "q", "bore gas vol": "q",
  "gas rate": "q", "qgas": "q", mscf: "q", "ft-301": "q", production: "q",
  // choke
  choke: "choke", apertura: "choke", "choke size": "choke", "fv-401": "choke",
  "avg choke size p": "choke", "choke pct": "choke", valve: "choke",
  // etiqueta
  event: "label", evento: "label", label: "label", etiqueta: "label",
  regimen: "label", fault: "label", clase: "label", class: "label",
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

function detectSep(line: string): string {
  const counts: Array<[string, number]> = [
    [",", (line.match(/,/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function splitLine(line: string, sep: string): string[] {
  // soporte básico de campos entre comillas dobles
  if (!line.includes('"')) return line.split(sep).map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === sep && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toNum(raw: string, decimalComma: boolean): number {
  if (raw === "" || raw === "-" || raw === "—" || raw === "null" || raw === "NULL" || raw === "NaN") return NaN;
  let s = raw.replace(/\s+/g, "");
  if (decimalComma) s = s.replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
}

function parseTs(raw: string): number {
  if (raw === "") return NaN;
  // numérico: epoch en s o ms
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const v = Number(raw);
    return v > 1e12 ? v : v > 1e9 ? v * 1000 : NaN; // ms directo; s → ms
  }
  const t = Date.parse(raw.replace(" ", "T"));
  if (Number.isFinite(t)) return t;
  // formatos DD/MM/YYYY y DD/MM/YYYY HH:mm
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})([ T](\d{1,2}):(\d{2}))?/);
  if (m) {
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[5] ?? 0), Number(m[6] ?? 0)).getTime();
  }
  return NaN;
}

/**
 * Parsea el contenido de un CSV de telemetría al formato interno del
 * reproductor. No lanza: devuelve warnings y un reporte de calidad.
 */
export function parseTelemetryCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    throw new Error("El archivo no contiene filas de datos (se requiere encabezado + al menos una fila).");
  }

  const sep = detectSep(lines[0]);
  const decimalComma = sep === ";";
  const header = splitLine(lines[0], sep).map(norm);

  // mapeo de columnas
  const columns: ColumnMap = { ts: "", vars: {}, label: null };
  const used = new Set<string>();
  for (const col of header) {
    const canon = SYNONYMS[col] ?? SYNONYMS[col.replace(/[_\s]+/g, " ")];
    if (!canon || used.has(canon)) continue;
    if (canon === "ts") columns.ts = col;
    else if (canon === "label") columns.label = col;
    else columns.vars[canon as ReplayVar] = col;
    used.add(canon);
  }
  if (!columns.ts) {
    // fallback: primera columna se interpreta como tiempo
    columns.ts = header[0];
    warnings.push(`No se reconoció columna de tiempo; se asume «${header[0]}».`);
  }
  const missing = (["pt", "pc", "pl", "temp", "q", "choke"] as ReplayVar[]).filter((v) => !columns.vars[v]);
  for (const v of missing) {
    warnings.push(`Columna «${v}» sin fuente: el reproductor mantendrá el último valor conocido.`);
  }

  const idxOf = (name: string) => header.indexOf(name);
  const tsI = idxOf(columns.ts);
  const varI: Partial<Record<ReplayVar, number>> = {};
  for (const [v, col] of Object.entries(columns.vars) as Array<[ReplayVar, string]>) varI[v] = idxOf(col);
  const labelI = columns.label ? idxOf(columns.label) : -1;

  // filas
  const rows: ReplayRow[] = [];
  let nDropped = 0;
  const outOfRange: Partial<Record<ReplayVar, number>> = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep);
    const ts = parseTs(cells[tsI] ?? "");
    if (!Number.isFinite(ts)) { nDropped++; continue; }
    const row: ReplayRow = { ts, pt: null, pc: null, pl: null, temp: null, q: null, choke: null, label: null };
    let anyVar = false;
    for (const v of ["pt", "pc", "pl", "temp", "q", "choke"] as ReplayVar[]) {
      const ci = varI[v];
      if (ci === undefined || ci < 0) continue;
      let val = toNum(cells[ci] ?? "", decimalComma);
      if (Number.isFinite(val)) {
        anyVar = true;
        const [lo, hi] = RANGE[v];
        if (val < lo || val > hi) {
          outOfRange[v] = (outOfRange[v] ?? 0) + 1;
          val = Math.min(hi, Math.max(lo, val));
        }
        row[v] = val;
      }
    }
    if (!anyVar) { nDropped++; continue; }
    if (labelI >= 0) {
      const lab = (cells[labelI] ?? "").trim();
      row.label = lab !== "" ? lab : null;
    }
    rows.push(row);
  }
  if (rows.length === 0) throw new Error("Ninguna fila con tiempo válido y al menos una variable numérica.");

  // orden + duplicados (conserva el último)
  rows.sort((a, b) => a.ts - b.ts);
  const dedup: ReplayRow[] = [];
  let nDupes = 0;
  for (const r of rows) {
    if (dedup.length && dedup[dedup.length - 1].ts === r.ts) { dedup[dedup.length - 1] = r; nDupes++; }
    else dedup.push(r);
  }

  // intervalos y huecos
  const diffs: number[] = [];
  for (let i = 1; i < dedup.length; i++) diffs.push((dedup[i].ts - dedup[i - 1].ts) / 60000);
  const sorted = [...diffs].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const nGaps = diffs.filter((d) => d > Math.max(3 * median, median + 5)).length;
  if (median <= 0) warnings.push("Intervalo de muestreo no positivo: revisa la columna de tiempo.");
  if (nGaps > 0) warnings.push(`${nGaps} hueco(s) > 3× el intervalo mediano (${nf(median, 1)} min).`);
  if (nDupes > 0) warnings.push(`${nDupes} timestamp(s) duplicado(s): se conservó el último valor.`);

  const quality: QualityReport = {
    nRows: lines.length - 1,
    nValid: dedup.length,
    nDropped,
    nDupes,
    nGaps,
    intervalMin: median,
    spanMin: (dedup[dedup.length - 1].ts - dedup[0].ts) / 60000,
    outOfRange,
    missing,
    firstTs: dedup[0].ts,
    lastTs: dedup[dedup.length - 1].ts,
  };
  return { rows: dedup, columns, quality, warnings };
}

const nf = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec }) : "—";

/** Fecha corta legible para la UI del reproductor. */
export const fmtTs = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
