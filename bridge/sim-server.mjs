#!/usr/bin/env node
// ---------------------------------------------------------------------------
// VIGÍA · Servidor OPC-UA de simulación (para probar el puente sin SCADA)
// ---------------------------------------------------------------------------
// Levanta un servidor OPC-UA real (node-opcua) en opc.tcp://0.0.0.0:4840 con
// las 6 variables de un pozo de gas actualizándose cada 2 s con física
// sintética (tendencias + ruido). Sirve para validar el puente opcua-bridge
// de punta a punta sin acceso a un SCADA/DCS real.
//
// Uso:  node sim-server.mjs            (opc.tcp://localhost:4840)
//       PORT=53530 node sim-server.mjs
//
// NodeIds expuestos (ns=1;s=<nombre>):
//   pt (psig) · pc (psig) · pl (psig) · temp (°C) · q (Mscf/d) · choke (%)
// ---------------------------------------------------------------------------

import { OPCUAServer, Variant, DataType, StatusCodes } from "node-opcua";

const PORT = Number(process.env.PORT ?? 4840);

// ------------------------- estado del yacimiento ---------------------------
// Modelo sintético simple: deriva lenta + estacionalidad + ruido gaussiano
const t0 = Date.now();
const state = { pt: 1010, pc: 1290, pl: 645, temp: 43, q: 8350, choke: 67 };

const step = (k) => {
  const t = (Date.now() - t0) / 1000;
  const n = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2; // ~N(0,1)
  const drift = Math.sin(t / 2400) * 0.4 + Math.sin(t / 700) * 0.2;

  switch (k) {
    case "pt":   return state.pt   + drift * 30 + n() * 4;
    case "pc":   return state.pc   + drift * 20 + n() * 3;
    case "pl":   return state.pl   + drift * 8  + n() * 2;
    case "temp": return state.temp + drift * 1.2 + n() * 0.3;
    case "q":    return state.q    + drift * 260 + n() * 45;
    case "choke":return state.choke + n() * 0.4;
    default:     return 0;
  }
};

const VARS = [
  { id: "pt",    ns: "WHP.PT-101",  unit: "psig",  desc: "Presión de tubería (cabezal)" },
  { id: "pc",    ns: "WHP.PC-101",  unit: "psig",  desc: "Presión de carcasa (anular)" },
  { id: "pl",    ns: "SEP.PL-101",  unit: "psig",  desc: "Presión de línea (separador)" },
  { id: "temp",  ns: "WHT.TT-101",  unit: "degC",  desc: "Temperatura de cabezal" },
  { id: "q",     ns: "FLOW.FI-101", unit: "Mscf/d",desc: "Caudal de gas" },
  { id: "choke", ns: "CHOKE.ZT-101",unit: "%",     desc: "Apertura de choke (bean)" },
];

// ----------------------------- servidor OPC-UA -----------------------------
const server = new OPCUAServer({
  port: PORT,
  resourcePath: "/",
  buildInfo: {
    productName: "VIGIA-SimSCADA",
    buildNumber: "v0.12",
    buildDate: new Date(),
  },
  serverInfo: { applicationUri: "urn:vigia:simscada" },
});

await server.initialize();

const namespace = server.engine.addressSpace.getOwnNamespace();
const folder = namespace.addObject({ organizedBy: server.engine.addressSpace.rootFolder.objects, browseName: "PozoPN-041" });

const nodes = {};
for (const v of VARS) {
  nodes[v.id] = namespace.addVariable({
    componentOf: folder,
    browseName: v.ns,
    displayName: `${v.ns} [${v.unit}]`,
    description: v.desc,
    nodeId: `ns=1;s=${v.id}`,
    dataType: "Double",
    minimumSamplingInterval: 1000,
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: Number(step(v.id).toFixed(2)) }),
    },
  });
}

// actualiza el valor cacheado cada 2 s para que dispare notificaciones
setInterval(() => {
  for (const v of VARS) {
    nodes[v.id].setValueFromSource({
      statusCode: StatusCodes.Good,
      sourceTimestamp: new Date(),
      value: new Variant({ dataType: DataType.Double, value: Number(step(v.id).toFixed(2)) }),
    });
  }
}, 2000);

await server.start();
console.log(`[sim-scada] servidor OPC-UA listo en opc.tcp://localhost:${PORT}/`);
console.log("[sim-scada] variables (ns=1;s=<id>):");
for (const v of VARS) console.log(`  ns=1;s=${v.id.padEnd(6)} → ${v.desc} [${v.unit}]`);
console.log("[sim-scada] Ctrl+C para detener");

const shutdown = () => {
  console.log("\n[sim-scada] cierre ordenado");
  server.shutdown(1000, () => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
