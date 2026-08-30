# Puente OPC-UA → WebSocket de VIGÍA ML

El navegador **no puede hablar el protocolo binario OPC-UA** (TCP 4840, codificación DER): ningún despliegue serio expone un SCADA directo al browser. La arquitectura de integración de VIGÍA ML es un **puente** de un solo sentido que corre en un equipo con acceso al servidor de automatización y reenvía las lecturas a la consola por WebSocket en frames JSON.

```
┌──────────┐  OPC-UA    ┌─────────────────┐  WebSocket  ┌────────────────────┐
│ SCADA /  │ ─────────▶ │ opcua-bridge.mjs│ ──────────▶ │ vigia-ml (browser) │
│ RTU/PLC  │  opc.tcp   │  (nodo de red)  │   :8082     │  PWA · offline     │
└──────────┘  :4840     └─────────────────┘             └────────────────────┘
```

## Protocolo (frames JSON, una línea por mensaje)

| Dirección | Frame | Significado |
|---|---|---|
| puente → consola | `{"op":"hello","msg":"..."}` | saludo tras conectar |
| puente → consola | `{"op":"data","ts":...,"values":{"PT-101":123.4}}` | lecturas etiquetadas por NodeId |
| puente → consola | `{"op":"status","state":"degraded","msg":"..."}` | fuente degradada |
| puente → consola | `{"op":"error","msg":"..."}` | error de lectura |
| consola → puente | `{"op":"subscribe","tags":{"pt":"PT-101",...},"intervalMs":15000}` | mapa de variables |

Valores `NaN`/no numéricos se descartan en el cliente (nunca se inventan ceros).

## Modo demo (sin ningún servidor OPC-UA)

```bash
cd bridge
npm install
npm run start:demo          # VIGIA_DEMO=1 · solo necesita `ws`
```

Con la consola abierta (`https://…/vigia-ml/`), en **Fuente de datos** elige
"Puente OPC-UA", introduce `ws://localhost:8082` y pulsa **Conectar**. Verás
las telemetrías sintéticas del puente alimentar el pozo seleccionado en tiempo
real. (Nota: desde la demo publicada en GitHub Pages el navegador bloquea
`ws://` inseguro en página `https://`; usa la consola servida por `npm run dev`
o un puente detrás de `wss://` — ver Seguridad.)

## Modo real (servidor OPC-UA)

```bash
cd bridge
npm install
node opcua-bridge.mjs \
  --endpoint "opc.tcp://usuario:clave@10.0.0.5:4840" \
  --map mapa.json \
  --port 8082 \
  --interval 15000
```

`mapa.json` vincula cada variable de VIGÍA con su NodeId en tu servidor:

```json
{
  "pt": "ns=2;s=Canal1.Dispositivo1.PT101",
  "pc": "ns=2;s=Canal1.Dispositivo1.PT102",
  "pl": "ns=2;s=Canal1.Dispositivo1.PT108",
  "temp": "ns=2;s=Canal1.Dispositivo1.TT201",
  "q": "ns=2;s=Canal1.Dispositivo1.FT301",
  "choke": "ns=2;s=Canal1.Dispositivo1.FV401"
}
```

Variables: `pt` presión de tubing · `pc` presión de casing · `pl` presión de
línea · `temp` temperatura de cabezal · `q` caudal de gas · `choke` apertura
de choke. El cliente descarta nodos fuera del mapa.

### Variables de entorno equivalentes

`OPC_ENDPOINT`, `TAGMAP_FILE`, `WS_PORT`, `VIGIA_DEMO=1`.

## Seguridad (léelo antes de producción)

- **Nunca** expongas el puente a Internet: red de operaciones o VLAN aparte.
- Sirve el WebSocket con `wss://` (TLS) detrás de un reverse proxy (nginx/
  Caddy) con autenticación; el endpoint OPC-UA con credenciales de solo
  lectura dedicadas para VIGÍA.
- El mapa de nodos define exactamente qué puede leer la consola: mínimo
  privilegio por diseño.
- Cada muestra pasa por `sanitizeSample()` en el navegador: valores fuera de
  rango físico se sustituyen antes de llegar a los modelos.

## Licencia

AL-1.0 (AliceLabs Source-Available) — mismo término que el proyecto principal;
ver `../LICENSE-AL-1.0`.
