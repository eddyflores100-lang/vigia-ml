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

## v0.12.0 · «Piloto con datos reales» (propuesta)

**Objetivo**: que un ingeniero de producción cargue sus propias series (histórico o SCADA en vivo), las vigile con los modelos ya entrenados, y reciba alertas accionables — con los datos quedando en su navegador salvo persistencia explícita.

### Alcance propuesto (4 características)

1. **Replay de histórico CSV** — `#pilotaje`
   - Cargar un CSV de telemetría real por pozo (columnas: `ts, pt, pc, pl, temp, q, choke`), mapearlo a la misma estructura del buffer y **reproducirlo a velocidad ajustable** (1×–600×).
   - Durante el replay, el pipeline completo corre igual que en vivo: N1 pronostica, N2 puntúa anomalía, N3 diagnostica, RUL/setpoints responden.
   - Si el CSV trae una columna opcional de **evento etiquetado** (p. ej. `event=liquid_loading`), la consola muestra la **matriz de confusión del modelo contra la realidad** — la killer feature para convencer a un escéptico: «tu histórico, tu modelo, esta habría sido la detección».
   - Aceptación: CSV de 180 días × 5 pozos reproduce sin congelar la UI; métricas de detección contra etiquetas se calculan y muestran.

2. **Persistencia opcional en Supabase** — `#backend`
   - Nuevo origen en «Fuente de datos»: **SUPABASE** (URL + anon key, credenciales solo en `localStorage`, nunca en el repo).
   - Tabla `samples` con RLS; ingesta desde el puente OPC-UA por Edge Function; la consola lee por REST con paginación por cursor.
   - Modo **privado por defecto**: sin credenciales configuradas, la app no hace ninguna llamada de red (verificable en la pestaña de red).
   - Aceptación: dos navegadores ven el mismo stream en tiempo casi real; sin credenciales, cero requests externos.

3. **Alertas accionables** — `#operacion`
   - Motor de alertas sobre: cruce de umbral físico (N4), score de anomalía sostenido (N2) y cambio de diagnóstico dominante (N3), con anti-rebote (hysteresis 15 min).
   - Entrega: **notificaciones del navegador** (Notification API, con permiso opcional) + panel de **bandeja de alertas** con silenciar por pozo/severidad y export del registro.
   - Aceptación: inyección de régimen en el simulador dispara exactamente una alerta (no una ráfaga) y queda registrada con marca de tiempo.

4. **Vigilancia de drift del modelo** — `#ml-ops`
   - Comparación continua de la distribución de las 20 features del clasificador contra la del set de validación (**PSI** por feature y global).
   - Semáforo visible en el panel del motor: verde (< 0,15), ámbar (0,15–0,3), rojo (> 0,3 → «los datos que ves no se parecen a los que el modelo conoció; considera reentrenar»).
   - Aceptación: alimentar el pozo con base operativa fuera de rango enciende el ámbar/rojo; pozos normales se mantienen verdes.

### Fuera de alcance (explícito) para v0.12.0

- Entrenamiento federado o en servidor, login multiusuario (llega con Supabase Auth en v0.13), soporte móvil dedicado, i18n EN/ES de toda la UI (se evalúa tras el replay CSV), y más regímenes de falla (el catálogo de 9 se congela mientras no haya retroalimentación de campo).

### Criterios de éxito de la versión

- Un ingeniero sin ayuda puede: abrir la demo → cargar su CSV → ver la matriz de confusión contra sus eventos → decidir si el enfoque le sirve. Ese recorrido completo es el argumento de venta.
- Los 140 tests siguen en verde y se añaden ≥ 25 nuevos (replay/parser CSV, anti-rebote de alertas, PSI, privacidad por defecto).

## Candidatas para v0.13+ (sin compromiso)

- **Supabase Auth + multioperador** (turnos, comentarios en eventos, auditoría de quién vio qué).
- **i18n EN/ES** de toda la consola + copiloto bilingüe.
- **Voz al copiloto** (Web Speech API, offline en Chrome) para manos ocupadas en sala de control.
- **Curvas de declinación por flota** y EUR agregado del campo.
- **Export del modelo entrenado** (LayersModel → IndexedDB + descarga) para reutilizarlo sin reentrenar.
- **Modo aula**: inyectar dos regímenes superpuestos y explicar por qué el clasificador pondera cada uno.

## Principios que gobiernan el roadmap

1. **Privacidad primero**: la red neuronal vive en el navegador del usuario; nada sale sin autorización explícita.
2. **Física antes que magia**: cada salida ML se fusiona con evidencia físicamente interpretable que un operador puede auditar.
3. **Honestidad ante todo**: telemetría sintética declarada, limitaciones documentadas, calibraciones que se rechazan solas sin datos suficientes.
4. **La consola nunca se congela**: cualquier cómputo pesado va a un Web Worker o cede el hilo; la degradación es elegante, nunca un bloqueo.
