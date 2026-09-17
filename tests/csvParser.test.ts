import { describe, it, expect } from "vitest";
import { parseTelemetryCsv, fmtTs } from "../src/lib/replay/csvParser";

const T0 = Date.UTC(2025, 0, 1, 0, 0); // 2025-01-01 00:00 UTC
const at = (min: number) => new Date(T0 + min * 60000).toISOString().slice(0, 16).replace("T", " ");

describe("csvParser — encabezados y separadores", () => {
  it("parsea el formato canónico de VIGÍA (coma, ISO con espacio)", () => {
    const csv = [
      "ts,pt,pc,pl,temp,q,choke",
      `${at(0)},560,780,430,44.0,2250,54`,
      `${at(1)},558,779,431,44.1,2240,54`,
    ].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].pt).toBe(560);
    expect(r.rows[0].q).toBe(2250);
    expect(r.quality.intervalMin).toBeCloseTo(1, 5);
    expect(r.quality.missing).toEqual([]);
  });

  it("acepta sinónimos en español y produce la misma estructura", () => {
    const csv = [
      "fecha;presion tubing;presion casing;presion linea;temperatura;caudal;apertura",
      `${at(0)};560;780;430;44;2250;54`,
      `${at(5)};556;778;429;44;2230;54`,
    ].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.columns.vars.pt).toBe("presion tubing");
    expect(r.rows[0].pt).toBe(560);
    expect(r.quality.intervalMin).toBeCloseTo(5, 5);
  });

  it("soporta decimales con coma cuando el separador es punto y coma", () => {
    const csv = ["ts;q;temp", `${at(0)};2.250,5;44,25`, `${at(1)};2.100,0;44,10`].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.rows[0].q).toBeCloseTo(2250.5, 6);
    expect(r.rows[0].temp).toBeCloseTo(44.25, 6);
  });

  it("soporta TSV y fecha DD/MM/YYYY", () => {
    const csv = ["ts\tpt\tq", "01/02/2025 06:00\t560\t2250", "01/02/2025 06:10\t558\t2240"].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.rows[0].ts).toBe(Date.UTC(2025, 1, 1, 6, 0));
    expect(r.quality.intervalMin).toBeCloseTo(10, 5);
  });

  it("parsea la columna opcional event como etiqueta", () => {
    const csv = [
      "ts,pt,q,event",
      `${at(0)},560,2250,normal`,
      `${at(1)},540,2100,liquid_loading`,
    ].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.columns.label).toBe("event");
    expect(r.rows[0].label).toBe("normal");
    expect(r.rows[1].label).toBe("liquid_loading");
  });

  it("reporta columnas ausentes sin romper (las mantiene como null)", () => {
    const csv = ["ts,pt,q", `${at(0)},560,2250`, `${at(1)},558,2240`].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.quality.missing).toContain("pc");
    expect(r.quality.missing).toContain("pl");
    expect(r.rows[0].pc).toBeNull();
    expect(r.warnings.some((w) => w.includes("sin fuente"))).toBe(true);
  });
});

describe("csvParser — calidad y robustez", () => {
  it("ordena filas desordenadas y elimina duplicados (conserva el último)", () => {
    const csv = [
      "ts,pt,q",
      `${at(2)},550,2200`,
      `${at(0)},560,2250`,
      `${at(1)},558,2240`,
      `${at(1)},557,2235`, // duplicado: gana
    ].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.rows).toHaveLength(3);
    expect(r.rows).toEqual([...r.rows].sort((a, b) => a.ts - b.ts));
    expect(r.quality.nDupes).toBe(1);
    expect(r.rows[1].pt).toBe(557); // el último del duplicado
  });

  it("descarta filas con tiempo inválido y las cuenta", () => {
    const csv = [
      "ts,pt,q",
      "fecha-rara,560,2250",
      `${at(0)},560,2250`,
      ",558,2240",
    ].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.quality.nDropped).toBe(2);
  });

  it("detecta huecos > 3× el intervalo mediano", () => {
    const rows = ["ts,pt,q", `${at(0)},560,2250`];
    for (const m of [1, 2, 3, 4, 5, 40, 41, 42]) rows.push(`${at(m)},558,2240`);
    const r = parseTelemetryCsv(rows.join("\n"));
    expect(r.quality.nGaps).toBe(1);
  });

  it("clampea valores fuera de rango físico y lo reporta", () => {
    const csv = ["ts,pt,choke", `${at(0)},99999,150`, `${at(1)},560,54`].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.rows[0].pt).toBe(15000);
    expect(r.rows[0].choke).toBe(100);
    expect(r.quality.outOfRange.pt).toBe(1);
    expect(r.quality.outOfRange.choke).toBe(1);
  });

  it("rechaza archivos vacíos o sin filas de datos", () => {
    expect(() => parseTelemetryCsv("")).toThrow();
    expect(() => parseTelemetryCsv("ts,pt,q\n")).toThrow();
    expect(() => parseTelemetryCsv("ts,pt,q\nmal,mal,mal")).toThrow();
  });

  it("acepta epoch en segundos y en milisegundos", () => {
    const s = Math.floor(T0 / 1000);
    const csv = ["ts,pt,q", `${s},560,2250`, `${s + 60},558,2240`].join("\n");
    const r = parseTelemetryCsv(csv);
    expect(r.rows[0].ts).toBe(T0);
    expect(r.quality.intervalMin).toBeCloseTo(1, 5);
    const msCsv = ["ts,pt,q", `${T0},560,2250`, `${T0 + 60000},558,2240`].join("\n");
    expect(parseTelemetryCsv(msCsv).rows[0].ts).toBe(T0);
  });
});

describe("csvParser — fmtTs", () => {
  it("formatea fecha y hora legible", () => {
    expect(fmtTs(T0)).toMatch(/2025-01-01 00:00/);
  });
});
