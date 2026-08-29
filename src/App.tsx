import { useEffect, useMemo, useRef, useState } from "react";
import { SCENARIO_INFO, createFleet, fmtClock, mergeEvents } from "./lib/sim";
import type { Sample, Scenario, VarKey, WellEvent, WellSim } from "./lib/sim";
import { anomaly, anomalyLevel, dataQuality, diagnose, projections, recommend } from "./lib/models";
import type {
  AnomalyResult,
  DataQuality,
  Hypothesis,
  ProjRow,
  Recommendation,
} from "./lib/models";
import { VigiaEngine, mergeDiagnosis } from "./lib/ml/engine";
import type { ClassProb, MlAnomaly, MlForecast, TrainState } from "./lib/ml/engine";
import { buildWellReport, downloadWellCsv, downloadWellReportJson } from "./lib/export";
import { TopBar } from "./components/TopBar";
import { WellRail } from "./components/WellRail";
import type { WellSummary } from "./components/WellRail";
import { KpiGrid } from "./components/KpiGrid";
import { ForecastChart } from "./components/ForecastChart";
import { AnomalyPanel, DataQualityPanel, ScenarioControls } from "./components/InsightPanels";
import { DiagnosisPanel, EventLog, ProjectionPanel, RecommendationsPanel } from "./components/RightRail";
import { TrainingPanel } from "./components/TrainingPanel";
import { StatusChip } from "./components/bits";

interface View {
  summaries: WellSummary[];
  sel: WellSim;
  samples: Sample[];
  anom: AnomalyResult;
  anomMl: boolean;
  diag: Hypothesis[];
  diagMl: boolean;
  proj: ProjRow[];
  recs: Recommendation[];
  dq: DataQuality;
  events: WellEvent[];
  alarmCount: number;
  observing: number;
}

interface MlWellResult {
  anom: MlAnomaly;
  probs: ClassProb[];
}

function refreshLevels(wells: WellSim[], log: boolean) {
  for (const w of wells) {
    const a = anomaly(w.buf.slice(-240));
    const prev = w.level;
    w.score = a.score;
    w.level = a.level;
    if (log && prev !== a.level) {
      w.log(
        a.level === "ÓPTIMO" ? "ok" : a.level === "VIGILAR" ? "warn" : "alarm",
        `Índice de anomalía ${a.level === "ÓPTIMO" ? "bajó" : "subió"} a ${a.level} (${a.score})`
      );
    }
  }
}

function buildView(
  wells: WellSim[],
  selId: string,
  mlCache: Map<string, MlWellResult> | null,
  mlFc: MlForecast | null,
): View {
  const sel = wells.find((w) => w.id === selId) ?? wells[0];
  const summaries: WellSummary[] = wells.map((w) => ({
    id: w.id,
    name: w.name,
    field: w.field,
    status: w.level,
    score: w.score,
    qNow: w.last.q,
    spark: w.buf.slice(-48).map((s) => s.q),
  }));
  const samples = sel.buf.slice(-240);
  const mlSel = mlCache?.get(sel.id) ?? null;
  const anom: AnomalyResult = mlSel
    ? {
        score: mlSel.anom.score,
        level: mlSel.anom.level,
        contributions: mlSel.anom.contributions,
      }
    : anomaly(sel.buf.slice(-240));
  let diag = diagnose(sel.buf.slice(-160));
  let diagMl = false;
  if (mlSel && mlSel.probs.length > 0) {
    diag = mergeDiagnosis(diag, mlSel.probs, sel.buf.slice(-160));
    diagMl = true;
  }
  const proj = projections(samples, sel.base, mlFc);
  const recs = recommend(diag, proj, samples);
  const dq = dataQuality(sel.buf.slice(-260));
  const events = mergeEvents(wells, 42);
  const alarmCount = wells.filter((w) => w.level === "ALERTA" || w.level === "CRÍTICO").length;
  const observing = wells.filter((w) => w.level !== "ÓPTIMO").length;
  return {
    summaries,
    sel,
    samples,
    anom,
    anomMl: !!mlSel,
    diag,
    diagMl,
    proj,
    recs,
    dq,
    events,
    alarmCount,
    observing,
  };
}

