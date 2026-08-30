// ---------------------------------------------------------------------------
// VIGÍA ML · pruebas del cliente del puente OPC-UA (ingest/opcuaBridge.ts)
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, afterEach } from "vitest";
import { OpcuaBridgeSource } from "../src/lib/ingest/opcuaBridge";
import type { WSLike, TagMap } from "../src/lib/ingest/opcuaBridge";

// --- WebSocket falso: registro de frames enviados + emisión manual ----------
function makeFakeWs() {
  const sent: string[] = [];
  const handlers: Record<string, ((ev: unknown) => void)[]> = {};
  const ws: WSLike = {
    readyState: 1,
    send: (d: string) => sent.push(d),
    close: () => {
      // un WebSocket real siempre dispara 'close' al cerrar (aquí, síncrono)
      emit("close");
    },
    addEventListener: (type, cb) => {
      (handlers[type] ??= []).push(cb);
    },
  };
  const emit = (type: "open" | "message" | "close" | "error", ev: unknown = {}) => {
    for (const cb of handlers[type] ?? []) cb(ev);
  };
  const message = (obj: unknown) => emit("message", { data: JSON.stringify(obj) });
  return { ws, emit, message, sent };
}

const TAGS: TagMap = {
  pt: "PT-101",
  pc: "PT-102",
  pl: "PT-108",
  temp: "TT-201",
  q: "FT-301",
  choke: "FV-401",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("OpcuaBridgeSource", () => {
  it("envía el mapa de tags en el subscribe al abrir el enlace", () => {
    const f = makeFakeWs();
    const src = new OpcuaBridgeSource({ makeWs: () => f.ws });
    const seen: string[] = [];
    src.onStatus((st) => seen.push(st));
    src.connect("ws://puente:8082", TAGS);
    expect(seen).toContain("connecting");
    f.emit("open");
    expect(f.sent).toHaveLength(1);
    const frame = JSON.parse(f.sent[0]);
    expect(frame.op).toBe("subscribe");
    expect(frame.tags.q).toBe("FT-301");
    src.disconnect();
  });

  it("mapea frames de datos a muestras y descarta valores no finitos", () => {
    const f = makeFakeWs();
    const src = new OpcuaBridgeSource({ makeWs: () => f.ws });
    const got: unknown[] = [];
    src.onData((s) => got.push(s));
    src.connect("ws://x", TAGS);
    f.emit("open");
    f.message({ op: "hello", msg: "puente demo" });
    expect(src.status).toBe("online");

    f.message({ op: "data", ts: 1700000000000, values: { "FT-301": 8210, "PT-101": 1245.5, "TT-201": "oops" } });
    expect(got).toHaveLength(1);
    const s = got[0] as { values: Record<string, number>; ts: number };
    expect(s.values.q).toBe(8210);
    expect(s.values.pt).toBe(1245.5);
    expect(s.values.temp).toBeUndefined();
    expect(src.stats.accepted).toBe(1);
    expect(src.stats.received).toBe(1);

    // frame sin variables válidas → rechazado, sin emitir
    f.message({ op: "data", ts: 1, values: { "ZZ-999": 5 } });
    f.message({ op: "data", ts: 2, values: { "FT-301": NaN } });
    expect(got).toHaveLength(1);
    expect(src.stats.rejected).toBe(2);

    // valores numéricos en texto se coaccionan
    f.message({ op: "data", ts: 3, values: { "PT-101": "1100.25" } });
    expect((got[1] as { values: Record<string, number> }).values.pt).toBeCloseTo(1100.25, 5);
    src.disconnect();
  });

  it("ignora frames malformados sin romper el enlace", () => {
    const f = makeFakeWs();
    const src = new OpcuaBridgeSource({ makeWs: () => f.ws });
    src.connect("ws://x", TAGS);
    f.emit("open");
    f.emit("message", { data: "no-es-json{" });
    f.emit("message", { data: 42 });
    f.message({ op: "op-desconocido" });
    expect(src.status).toBe("connecting"); // hello aún no llegó
    f.message({ op: "hello" });
    expect(src.status).toBe("online");
    src.disconnect();
  });

  it("reconecta con backoff exponencial si el socket cae", () => {
    vi.useFakeTimers();
    let created = 0;
    const sockets: ReturnType<typeof makeFakeWs>[] = [];
    const src = new OpcuaBridgeSource({
      makeWs: () => {
        const f = makeFakeWs();
        sockets.push(f);
        created++;
        return f.ws;
      },
      reconnectBaseMs: 1000,
      reconnectMaxMs: 15000,
    });
    src.connect("ws://x", TAGS);
    sockets[0].emit("open");
    sockets[0].message({ op: "hello" });
    expect(src.status).toBe("online");

    sockets[0].emit("close"); // caída remota
    expect(src.status).toBe("error");
    expect(src.stats.reconnects).toBe(1);

    vi.advanceTimersByTime(1000); // primer backoff 1 s
    expect(created).toBe(2);
    expect(src.status).toBe("connecting");

    sockets[1].emit("close"); // segunda caída → backoff 2 s
    vi.advanceTimersByTime(1500);
    expect(created).toBe(2); // aún no
    vi.advanceTimersByTime(500);
    expect(created).toBe(3);
    src.disconnect();
  });

  it("disconnect() corta de verdad: sin reconexiones posteriores", () => {
    vi.useFakeTimers();
    let created = 0;
    const sockets: ReturnType<typeof makeFakeWs>[] = [];
    const src = new OpcuaBridgeSource({
      makeWs: () => {
        const f = makeFakeWs();
        sockets.push(f);
        created++;
        return f.ws;
      },
    });
    src.connect("ws://x", TAGS);
    sockets[0].emit("open");
    src.disconnect();
    expect(src.status).toBe("idle");
    sockets[0].emit("close"); // cierre tardío tras desconexión manual
    vi.advanceTimersByTime(60000);
    expect(created).toBe(1);
    expect(src.stats.reconnects).toBe(0);
  });

  it("vigilancia de latidos: degrada sin datos y reconecta el enlace zombi", () => {
    vi.useFakeTimers();
    const sockets: ReturnType<typeof makeFakeWs>[] = [];
    const src = new OpcuaBridgeSource({
      makeWs: () => {
        const f = makeFakeWs();
        sockets.push(f);
        return f.ws;
      },
      heartbeatMs: 60000,
      heartbeatDeadMs: 120000,
    });
    src.connect("ws://x", TAGS);
    sockets[0].emit("open");
    sockets[0].message({ op: "hello" });

    vi.advanceTimersByTime(70000); // sin datos 70 s → degraded
    expect(src.status).toBe("degraded");

    sockets[0].message({ op: "data", ts: 1, values: { "FT-301": 100 } }); // vuelve el flujo
    expect(src.status).toBe("online");

    vi.advanceTimersByTime(130000); // enlace zombi → corte forzado
    expect(src.stats.reconnects).toBe(1);
    src.disconnect();
  });

  it("propaga estados del puente (degraded/error) por callback", () => {
    const f = makeFakeWs();
    const src = new OpcuaBridgeSource({ makeWs: () => f.ws });
    const seen: [string, string][] = [];
    src.onStatus((st, info) => seen.push([st, info]));
    src.connect("ws://x", TAGS);
    f.emit("open");
    f.message({ op: "hello" });
    f.message({ op: "status", state: "degraded", msg: "suscripción recreada" });
    f.message({ op: "error", msg: "nodo PT-101 BadCommFailure" });
    expect(seen.some(([st, i]) => st === "degraded" && i.includes("recreada"))).toBe(true);
    expect(seen.some(([st, i]) => st === "degraded" && i.includes("BadCommFailure"))).toBe(true);
    src.disconnect();
  });
});
