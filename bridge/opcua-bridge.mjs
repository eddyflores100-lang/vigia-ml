#!/usr/bin/env node
// ---------------------------------------------------------------------------
// VIGÍA ML · Puente OPC-UA → WebSocket (v0.12)
// El navegador no puede hablar el protocolo binario OPC-UA: este puente corre
// en un nodo de red con acceso al servidor de automatización (SCADA/RTU/PLC)
// y reenvía las lecturas a la consola por WebSocket en frames JSON.
//
// Uso:
//   node opcua-bridge.mjs --endpoint "opc.tcp://usuario:clave@10.0.0.5:4840" \
//        --map mapa.json --port 8082
//   VIGIA_DEMO=1 node opcua-bridge.mjs            # modo demo sin servidor real
//
//   # prueba de punta a punta sin SCADA (servidor de simulación incluido):
//   node sim-server.mjs &                          # opc.tcp://localhost:4840
//   node opcua-bridge.mjs --endpoint opc.tcp://localhost:4840
//   node test-bridge.mjs                           # cliente WS de validación
//
// Frames WebSocket (JSON una línea por mensaje):
//   puente→cliente: {"op":"hello","msg":"..."}
//                   {"op":"data","ts":169...,"values":{"ns=1;s=pt":123.4,...}}
//                   {"op":"status","state":"degraded","msg":"..."}
//                   {"op":"error","msg":"..."}
//   cliente→puente: {"op":"subscribe","tags":{"pt":"ns=2;s=Tag1",...},"intervalMs":15000}
//
// El mapa de nodos vincula cada variable de VIGÍA con su NodeId. Puede llegar
// por --map (fichero JSON), por el subscribe del cliente (lo habitual desde
// la consola) o ambos (el del cliente completa al del fichero).
//
// Sesión perezosa + reconciliación de monitores: la conexión OPC-UA se abre
// con el primer subscribe y applyMonitors() reconcilia los monitores activos
// con el mapa pedido (añade nuevos, retira los que sobran). Si la sesión
// cae, se reintenta conservando el último mapa.
// ---------------------------------------------------------------------------

import { WebSocketServer } from "ws";

// ----------------------------- configuración --------------------------------
const args = process.argv.slice(2);
const argOf = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const PORT = Number(argOf("--port", process.env.WS_PORT ?? 8082));
const ENDPOINT = argOf("--endpoint", process.env.OPC_ENDPOINT ?? null);
const DEMO = process.env.VIGIA_DEMO === "1" || !ENDPOINT;
const INTERVAL = Math.max(5000, Number(argOf("--interval", 15000)));

let fileMap = {};
const mapPath = argOf("--map", process.env.TAGMAP_FILE ?? null);
if (mapPath) {
  try {
    fileMap = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(mapPath, "utf8")));
  } catch (e) {
    console.error(`[bridge] no se pudo leer el mapa ${mapPath}: ${e.message}`);
    process.exit(1);
  }
}

// valores sintéticos del modo demo (rango físico de un pozo de gas)
const DEMO_VALUES = {
  pt: () => 980 + Math.sin(Date.now() / 60000) * 40 + Math.random() * 8,
  pc: () => 1250 + Math.sin(Date.now() / 90000) * 30 + Math.random() * 6,
  pl: () => 640 + Math.random() * 10,
  temp: () => 42 + Math.random() * 2.5,
  q: () => 8200 + Math.sin(Date.now() / 45000) * 350 + Math.random() * 60,
  choke: () => 68 + Math.random() * 2,
};

console.log(`[bridge] VIGÍA OPC-UA · modo ${DEMO ? "DEMO (VIGIA_DEMO=1)" : "OPC-UA real"}`);
if (!DEMO) console.log(`[bridge] endpoint: ${ENDPOINT.replace(/\/\/[^@]*@/, "//***@")}`);

// --------------------------- sesión OPC-UA ----------------------------------
// node-opcua se importa en diferido: en modo demo no hace falta instalarlo.
let opcua = null; // módulo cargado en diferido
let opcuaClient = null;
let session = null;
let subscription = null;
let connecting = null; // promesa de conexión en curso
let lastMap = {}; // último mapa aplicado (para reconectar)
const monitored = new Map(); // NodeId → ClientMonitoredItem

function Broadcast(fn) {
  for (const c of wss.clients) if (c.readyState === 1) fn(c);
}