export default function App() {
  const fleetRef = useRef<WellSim[] | null>(null);
  if (!fleetRef.current) {
    fleetRef.current = createFleet();
    refreshLevels(fleetRef.current, false);
  }

  const [selId, setSelId] = useState("PN-041");
  const [paused, setPaused] = useState(false);
  const [horizon, setHorizon] = useState(12);
  const [varKey, setVarKey] = useState<VarKey>("pt");
  const [doneRecs, setDoneRecs] = useState<Set<string>>(new Set());
  const [tickN, setTickN] = useState(0);

  // ------------------------- motor ML (TensorFlow.js) -----------------------
  const engineRef = useRef<VigiaEngine | null>(null);
  const mlCacheRef = useRef<Map<string, MlWellResult>>(new Map());
  const mlFcRef = useRef<MlForecast | null>(null);
  const [mlState, setMlState] = useState<TrainState>(VigiaEngine.initialState());
  const [mlReady, setMlReady] = useState(false);

  const startTraining = () => {
    engineRef.current?.abort(); // detiene el motor anterior si seguía entrenando
    const eng = new VigiaEngine();
    engineRef.current = eng;
    mlCacheRef.current = new Map();
    mlFcRef.current = null;
    setMlReady(false);
    setMlState(VigiaEngine.initialState());
    eng
      .trainAll((s) => {
        if (engineRef.current === eng) setMlState(s); // ignora motores obsoletos
      })
      .then((ok) => {
        if (engineRef.current === eng) setMlReady(ok);
      })
      .catch(() => {
        if (engineRef.current === eng) setMlReady(false);
      });
  };

  const cancelTraining = () => engineRef.current?.abort();

  useEffect(() => {
    startTraining();
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------ ciclo de 1.5 s ----------------------------
  useEffect(() => {
    let alive = true;
    let tickCount = 0;
    let busy = false; // guardia de reentrancia: si la inferencia tarda más de
    // un ciclo (p. ej. backend CPU), el próximo tick no la solapa
    const step = async () => {
      if (busy) return;
      busy = true;
      try {
        const wells = fleetRef.current!;
        if (!paused) wells.forEach((w) => w.tick());

        // niveles de flota: si hay caché ML se mantiene (evita parpadeo stats↔ML)
        const cache = mlCacheRef.current;
        for (const w of wells) {
          const r = cache.get(w.id);
          const a = r
            ? { score: r.anom.score, level: anomalyLevel(r.anom.score) }
            : anomaly(w.buf.slice(-240));
          const prev = w.level;
          w.score = a.score;
          w.level = a.level;
          if (prev !== a.level) {
            w.log(
              a.level === "ÓPTIMO" ? "ok" : a.level === "VIGILAR" ? "warn" : "alarm",
              `${r ? "[ML] " : ""}Índice de anomalía ${a.level === "ÓPTIMO" ? "bajó" : "subió"} a ${a.level} (${a.score})`
            );
          }
        }

        // inferencia ML cada 2 ciclos (3 s): suficiente y sin saturar la GPU
        const eng = engineRef.current;
        const infer = tickCount % 2 === 0;
        tickCount++;
        if (eng?.ready && infer) {
          try {
            const sel = wells.find((w) => w.id === selId) ?? wells[0];
            const [results, fc] = await Promise.all([
              Promise.all(
                wells.map(async (w) => ({ id: w.id, r: await eng.assess(w.buf, w.base) })),
              ),
              eng.forecastSeries(sel.buf, sel.base, 96),
            ]);
            if (!alive) return;
            const map = new Map<string, MlWellResult>();
            for (const { id, r } of results) if (r) map.set(id, r);
            mlCacheRef.current = map;
            mlFcRef.current = fc;
            // el score de flota pasa a medirse con el autoencoder
            for (const w of wells) {
              const r = map.get(w.id);
              if (!r) continue;
              const prev = w.level;
              w.score = r.anom.score;
              w.level = anomalyLevel(r.anom.score);
              if (prev !== w.level) {
                w.log(
                  w.level === "ÓPTIMO" ? "ok" : w.level === "VIGILAR" ? "warn" : "alarm",
                  `[ML] Índice de anomalía ${w.level === "ÓPTIMO" ? "bajó" : "subió"} a ${w.level} (${w.score}) · autoencoder`
                );
              }
            }
          } catch {
            /* inferencia fallida → se mantiene el pipeline estadístico */
          }
        }
        if (alive) setTickN((n) => n + 1);
      } finally {
        busy = false;
      }
    };
    const id = setInterval(() => void step(), 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [paused, mlReady, selId]);

  const view = useMemo(
    () => buildView(fleetRef.current!, selId, mlCacheRef.current, mlFcRef.current),
    [tickN, selId],
  );

  const topDiagId = view.diag[0]?.id ?? "";
  useEffect(() => {
    setDoneRecs(new Set());
  }, [selId, topDiagId]);

  const thrLow = useMemo(() => {
    const b = view.sel.base;
    if (varKey === "pt") return b.pt * 0.82;
    if (varKey === "q") return b.q * 0.78;
    if (varKey === "pl") return b.pl * 0.85;
    return undefined;
  }, [view.sel, varKey]);

  const inject = (s: Scenario) => {
    view.sel.setScenario(s);
    refreshLevels(fleetRef.current!, true);
    setTickN((n) => n + 1);
  };

  const exportCsv = () => {
    downloadWellCsv(view.sel.id, fleetRef.current!.find((w) => w.id === view.sel.id)?.buf ?? view.samples);
  };

  const exportReport = () => {
    const report = buildWellReport({
      well: { id: view.sel.id, name: view.sel.name, field: view.sel.field, depth: view.sel.depth },
      samples: view.samples,
      anom: view.anom,
      anomMl: view.anomMl,
      diag: view.diag,
      proj: view.proj,
      recs: view.recs,
      dq: view.dq,
      events: view.events,
    });
    downloadWellReportJson(report);
  };

  const toggleRec = (id: string) => {
    setDoneRecs((prev) => {
      const next = new Set(prev);
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="relative z-10 min-h-screen flex flex-col font-body">
      <TopBar
        simM={view.sel.last.m}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        alarmCount={view.alarmCount}
        latestEvent={view.events[0] ?? null}
        observing={view.observing}
        ml={{ phase: mlState.phase, progress: mlState.progress }}
      />

      <main className="flex-1 w-full max-w-[1600px] mx-auto px-3 md:px-4 py-3 grid grid-cols-12 gap-3 items-start">
        {/* flota */}
        <div className="col-span-12 md:col-span-4 xl:col-span-3 md:sticky md:top-3">
          <WellRail wells={view.summaries} selId={view.sel.id} onSelect={setSelId} />
        </div>

        {/* consola central */}
        <section className="col-span-12 md:col-span-8 xl:col-span-6 flex flex-col gap-3 min-w-0">
          {/* encabezado del pozo */}
          <div className="panel corners p-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 rise">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display font-bold text-[30px] md:text-[34px] tracking-[0.06em] leading-none text-fg">
                  {view.sel.id}
                </h1>
                <StatusChip status={view.sel.level} />
              </div>
              <p className="text-[11px] text-fg3 mt-1.5">
                {view.sel.name} · {view.sel.field} · TVD {view.sel.depth}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-4 font-mono text-[9.5px] tracking-[0.08em] text-fg3">
              <span>
                RÉGIMEN <span className="text-fg2">{SCENARIO_INFO[view.sel.scenario].label.toUpperCase()}</span>
              </span>
              <span>
                ÚLTIMA MUESTRA <span className="text-fg2">{fmtClock(view.sel.last.m)}</span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5 text-ok">
                <span className={`w-1.5 h-1.5 rounded-full ${paused ? "bg-watch" : "bg-ok live-dot"}`} />
                STREAM 1 MIN
              </span>
              <span className="flex items-center gap-1.5">
                <button
                  onClick={exportCsv}
                  title="Descargar telemetría completa del pozo en CSV"
                  className="px-2 py-1 rounded border border-line text-fg2 hover:border-ok/60 hover:text-ok transition-colors"
                >
                  CSV
                </button>
                <button
                  onClick={exportReport}
                  title="Descargar reporte operativo completo (JSON)"
                  className="px-2 py-1 rounded border border-line text-fg2 hover:border-ok/60 hover:text-ok transition-colors"
                >
                  JSON
                </button>
              </span>
            </div>
          </div>

          <KpiGrid samples={view.samples} />

          <ForecastChart
            samples={view.samples}
            varKey={varKey}
            onVarKey={setVarKey}
            horizon={horizon}
            onHorizon={setHorizon}
            thrLow={thrLow}
            base={view.sel.base}
            engine={engineRef.current}
            engineReady={mlReady}
          />

          <div className="flex flex-wrap gap-3">
            <AnomalyPanel result={view.anom} ml={view.anomMl} />
            <DataQualityPanel dq={view.dq} />
          </div>

          <ScenarioControls onInject={inject} active={view.sel.scenario} />

          <TrainingPanel state={mlState} onRetrain={startTraining} onCancel={cancelTraining} />
        </section>

        {/* inteligencia */}
        <aside className="col-span-12 xl:col-span-3 flex flex-col gap-3 min-w-0">
          <DiagnosisPanel diag={view.diag} ml={view.diagMl} />
          <ProjectionPanel proj={view.proj} />
          <RecommendationsPanel recs={view.recs} done={doneRecs} onToggle={toggleRec} />
          <EventLog events={view.events} />
        </aside>
      </main>

      <footer className="relative z-10 border-t border-line mt-1">
        <div className="max-w-[1600px] mx-auto px-3 md:px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[9px] tracking-[0.08em] text-fg3">
          <span>
            MODELOS EN NAVEGADOR · TENSORFLOW.JS · LSTM N1 + AUTOENCODER N2 + CLASIFICADOR N3 ·
            FALLBACK ESTADÍSTICO (HOLT / Z-SCORE / REGLAS v2.4)
          </span>
          <span className="hidden md:inline">PIPELINE N1→N5 COMPLETO</span>
          <span className="ml-auto">TELEMETRÍA SINTÉTICA CON FINES DE DEMOSTRACIÓN · VIGÍA ML v0.6 · 2026</span>
        </div>
      </footer>
    </div>
  );
}
