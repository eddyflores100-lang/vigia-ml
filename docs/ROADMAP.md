# Roadmap de producto — VIGÍA ML

Historial de versiones y plan de la siguiente. Los títulos de cada versión tienen un hilo conductor: llevar la consola **de demo didáctica a herramienta de piloto con datos reales**, sin perder la promesa fundacional: todo el cómputo ocurre en el navegador y los datos nunca salen de él salvo que el operador lo autorice.

## Historial

| Versión | Tema | Qué aportó |
|---|---|---|
| v0.6.0 | Robustez | Suite Vitest, saneamiento de muestras, ErrorBoundary, PWA offline, export CSV/JSON |
| v0.7.0 | Rendimiento | Motor TF.js en **Web Worker**, comparativa de flota, reporte PDF, atajos |
| v0.8.0 | Datos reales (I) | Análisis de declinación **Arps (DCA)**, conector **OPC-UA** vía puente WebSocket |
| v0.9.0 | Soft-sensors | **Medición virtual** por choke (Bean + subcrítico), **RUL Weibull + AFT** |
| v0.10.0 | Interacción | **Copiloto** en lenguaje natural 100 % local, tarjeta **EXPLAIN** |
| v0.11.0 | Física operativa | **Asesor de setpoints** (Turner/API RP 14E), 4 regímenes nuevos, **gemelo digital** calibrado |
| v0.12.0 | Piloto con datos reales | **Sitio público con gate** (landing brief + app), **replay CSV + matriz de confusión**, **datos reales Volve**, **análisis nodal IPR/VLP**, **E2E Playwright** |

## v0.12.0 · «Piloto con datos reales» — ENTREGADO

Todo el alcance propuesto quedó incluido y verificado (173 tests unitarios + 11 E2E):

1. **Replay de histórico CSV** ✅ — parser flexible (separadores, fechas, sinónimos ES/EN), reproducción 1×–900×, base operativa re-derivada del histórico y matriz de confusión contra etiquetas con retardo por evento. Guía completa en `docs/REPLAY-CSV.md`.
2. **Datos reales Volve (Equinor)** ✅ — pozos F-12 H (2008–2016) y F-11 H incluidos con mapeo documentado y atribución CC BY-NC-SA 4.0.
3. **Persistencia opcional en Supabase** → se mantiene como candidata de v0.13 (fuera de alcance en v0.12; el replay cubre el caso «datos propios sin backend»).
4. **Sitio público + gate** ✅ (añadido durante el desarrollo) — landing tipo brief con formulario/clave de acceso y la consola en `app.html`.
5. **Puente OPC-UA validado de punta a punta** ✅ (endurecimiento posterior) — contra un servidor de simulación real (node-opcua): sesión perezosa + reconciliación de monitores desde el `subscribe` del cliente (bug de campo corregido: antes solo se monitoreaba el mapa del fichero), coalescencia de frames (500 ms), tolerancia a endpoints con hostname distinto (NAT/DNS), timeout de sesión acorde al intervalo y reconexión automática con supervivencia a caídas del SCADA. Herramientas incluidas: `bridge/sim-server.mjs` y `bridge/test-bridge.mjs` (smoke test de 3 comandos).

## v0.13 · propuesta

**Objetivo**: convertir el interés del gate en conversión medible y abrir ingesta en vivo sin backend propio.

### Alcance propuesto (4 características)

1. **Supabase opcional** — tabla `samples` con RLS, credenciales solo en `localStorage`, ingesta por Edge Function desde el puente OPC-UA y lectura REST con cursor. Modo privado por defecto verificable (0 requests sin credenciales).
2. **Alertas accionables** — motor sobre N4 (umbrales físicos), N2 (score sostenido) y N3 (cambio de diagnóstico dominante) con anti-rebote (hysteresis 15 min), Notification API opcional y bandeja con silencio por pozo/severidad.
3. **Vigilancia de drift (PSI)** — comparación continua de la distribución de las 20 features del clasificador contra validación; semáforo verde/ámbar/rojo en el panel del motor con recomendación de reentrenar.
4. **Export del modelo entrenado** — `LayersModel → IndexedDB + descarga` para reutilizar sin reentrenar, con sello de fecha/dataset.

### Candidatas sin compromiso

- Supabase Auth + multioperador (turnos, comentarios en eventos, auditoría).
- i18n EN/ES de toda la consola + copiloto bilingüe.
- Voz al copiloto (Web Speech API) para sala de control.
- Curvas de declinación por flota y EUR agregado del campo.
- Modo aula: dos regímenes superpuestos y por qué el clasificador pondera cada uno.
- Modbus TCP y MQTT Sparkplug B como fuentes de ingesta adicionales.

## Principios que gobiernan el roadmap

1. **Privacidad primero**: la red neuronal vive en el navegador del usuario; nada sale sin autorización explícita.
2. **Física antes que magia**: cada salida ML se fusiona con evidencia físicamente interpretable que un operador puede auditar.
3. **Honestidad ante todo**: telemetría sintética declarada, limitaciones documentadas, calibraciones que se rechazan solas sin datos suficientes.
4. **La consola nunca se congela**: cualquier cómputo pesado va a un Web Worker o cede el hilo; la degradación es elegante, nunca un bloqueo.