// coalescencia: los 'changed' de la suscripción llegan uno por variable; se
// agrupan en un frame combinado por ventana de 500 ms (menos tráfico y frames
// iguales a los del modo demo, que la consola ya consume sin cambios)
let pending = {};
let flushTimer = null;
function pushValue(nodeId, value) {
  pending[nodeId] = value;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const values = pending;
    pending = {};
    if (Object.keys(values).length === 0) return;
    Broadcast((c) => c.send(JSON.stringify({ op: "data", ts: Date.now(), values })));
  }, 500);
}

async function ensureSession() {
  if (session) return session;
  if (!connecting) {
    connecting = (async () => {
      opcua ??= await import("node-opcua");
      // endpointMustExist=false: los SCADA reales suelen anunciar endpoints con
      // un hostname distinto del usado para alcanzarlos (NAT, alias DNS,
      // contenedores); sin esta tolerancia la conexión se rechaza aunque el
      // servidor sea alcanzable.
      // La vida de la suscripción (lifetimeCount × intervalo) debe quedar por
      // debajo del timeout de sesión: con intervalos de campo (15–60 s) el
      // timeout por defecto (60 s) es corto y el servidor la rechaza.
      const SESSION_TIMEOUT = Math.max(60_000, INTERVAL * 150);
      const client = opcua.OPCUAClient.create({
        applicationName: "vigia-ml-bridge",
        endpointMustExist: false,
        requestedSessionTimeout: SESSION_TIMEOUT,
      });
      client.on("connection_lost", onConnectionLost);
      try {
        await client.connect(ENDPOINT);
        console.log("[bridge] conectado al servidor OPC-UA");
        const s = await client.createSession({ type: opcua.UserTokenType.Anonymous });
        const sub = await s.createSubscription2({
          requestedPublishingInterval: INTERVAL,
          requestedLifetimeCount: 100,
          requestedMaxKeepAliveCount: 10,
          maxNotificationsPerPublish: 64,
          publishingEnabled: true,
          priority: 10,
        });
        opcuaClient = client;
        session = s;
        subscription = sub;
        return s;
      } catch (e) {
        // cliente a medio construir: desconectar para no fugar sockets
        try {
          await client.disconnect();
        } catch {
          /* ya muerto */
        }
        throw e;
      }
    })().catch((e) => {
      connecting = null;
      throw e;
    });
  }
  return connecting;
}

let cleaning = false; // serializa los ciclos de reconexión
function onConnectionLost() {
  if (cleaning) return;
  cleaning = true;
  Broadcast((c) => c.send(JSON.stringify({ op: "status", state: "degraded", msg: "sesión OPC-UA caída; reconectando" })));
  const oldClient = opcuaClient;
  session = null;
  subscription = null;
  opcuaClient = null;
  connecting = null;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pending = {};
  for (const mon of monitored.values()) {
    try {
      mon.terminate();
    } catch {
      /* ya muerto */
    }
  }
  monitored.clear();
  // desconectar el cliente caído y callar sus eventos: su reintento interno
  // de canal competiría con la nueva conexión y rompe el proceso
  if (oldClient) {
    oldClient.removeAllListeners();
    oldClient.on("error", () => {}); // EventEmitter sin listener 'error' lanza
    try {
      oldClient.disconnect().catch(() => {});
    } catch {
      /* throw síncrono de dispose con transacciones pendientes */
    }
  }
  const retry = () => {
    applyMonitors(lastMap)
      .then(() => {
        cleaning = false;
        console.log("[bridge] reconexión establecida");
      })
      .catch((e) => {
        console.error(`[bridge] reconexión falló: ${e.message}`);
        setTimeout(retry, 15000); // nuevo ciclo de reintento
      });
  };
  setTimeout(retry, 5000);
}

async function applyMonitorsInner(map) {
  lastMap = { ...map };
  await ensureSession();
  const wanted = new Set(Object.values(map));
  // retirar los monitores que ya no pide nadie
  for (const [nodeId, mon] of monitored) {
    if (!wanted.has(nodeId)) {
      try {
        await mon.terminate();
      } catch {
        /* ya muerto */
      }
      monitored.delete(nodeId);
      console.log(`[bridge] monitor retirado: ${nodeId}`);
    }
  }
  // añadir los nuevos (con valores por NodeId: dos variables que apunten al
  // mismo nodo comparten monitor y el diff no duplica)
  for (const [key, nodeId] of Object.entries(map)) {
    if (monitored.has(nodeId)) continue;
    const mon = await subscription.monitor(
      { nodeId, attributeId: opcua.AttributeIds.Value },
      { samplingInterval: INTERVAL, queueSize: 4 },
      opcua.TimestampsToReturn.Both,
    );
    mon.on("changed", (dv) => {
      const value = dv?.value?.value;
      // estricto como el cliente: solo números finitos; NaN/Infinity no viajan
      if (typeof value !== "number" || !Number.isFinite(value)) return;
      pushValue(nodeId, value);
    });
    monitored.set(nodeId, mon);
    console.log(`[bridge] monitor activo: ${key} → ${nodeId}`);
  }
}

