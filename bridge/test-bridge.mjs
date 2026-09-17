#!/usr/bin/env node
// ---------------------------------------------------------------------------
// VIGÍA · Prueba de integración del puente OPC-UA (sim-server → bridge → WS)
// ---------------------------------------------------------------------------
// Valida de punta a punta: subscribe del cliente, hello del puente, frames
// de datos con NodeIds reales del servidor de simulación y cierre limpio.
// Uso: node test-bridge.mjs   (requiere sim-server.mjs y opcua-bridge.mjs)
// ---------------------------------------------------------------------------

import { WebSocket } from "ws";

const WS_PORT = Number(process.env.WS_PORT ?? 8082);
const url = `ws://localhost:${WS_PORT}`;

const TAGS = {
  pt: "ns=1;s=pt",
  pc: "ns=1;s=pc",
  pl: "ns=1;s=pl",
  temp: "ns=1;s=temp",
  q: "ns=1;s=q",
  choke: "ns=1;s=choke",
};

const log = (...a) => console.log("[test]", ...a);
let dataFrames = 0;
let valuesSeen = new Set();
let statusOk = false;

const ws = new WebSocket(url);
const timeout = setTimeout(() => {
  log(`FALLO: timeout — frames de datos recibidos: ${dataFrames}`);
  process.exit(1);
}, 30000);

ws.on("open", () => {
  log(`conectado a ${url}; enviando subscribe…`);
  ws.send(JSON.stringify({ op: "subscribe", tags: TAGS, intervalMs: 5000 }));
});

ws.on("message", (raw) => {
  const f = JSON.parse(raw.toString());
  if (f.op === "hello") log(`hello del puente: "${f.msg}"`);
  if (f.op === "status") {
    log(`status: ${f.state} — ${f.msg}`);
    if (f.state === "ok") statusOk = true;
  }
  if (f.op === "data") {
    dataFrames++;
    for (const k of Object.keys(f.values)) valuesSeen.add(k);
    if (dataFrames === 1) log(`primer frame (t=${new Date(f.ts).toISOString()}):`, f.values);
    if (dataFrames >= 3) {
      const esperados = Object.values(TAGS);
      const faltan = esperados.filter((t) => !valuesSeen.has(t));
      clearTimeout(timeout);
      log(`— resumen —`);
      log(`frames de datos: ${dataFrames}`);
      log(`NodeIds recibidos: ${valuesSeen.size}/6 ${faltan.length ? `(faltan: ${faltan.join(", ")})` : "✓"}`);
      log(`status ok del puente: ${statusOk ? "sí ✓" : "no ✗"}`);
      const pass = dataFrames >= 3 && faltan.length === 0 && statusOk;
      log(pass ? "RESULTADO: PASA ✓" : "RESULTADO: FALLA ✗");
      ws.close();
      process.exit(pass ? 0 : 1);
    }
  }
  if (f.op === "error") log(`error del puente: ${f.msg}`);
});

ws.on("error", (e) => {
  clearTimeout(timeout);
  log(`FALLO de conexión: ${e.message}`);
  process.exit(1);
});
