# Replay de histórico CSV · Guía de datos reales

> **v0.12 «Piloto con datos reales»** — reproduce cualquier histórico de pozo contra el pipeline completo de VIGÍA y, si tienes etiquetas de eventos, mide la detección que *habría ocurrido*: matriz de confusión, precisión/recuerdo/F1 y retardo por evento.

## Formato del CSV

Columnas (encabezados flexibles, ver sinónimos abajo):

| Columna | Significado | Unidades | ¿Requerida? |
|---|---|---|---|
| `ts` | marca de tiempo | ISO 8601, `DD/MM/YYYY [HH:mm]`, epoch s/ms | sí |
| `pt` | presión de tubing (cabezal) | psig | al menos una |
| `pc` | presión de casing (anular) | psig | — |
| `pl` | presión de línea (aguas abajo) | psig | — |
| `temp` | temperatura de cabezal | °C | — |
| `q` | caudal de gas | Mscf/d | — |
| `choke` | apertura del choke | % | — |
| `event` | etiqueta del régimen real | ver tabla de etiquetas | opcional |

- **Separadores**: coma `,`, punto y coma `;` o tabulación (autodetectado).
- **Decimales**: con punto por defecto; con separador `;` se aceptan comas decimales (`2.250,5`).
- **Columnas ausentes**: el reproductor mantiene el último valor conocido y lo reporta en el panel («SIN FUENTE: …»).
- **Valores fuera de rango físico** se clampean y se cuentan en el reporte de calidad.

### Sinónimos de encabezado reconocidos

- `ts`: `time`, `fecha`, `date`, `timestamp`, `DATEPRD`
- `pt`: `whp`, `pthp`, `presion tubing`, `avg whp p`
- `pc`: `annulus`, `casing`, `avg annulus press`
- `pl`: `linea`, `thdp`, `downstream`, `manifold`
- `temp`: `wht`, `temperatura`, `avg wht p`
- `q`: `caudal`, `rate`, `qgas`, `bore gas vol`, `mscf`
- `choke`: `apertura`, `choke size`, `avg choke size p`
- `event`: `evento`, `label`, `etiqueta`, `regimen`, `fault`

### Etiquetas de evento aceptadas

Se normalizan (mayúsculas, tildes, espacios/guiones) y se mapean a las clases del clasificador N3:

| Etiqueta en el CSV | Clase puntuada |
|---|---|
| `normal`, `ok`, `estable` | normal |
| `liquid_loading`, `carga de líquidos` | liquidLoading |
| `restriction`, `restriccion en linea` | restriction |
| `sensor_fault`, `falla de sensor` | sensorFault |
| `control_issue`, `problema de control` | controlIssue |
| `casing_leak`, `tubing_leak`, `hydrates`, `sanding`, … | otras (solo reglas) |

## Cómo se usa

1. En la consola, panel **«Replay de histórico CSV»** → `ELEGIR ARCHIVO…` o un demo incluido.
2. El panel muestra el reporte de calidad (filas, intervalo, huecos, duplicados, descartes).
3. `▶ REPRODUCIR` con la velocidad elegida (1×–900×). El simulador se pausa para el pozo reproducido y la **base operativa se re-deriva del propio histórico** (medianas de las primeras ~120 filas), de modo que KPIs, ML y física queden en la escala correcta.
4. Con etiquetas: la sección «DETECCIÓN VS. ETIQUETAS DE CAMPO» muestra la matriz de confusión en vivo, P/R/F1 por clase, el retardo de detección por evento y los eventos no detectados. `⏭ SIGUIENTE EVENTO` salta al próximo evento etiquetado.

> **Nota sobre el muestreo**: la puntuación se toma al ritmo del ciclo de consola (1,5 s). A velocidades altas (≥ 300×) cada tick muestrea un instante lejano del anterior — la matriz es un muestreo honesto, no una evaluación continua. Para evaluación densa, reproduce a ≤ 15×.

## Demos incluidos

| Archivo | Contenido | Etiquetas |
|---|---|---|
| `public/data/demo-etiquetado.csv` | 3.320 min (55 h) generados por el propio simulador con 5 regímenes | sí (`normal`, `liquid_loading`, `restriction`, `sensor_fault`, `control_issue`) |
| `public/data/volve-f12.csv` | **Datos reales** · pozo 15/9-F-12 H del campo Volve (Equinor), 3.056 días (2008–2016) | no |
| `public/data/volve-f11.csv` | **Datos reales** · pozo 15/9-F-11 H, 1.165 días (2013–2016) | no |

### Mapeo Volve → VIGÍA (documentado y honesto)

| VIGÍA | Volve (Daily Production Data) | Conversión |
|---|---|---|
| `ts` | `DATEPRD` | dato diario (Δ 1.440 min) |
| `pt` | `AVG_WHP_P` (bara) | × 14,5038 → psig |
| `pc` | `AVG_ANNULUS_PRESS` (bara) | × 14,5038 → psig |
| `temp` | `AVG_WHT_P` (°C) | directa |
| `q` | `BORE_GAS_VOL` (Sm³/d) | × 0,0353147 → Mscf/d |
| `choke` | `AVG_CHOKE_SIZE_P` (%) | directa |
| `pl` | — | **Volve no registra presión de línea**: la columna se omite y el reproductor mantiene el último valor |

Los ceros de `q`/`pt` en paradas son reales (`ON_STREAM_HRS = 0`).

**Fuente**: Equinor — Volve field production data (conjunto público), licencia **CC BY-NC-SA 4.0**. Uso aquí con fines de demostración educativa, con atribución. El script de conversión documentado está en el historial del proyecto; el ajuste de pozo se re-deriva automáticamente al cargar.

## Preparar tu propio CSV

1. Exporta del historiador/SCADA una serie por pozo (cualquier intervalo regular; 1 min, 1 h o 1 d).
2. Verifica unidades: **psig / °C / Mscf/d / %**. Si tu exportador usa bara o Sm³/d, convierte antes (o agrega sinónimos en `src/lib/replay/csvParser.ts`).
3. Opcional: agrega la columna `event` con las etiquetas de eventos documentados (workovers, cargas de líquidos confirmadas, paradas) — ahí está el valor: la consola se examina a sí misma contra tu realidad operativa.
4. Cárgala con `ELEGIR ARCHIVO…`. Nada sale de tu navegador: el parseo y toda la evaluación corren en local.