// serializa las reconciliaciones (varios clientes pueden suscribirse a la vez)
let monitorsBusy = Promise.resolve();
function applyMonitors(map) {
  const run = monitorsBusy.then(() => applyMonitorsInner(map));
  monitorsBusy = run.catch(() => {});
  return run;
}

// --------------------------- servidor WebSocket -----------------------------
import { createServer } from "node:http";
const httpServer = createServer((_req, res) => {
  res.writeHead(426);
  res.end("VIGÍA OPC-UA bridge: use WebSocket\n");
});
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  console.log(`[bridge] cliente conectado (${wss.clients.size} activos)`);
  socket.send(JSON.stringify({ op: "hello", msg: DEMO ? "puente demo" : "puente OPC-UA" }));
  let timer = null;
  let clientMap = { ...fileMap };

  socket.on("message", (raw) => {
    let f;
    try {
      f = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (f.op === "subscribe" && f.tags && typeof f.tags === "object") {
      clientMap = { ...fileMap, ...f.tags };
      if (timer) clearInterval(timer);
      if (DEMO) {
        timer = setInterval(() => {
          try {
            // un frame combinado por ciclo, etiquetado con el NodeId que pidió el cliente
            const values = {};
            for (const [key, tag] of Object.entries(clientMap)) {
              if (typeof DEMO_VALUES[key] === "function") values[tag] = Number(DEMO_VALUES[key]().toFixed(2));
            }
            socket.send(JSON.stringify({ op: "data", ts: Date.now(), values }));
          } catch (e) {
            socket.send(JSON.stringify({ op: "error", msg: `lectura falló: ${e.message}` }));
          }
        }, INTERVAL);
        socket.send(
          JSON.stringify({
            op: "status",
            state: "ok",
            msg: `suscrito a ${Object.keys(clientMap).length} variables @ ${INTERVAL / 1000}s (demo)`,
          }),
        );
      } else {
        // modo real: reconcilia los monitores OPC-UA con el mapa pedido y
        // confirma cuando está en marcha (o reporta el fallo al cliente)
        applyMonitors(clientMap)
          .then(() => {
            socket.send(
              JSON.stringify({
                op: "status",
                state: "ok",
                msg: `suscrito a ${Object.keys(clientMap).length} variables @ ${INTERVAL / 1000}s`,
              }),
            );
          })
          .catch((e) => {
            console.error(`[bridge] suscripción falló: ${e.message}`);
            socket.send(JSON.stringify({ op: "error", msg: `suscripción falló: ${e.message}` }));
          });
      }
    }
  });

  socket.on("close", () => {
    if (timer) clearInterval(timer);
    console.log(`[bridge] cliente desconectado (${wss.clients.size} activos)`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[bridge] WebSocket en ws://0.0.0.0:${PORT} (intervalo ${INTERVAL / 1000}s)`);
  // con --map se conecta al arranque y falla rápido si el SCADA no responde;
  // sin mapa la conexión es perezosa: la abre el primer subscribe del cliente
  if (!DEMO && Object.keys(fileMap).length > 0) {
    applyMonitors(fileMap).catch((e) => {
      console.error(`[bridge] no se pudo conectar al servidor OPC-UA: ${e.message}`);
      process.exit(2);
    });
  }
});

const shutdown = () => {
  console.log("\n[bridge] cierre ordenado");
  for (const c of wss.clients) c.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// red de seguridad: al disponer una sesión con transacciones pendientes,
// node-opcua genera rechazos en promesas internas que no se pueden atrapar
// desde aquí. El ciclo de reconexión ya reconstruye sesión y monitores por
// su cuenta: en campo es preferible un puente vivo (y un log ruidoso) a un
// proceso caído que deja la consola sin datos.
process.on("unhandledRejection", (reason) => {
  console.error(`[bridge] rechazo sin manejar (ignorado): ${reason?.message ?? reason}`);
});
process.on("uncaughtException", (err) => {
  console.error(`[bridge] excepción sin capturar: ${err?.message ?? err}`);
  if (session || opcuaClient) onConnectionLost(); // fuerza reconstrucción limpia
});
