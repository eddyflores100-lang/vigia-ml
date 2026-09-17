import { useEffect, useRef, useState } from "react";
import { GateSection } from "./gate-section";
import { ACCESS_KEY } from "./gate";
import { WellSchematic, StripChart, RegMark } from "./figures";

// ---------------------------------------------------------------------------
// VIGÍA · landing público — v0.12.1 «Cuaderno de laboratorio»
// El brief se presenta como un informe técnico de ingeniería: papel
// milimetrado, secciones numeradas §01–§08, figuras (FIG.) y registros (REG.)
// numerados, tablas regladas y sellos de tinta. Sin TensorFlow.js, sin
// lógica de consola: pura presentación.
// ---------------------------------------------------------------------------

const SPECS: Array<[string, string, string]> = [
  ["MODELOS DE APRENDIZAJE", "3", "LSTM · autoencoder · clasificador"],
  ["REGÍMENES DE FALLA", "9", "de carga de líquidos a hidratos"],
  ["PRUEBAS AUTOMÁTICAS", "184/184", "unitarios + E2E · APROBADO"],
  ["TELEMETRÍA ENVIADA A NUBE", "0 B", "verificable en la pestaña de red"],
  ["INTERVALO DE MUESTREO", "60 s", "PT · PC · PL · TT · FT · ZT"],
  ["EJECUCIÓN", "LOCAL", "navegador del operador · Web Worker"],
];

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // observa el propio elemento y TODOS los .reveal internos
    const targets: HTMLElement[] = root.classList.contains("reveal")
      ? [root, ...Array.from(root.querySelectorAll<HTMLElement>(".reveal"))]
      : Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (targets.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
  return ref;
}

function Section({
  id,
  num,
  name,
  sheet,
  title,
  children,
  className = "",
}: {
  id?: string;
  num: string;
  name: string;
  sheet: string;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id={id} ref={ref} className={`reveal relative mx-auto w-full max-w-6xl px-5 md:px-8 py-16 md:py-24 ${className}`}>
      <div className="h-[2px] bg-ink mb-4" />
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="font-mono text-[10.5px] md:text-[11.5px] tracking-[0.22em] text-red font-semibold">
          § {num} — {name}
        </p>
        <p className="font-mono text-[9px] tracking-[0.14em] text-ink3 hidden sm:block">VIG-012/26 · HOJA {sheet}</p>
      </div>
      <h2 className="font-display font-bold uppercase text-[27px] md:text-[38px] leading-[1.06] tracking-[0.01em] text-ink max-w-3xl">
        {title}
      </h2>
      <div className="mt-8 md:mt-11">{children}</div>
    </section>
  );
}

// --------------------------------- NAV --------------------------------------

function Crosshair({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="10" fill="none" stroke="#b23a26" strokeWidth="2.2" />
      <path d="M16 1v30M1 16h30" stroke="#1b1812" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="3.2" fill="#b23a26" />
    </svg>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links: Array<[string, string]> = [
    ["01 · Observación", "#problema"],
    ["02 · Instrumentos", "#capacidades"],
    ["03 · Procedimiento", "#pipeline"],
    ["04 · Validación", "#datos"],
    ["06 · Método", "#tecnologia"],
    ["07 · Bitácora", "#roadmap"],
  ];
  return (
    <header className={`sticky top-0 z-50 border-b transition-colors duration-200 ${scrolled ? "bg-paper/95 backdrop-blur-sm border-line2" : "bg-paper border-transparent"}`}>
      <div className="mx-auto max-w-6xl px-5 md:px-8 h-15 py-2.5 flex items-center gap-7">
        <a href="#top" className="flex items-center gap-2.5 shrink-0" aria-label="VIGÍA — inicio">
          <Crosshair />
          <span className="font-display font-bold tracking-[0.14em] text-[19px] leading-none">VIGÍA</span>
          <span className="font-mono text-[8.5px] tracking-[0.18em] text-paper bg-ink px-1.5 py-0.5 mt-0.5">LAB</span>
        </a>
        <nav className="hidden lg:flex items-center gap-5 ml-2" aria-label="Secciones del informe">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="font-mono text-[10.5px] tracking-[0.1em] text-ink2 hover:text-red transition-colors">
              {label.toUpperCase()}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://github.com/eddyflores100-lang/vigia-ml"
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex font-mono text-[10.5px] tracking-[0.12em] text-ink2 hover:text-red transition-colors"
          >
            GITHUB ↗
          </a>
          <a href="#acceso" className="btn-primary !py-2 !px-3.5 !text-[10.5px]">
            ACCESO
          </a>
          <button
            className="lg:hidden font-mono text-[10px] tracking-[0.12em] text-ink2 border border-line2 px-2.5 py-1.5"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Abrir menú"
          >
            ÍNDICE
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden bg-plate/95 border-b border-line2 px-5 py-4 flex flex-col gap-3" aria-label="Menú móvil">
          {links.map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)} className="font-mono text-[11px] tracking-[0.12em] text-ink2 hover:text-red">
              {label.toUpperCase()}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

// --------------------------------- PORTADA ----------------------------------

function Hero() {
  return (
    <section id="top" className="relative pt-8 md:pt-12 pb-14 md:pb-20">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        {/* lámina: marco de plano con marcas de registro */}
        <div className="relative border border-ink bg-plate/70" style={{ boxShadow: "5px 5px 0 0 rgba(27,24,18,0.12)" }}>
          <RegMark className="-top-[9px] -left-[7px]" />
          <RegMark className="-top-[9px] -right-[7px]" />
          <RegMark className="-bottom-[9px] -left-[7px]" />
          <RegMark className="-bottom-[9px] -right-[7px]" />

          {/* encabezado documental */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 items-center justify-between border-b border-ink px-4 md:px-6 py-2.5 font-mono text-[9px] md:text-[10px] tracking-[0.14em] text-ink2">
            <span className="font-semibold text-ink">INFORME TÉCNICO Nº VIG-012/26</span>
            <span className="hidden sm:inline">CONSOLA PREDICTIVA · POZOS DE GAS</span>
            <span>REV. C · 2026-09</span>
          </div>

          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-8 md:gap-10 px-4 md:px-6 pt-9 md:pt-12 pb-8 md:pb-10">
            <div className="flex flex-col justify-center">
              <p className="font-mono text-[10px] md:text-[11px] tracking-[0.26em] text-red font-semibold">
                CÓMPUTO 100 % LOCAL · NAVEGADOR DEL OPERADOR
              </p>
              <h1 className="mt-4 font-display font-bold uppercase leading-[0.94] tracking-[0.015em] text-[clamp(3.4rem,9vw,6.4rem)] text-ink">
                VIGÍA
              </h1>
              <p className="mt-3 font-display font-semibold uppercase text-[19px] md:text-[24px] leading-tight text-ink2">
                El pozo, bajo <span className="mark-red">observación</span> continua.
              </p>
              <p className="mt-5 max-w-xl text-ink2 text-[14.5px] md:text-[15.5px] leading-relaxed">
                Tres modelos de aprendizaje entrenan y operan dentro de tu navegador: pronóstico a 24 h, detección de
                anomalías y diagnóstico de 9 regímenes de falla — con la física del pozo como evidencia auditable y{" "}
                <strong className="text-ink">sin que un solo dato salga de tu equipo</strong>.
              </p>
              <div className="mt-8 flex flex-wrap gap-3.5">
                <a href="#acceso" className="btn-primary">
                  SOLICITAR ACCESO
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <a href="#problema" className="btn-ghost">
                  LEER EL INFORME ↓
                </a>
              </div>
              <div className="mt-9">
                <span className="stamp">APROBADO · 184/184 PRUEBAS</span>
              </div>
            </div>

            <figure className="fig-frame !p-3 md:!p-4 self-center reveal is-visible">
              <span className="fig-tag">FIG. 01</span>
              <WellSchematic />
              <figcaption className="fig-caption">
                ESQUEMA DEL POZO VIGILADO. EN ROJO, LOS SEIS TRANSMISORES QUE LEE LA CONSOLA CADA 60 s: PT (TUBERÍA), PC
                (ANULAR), PL (LÍNEA), TT (TEMPERATURA), FT (CAUDAL) Y ZT (CHOKE).
              </figcaption>
            </figure>
          </div>

          {/* especificaciones: tabla reglada tipo bloque de título */}
          <div className="border-t border-ink">
            <div className="px-4 md:px-6 py-2 font-mono text-[9.5px] tracking-[0.2em] text-ink font-semibold border-b border-line">
              ESPECIFICACIONES DEL INSTRUMENTO
            </div>
            <dl className="spec-grid grid grid-cols-2 md:grid-cols-3 gap-px border-0 border-t-0">
              {SPECS.map(([label, value, note]) => (
                <div key={label} className="spec-cell">
                  <dt className="font-mono text-[8.5px] md:text-[9px] tracking-[0.16em] text-ink3">{label}</dt>
                  <dd className="mt-1.5 font-display font-bold text-[21px] md:text-[23px] leading-none text-ink">{value}</dd>
                  <dd className="mt-1 font-mono text-[9px] tracking-[0.04em] text-ink2">{note}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/** REG. 01 — banda de registro continuo entre la portada y la §1. */
function Registro() {
  return (
    <div className="mx-auto max-w-6xl px-5 md:px-8 py-6">
      <div className="chart-paper px-3 md:px-5 pt-3 pb-2 reveal">
        <div className="flex flex-wrap gap-x-6 gap-y-1 items-baseline justify-between mb-1.5 font-mono text-[9px] md:text-[9.5px] tracking-[0.14em]">
          <span className="font-semibold text-ink">REG. Nº 01 — TENDENCIAS CONTINUAS</span>
          <span className="text-ink3">Δt = 60 s · HISTORIA SÓLIDA · PRONÓSTICO PUNTEADO · BANDA N1</span>
        </div>
        <StripChart />
      </div>
    </div>
  );
}

// ------------------------------ §1 · OBSERVACIÓN -----------------------------

const OBS: Array<[string, string, string]> = [
  [
    "OBS. 01",
    "La carga de líquidos avanza en silencio",
    "Cuando el caudal ya cayó, llevas días produciendo por debajo del potencial. El pozo no lanza una alarma: se apaga despacio, slug a slug, y el informe mensual llega tarde.",
  ],
  [
    "OBS. 02",
    "El histórico duerme en el SCADA",
    "Años de telemetría minuto a minuto archivados sin retroalimentar la operación. El dato que habría anticipado la falla existía — solo que nadie lo estaba mirando con modelos.",
  ],
  [
    "OBS. 03",
    "Lo predictivo exige subir tus datos",
    "Las plataformas de ML industrial piden vaciar tu telemetría en su nube: compliance, contratos y fricción. VIGÍA invierte el modelo — el modelo viaja al dato, no al revés.",
  ],
];

function Observacion() {
  return (
    <Section
      id="problema"
      num="01"
      name="OBSERVACIÓN"
      sheet="2/8"
      title={<>El pozo no avisa.<br />La pérdida llega antes que el informe.</>}
    >
      <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-9 items-start">
        <figure className="fig-frame reveal">
          <span className="fig-tag">FIG. 02</span>
          <img
            src="./img/valves.jpg"
            alt="Válvula de bola motorizada sobre ducto de gas"
            width={1400}
            height={1252}
            loading="lazy"
          />
          <figcaption className="fig-caption">
            ARCHIVO FOTOGRÁFICO Nº 12 — MANIFOLD DE PRODUCCIÓN. VÁLVULA MOTORIZADA DE BOLA, DN 150, ANSI 600.
          </figcaption>
        </figure>
        <ol className="divide-y divide-line border-y border-line">
          {OBS.map(([ref, title, body], i) => (
            <li key={ref} className="py-6 first:pt-2 last:pb-2 reveal" style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}>
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-red shrink-0">{ref}</span>
                <h3 className="font-display font-semibold uppercase text-[17px] md:text-[19px] tracking-[0.02em] text-ink leading-snug">{title}</h3>
              </div>
              <p className="mt-2.5 md:pl-[72px] text-ink2 text-[13.5px] leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

// ---------------------------- §2 · INSTRUMENTOS ------------------------------

const INSTRUMENTOS: Array<[string, string, string, string, string, boolean?]> = [
  ["N1", "PRONÓSTICO", "Pronóstico LSTM a 24 h", "Red recurrente entrenada en tu navegador proyecta presión y caudal con banda de incertidumbre calibrada y estimación de cruce de umbrales.", "SALIDA: pt·q @ t+24 h"],
  ["N2", "ANOMALÍA", "Detección de anomalías", "Autoencoder sobre 14 features físicas, fusionado con z-score multivariable. El índice 0–100 explica qué variable empuja el score.", "SALIDA: ÍNDICE 0–100"],
  ["N3", "DIAGNÓSTICO", "Diagnóstico de 9 regímenes", "Clasificador + reglas físicas: carga de líquidos, restricción, falla de sensor, actuador, fugas anular/tubing, hidratos y arena.", "SALIDA: HIPÓTESIS RANKEADAS"],
  ["RUL", "VIDA ÚTIL", "Vida útil restante", "Weibull con aceleración AFT por severidad: mediana p10–p90 de tiempo hasta la falla por régimen activo.", "SALIDA: p10–p90 POR RÉGIMEN"],
  ["TWN", "GEMELO", "Gemelo digital calibrado", "Respuesta k/a/b del pozo (caudal–choke, drawdown, casing) ajustada por mínimos cuadrados con calidad NRMSE y rechazo sin excitación.", "SALIDA: k·a·b + NRMSE"],
  ["OPS", "SETPOINTS", "Asesor de setpoints", "Apertura óptima de choke balanceando producción × supervivencia, con límites de Turner 1969 y erosión API RP 14E.", "SALIDA: CHOKE ÓPTIMO ±VENTANA"],
  ["NDL", "NODAL", "Análisis nodal IPR/VLP", "Punto de operación natural en el nodo de cabezal: IPR por regresión pt–q y VLP por inversa de Bean, con ventana operativa.", "SALIDA: PUNTO DE OPERACIÓN", true],
  ["RPL", "REPLAY", "Replay CSV + matriz de confusión", "Reproduce tu histórico a 1×–900× y puntúa la detección contra etiquetas reales: exactitud, F1 y retardo por evento.", "SALIDA: EXACTITUD · F1 · RETARDO", true],
  ["NL", "COPILOTO", "Copiloto del operador", "17 intenciones en lenguaje natural, 100 % determinista y offline: «¿cuál es el choke óptimo?», «¿cuándo se estima la falla?».", "SALIDA: RESPUESTA + CONTEXTO"],
];

function Instrumentos() {
  return (
    <Section
      id="capacidades"
      num="02"
      name="INSTRUMENTOS"
      sheet="3/8"
      title={<>Un banco de nueve instrumentos<br />sobre la misma señal.</>}
    >
      <div className="spec-grid grid sm:grid-cols-2 xl:grid-cols-3 gap-px">
        {INSTRUMENTOS.map(([ref, canal, title, body, salida, nuevo], i) => (
          <article key={ref + canal} className="spec-cell !p-0 reveal flex flex-col" style={{ "--reveal-delay": `${(i % 3) * 80}ms` } as React.CSSProperties}>
            <div className="spec-ref">
              <span className="text-ink2">REF. {ref}</span>
              <span>CANAL: {canal}</span>
            </div>
            <div className="px-1 pt-2.5 pb-3.5 flex flex-col flex-1">
              <h3 className="font-display font-semibold uppercase text-[15.5px] text-ink leading-snug pr-14">{title}</h3>
              {nuevo && (
                <span className="float-right -mt-6 font-mono text-[8px] font-semibold tracking-[0.12em] text-red border border-red px-1.5 py-0.5">
                  REV. 0.12
                </span>
              )}
              <p className="mt-2 text-ink2 text-[12.5px] leading-relaxed">{body}</p>
              <p className="mt-auto pt-2 font-mono text-[9px] tracking-[0.1em] text-ink3 border-t border-line">{salida}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------- §3 · PROCEDIMIENTO -----------------------------

const PASOS: Array<[string, string, string]> = [
  ["N1", "Pronóstico", "LSTM + Holt: proyección de pt/q/pl con banda de confianza."],
  ["N2", "Anomalía", "Autoencoder + z-score: índice 0–100 con contribuciones."],
  ["N3", "Diagnóstico", "Clasificador + reglas: hipótesis rankeadas con evidencia."],
  ["N4", "Umbrales físicos", "Turner, erosión y envolventes de operación del pozo."],
  ["N5", "Acciones", "Recomendaciones priorizadas y reporte operativo exportable."],
];

function Procedimiento() {
  return (
    <Section
      id="pipeline"
      num="03"
      name="PROCEDIMIENTO"
      sheet="4/8"
      title={<>Cada muestra pasa por cinco etapas<br />antes de llegar a tus manos.</>}
    >
      <ol className="grid md:grid-cols-5 gap-px bg-line2 border border-ink">
        {PASOS.map(([n, t, d], i) => (
          <li key={n} className="spec-cell !p-4 reveal" style={{ "--reveal-delay": `${i * 100}ms` } as React.CSSProperties}>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[9px] tracking-[0.16em] text-ink3">ETAPA {i + 1}/5</span>
              <span className="font-display font-bold text-[19px] text-red leading-none">{n}</span>
            </div>
            <h3 className="mt-2.5 font-display font-semibold uppercase text-[14px] text-ink">{t}</h3>
            <p className="mt-1.5 text-ink2 text-[11.5px] leading-relaxed">{d}</p>
          </li>
        ))}
      </ol>
      <p className="mt-6 font-mono text-[10px] tracking-[0.08em] text-ink3 leading-relaxed max-w-3xl">
        NOTA DE PROCEDIMIENTO: FUSIÓN ML + REGLAS EN CADA ETAPA · FALLBACK ESTADÍSTICO PERMANENTE · ENTRENAMIENTO POR
        LOTES EN WEB WORKER — LA CONSOLA NUNCA SE CONGELA.
      </p>
    </Section>
  );
}

// ----------------------------- §4 · VALIDACIÓN -------------------------------

const VALIDACION: Array<[string, string, string]> = [
  ["PRUEBAS UNITARIAS (VITEST)", "173/173", "APROBADO"],
  ["E2E DE CONSOLA (PLAYWRIGHT)", "11/11", "APROBADO"],
  ["MUESTRA VOLVE F-12 H · 2008–2016", "3.056 DÍAS", "INCLUIDA"],
  ["MUESTRA VOLVE F-11 H", "1.165 DÍAS", "INCLUIDA"],
  ["MATRIZ DE CONFUSIÓN 6×6 EN VIVO", "DEMO 55 H", "DISPONIBLE"],
];

function Validacion() {
  return (
    <Section
      id="datos"
      num="04"
      name="VALIDACIÓN"
      sheet="5/8"
      title={<>Tu histórico. Tu modelo.<br />Esta habría sido la detección.</>}
    >
      <div className="grid lg:grid-cols-2 gap-9 items-start">
        <div>
          <p className="text-ink2 text-[14.5px] leading-relaxed">
            Carga el CSV de cualquier pozo y reprodúcelo a velocidad ajustable contra el pipeline completo. Si el
            histórico trae etiquetas de eventos reales, la consola se examina a sí misma:{" "}
            <strong className="text-ink">matriz de confusión, precisión, recall, F1 y retardo de detección</strong> por
            evento — el argumento definitivo ante el escéptico.
          </p>
          <ul className="mt-6 space-y-3.5">
            {[
              ["Volve · Equinor", "Dos pozos reales del campo Volve (2008–2016) incluidos: F-12 H con 8,5 años de historia diaria y F-11 H."],
              ["CSV flexible", "Separadores , ; tab · fechas ISO/epoch · sinónimos de columnas en ES/EN · reporte de calidad con huecos y duplicados."],
              ["Base auto-derivada", "La base operativa del pozo se recalcula del propio histórico: sin configuración manual."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="font-mono text-red text-[13px] leading-6 shrink-0">▣</span>
                <div>
                  <span className="font-display font-semibold text-ink text-[14.5px] uppercase tracking-[0.02em]">{t}</span>
                  <span className="text-ink2 text-[13px] leading-relaxed"> — {d}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-7">
            <span className="stamp stamp-blue">MUESTRA DE REFERENCIA INCLUIDA</span>
          </div>
          <p className="mt-6 font-mono text-[9.5px] text-ink3 leading-relaxed">
            DATOS VOLVE: EQUINOR — CONJUNTO PÚBLICO DEL CAMPO VOLVE, LICENCIA CC BY-NC-SA 4.0. CON FINES DE
            DEMOSTRACIÓN.
          </p>
        </div>
        <div className="grid gap-7">
          <div className="spec-grid grid gap-px">
            {VALIDACION.map(([ensayo, resultado, estado]) => (
              <div key={ensayo} className="spec-cell !py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink">{ensayo}</span>
                <span className="font-mono text-[10.5px] tracking-[0.06em] text-ink2">{resultado}</span>
                <span className={`font-mono text-[9px] font-semibold tracking-[0.14em] ${estado === "APROBADO" ? "text-ok" : "text-blue"}`}>
                  ● {estado}
                </span>
              </div>
            ))}
          </div>
          <figure className="fig-frame reveal">
            <span className="fig-tag">FIG. 03</span>
            <img
              src="./img/shot-diagnostico.jpg"
              alt="Consola VIGÍA mostrando diagnóstico de carga de líquidos con evidencia física"
              width={1400}
              height={1499}
              loading="lazy"
            />
            <figcaption className="fig-caption">
              SALIDA N3 EN EL ENSAYO ETIQUETADO — DIAGNÓSTICO: CARGA DE LÍQUIDOS · CONF. 97 % · EVIDENCIA FÍSICA AUDITABLE.
            </figcaption>
          </figure>
        </div>
      </div>
    </Section>
  );
}

// --------------------------- §5 · REGISTRO GRÁFICO ---------------------------

function RegistroGrafico() {
  const figs: Array<[string, string, string, string]> = [
    ["FIG. 04", "./img/shot-consola.jpg", "CONSOLA OPERATIVA", "Flota, KPIs, pronóstico y copiloto en una pantalla."],
    ["FIG. 05", "./img/shot-flota.jpg", "COMPARATIVA DE FLOTA", "Estado, tendencia y score por pozo del campo."],
    ["FIG. 06", "./img/wide-strip.jpg", "VISTA GENERAL · PLATAFORMA", "El activo bajo vigilancia: silueta de plataforma de gas."],
  ];
  return (
    <Section num="05" name="REGISTRO GRÁFICO" sheet="6/8" title={<>La consola, en tres placas.</>}>
      <div className="grid md:grid-cols-3 gap-7 items-start">
        {figs.map(([tag, src, title, sub], i) => (
          <figure key={tag} className="fig-frame reveal" style={{ "--reveal-delay": `${i * 110}ms` } as React.CSSProperties}>
            <span className="fig-tag">{tag}</span>
            <img src={src} alt={`${title} — ${sub}`} width={1400} height={1000} loading="lazy" />
            <figcaption className="fig-caption">
              <span className="font-semibold text-ink">{title}.</span> {sub.toUpperCase()}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------- §6 · MÉTODO ---------------------------------

const METODO: Array<[string, string, string]> = [
  [
    "M-1",
    "100 % navegador, verificable",
    "Los tres modelos entrenan e infieren en un Web Worker con TensorFlow.js. Sin credenciales configuradas, la consola no hace ni una llamada externa — compruébalo en la pestaña de red.",
  ],
  [
    "M-2",
    "Ingesta estándar",
    "Puente OPC-UA vía WebSocket para SCADA en vivo, o replay CSV para históricos. Las muestras entran saneadas con guardas de rango físico.",
  ],
  [
    "M-3",
    "Calidad de producción",
    "173 tests unitarios, E2E con Playwright en CI, PWA instalable offline, typecheck estricto y build reproducible en cada push.",
  ],
  [
    "M-4",
    "Honestidad ante todo",
    "Telemetría sintética declarada, datos Volve atribuidos, calibraciones que se rechazan solas sin excitación suficiente.",
  ],
];

function Metodo() {
  return (
    <Section
      id="tecnologia"
      num="06"
      name="MÉTODO"
      sheet="7/8"
      title={<>El modelo viaja al dato.<br />Nunca al revés.</>}
    >
      <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-9 items-start">
        <figure className="fig-frame reveal">
          <span className="fig-tag">FIG. 07</span>
          <img
            src="./img/control-room.jpg"
            alt="Ingenieras supervisando pantallas en sala de control"
            width={1600}
            height={1067}
            loading="lazy"
          />
          <figcaption className="fig-caption">
            ARCHIVO FOTOGRÁFICO Nº 31 — SALA DE CONTROL, TURNO NOCTURNO. LA CONSOLA FUNCIONA OFFLINE (PWA) TRAS LA
            PRIMERA VISITA.
          </figcaption>
        </figure>
        <div>
          <ol className="divide-y divide-line border-y border-line">
            {METODO.map(([ref, t, d], i) => (
              <li key={ref} className="relative py-5 first:pt-2 reveal" style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-red shrink-0">{ref}</span>
                  <h3 className="font-display font-semibold uppercase text-[16px] text-ink">{t}</h3>
                </div>
                <p className="mt-2 md:pl-[72px] text-ink2 text-[13px] leading-relaxed">{d}</p>
              </li>
            ))}
          </ol>
          <p className="margin-note mt-5 max-w-md lg:ml-[72px]">
            ← VERIFICABLE EN 30 s: ABRIR DEVTOOLS → RED. SIN CUENTAS CONFIGURADAS, LA CONSOLA EMITE 0 REQUESTS
            EXTERNOS.
          </p>
        </div>
      </div>
    </Section>
  );
}

// ------------------------------ §7 · BITÁCORA --------------------------------

const BITACORA: Array<[string, string, string]> = [
  ["v0.6", "Robustez", "Suite Vitest · saneamiento · PWA offline · export CSV/JSON"],
  ["v0.7", "Rendimiento", "Motor TF.js en Web Worker · comparativa de flota · reporte PDF"],
  ["v0.8", "Datos reales I", "DCA Arps (EUR) · conector OPC-UA vía puente WebSocket"],
  ["v0.9", "Soft-sensors", "Medición virtual por choke (Bean) · RUL Weibull + AFT"],
  ["v0.10", "Interacción", "Copiloto NL 100 % local · tarjeta EXPLAIN"],
  ["v0.11", "Física operativa", "Asesor de setpoints · 4 regímenes nuevos · gemelo digital"],
  ["v0.12", "Piloto con datos reales", "Replay CSV · Volve real · análisis nodal · E2E · este informe"],
];

function Bitacora() {
  return (
    <Section id="roadmap" num="07" name="BITÁCORA" sheet="8/8" title={<>De demo didáctica<br />a herramienta de piloto.</>}>
      <ol className="border border-ink divide-y divide-line">
        {BITACORA.map(([v, t, d], i) => (
          <li
            key={v}
            className={`grid grid-cols-[64px_1fr] md:grid-cols-[80px_220px_1fr] gap-x-4 gap-y-1 px-4 py-4 items-baseline reveal ${v === "v0.12" ? "bg-paper2" : "bg-plate"}`}
            style={{ "--reveal-delay": `${i * 60}ms` } as React.CSSProperties}
          >
            <span className={`font-mono text-[11.5px] font-semibold tracking-[0.1em] ${v === "v0.12" ? "text-red" : "text-ink2"}`}>{v}</span>
            <span className="font-display font-semibold uppercase text-[14px] text-ink">
              {t}
              {v === "v0.12" && (
                <span className="ml-3 inline-block font-mono text-[8px] font-semibold tracking-[0.14em] text-red border border-red px-1.5 py-0.5 align-middle">
                  REV. ACTUAL
                </span>
              )}
            </span>
            <span className="col-span-2 md:col-span-1 text-ink2 text-[12.5px] leading-relaxed">{d}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 font-mono text-[10px] tracking-[0.08em] text-ink3 leading-relaxed max-w-3xl">
        SIGUIENTE REVISIÓN EN ESTUDIO (v0.13): SUPABASE OPCIONAL CON RLS · ALERTAS ACCIONABLES CON HISTÉRESIS ·
        VIGILANCIA DE DRIFT (PSI) · EXPORT DEL MODELO ENTRENADO.
      </p>
    </Section>
  );
}

// --------------------------------- COLOFÓN -----------------------------------

function Footer() {
  return (
    <footer className="border-t-2 border-ink mt-6">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-10 grid gap-9 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Crosshair size={20} />
            <span className="font-display font-bold tracking-[0.16em] text-[17px]">VIGÍA ML</span>
          </div>
          <p className="mt-3 text-ink2 text-[12.5px] leading-relaxed max-w-sm">
            Consola predictiva de pozos de gas con machine learning en el navegador. Proyecto de demostración
            educativa: no sustituye sistemas de control ni debe usarse para decisiones operativas críticas.
          </p>
        </div>
        <div>
          <div className="font-mono text-[9.5px] tracking-[0.2em] text-ink3 mb-3 border-b border-line pb-1.5">PROYECTO</div>
          <ul className="space-y-2 text-[13px]">
            <li><a className="text-ink2 hover:text-red transition-colors" href="https://github.com/eddyflores100-lang/vigia-ml" target="_blank" rel="noreferrer">Repositorio GitHub ↗</a></li>
            <li><a className="text-ink2 hover:text-red transition-colors" href="https://github.com/eddyflores100-lang/vigia-ml/releases" target="_blank" rel="noreferrer">Releases ↗</a></li>
            <li><a className="text-ink2 hover:text-red transition-colors" href="#roadmap">Bitácora</a></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-[9.5px] tracking-[0.2em] text-ink3 mb-3 border-b border-line pb-1.5">DATOS</div>
          <ul className="space-y-2 text-[13px] text-ink2">
            <li>Telemetría sintética declarada</li>
            <li>Volve © Equinor · CC BY-NC-SA 4.0</li>
            <li>Licencia del código: AL-1.0</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink">
        <div className="mx-auto max-w-6xl px-5 md:px-8 py-3.5 flex flex-wrap gap-x-6 gap-y-1.5 items-center font-mono text-[9px] tracking-[0.12em] text-ink3">
          <span>DOC. VIG-012/26 · REV. C · 2026</span>
          <span>VIGÍA ML v0.12.1</span>
          <span>TENSORFLOW.JS · REACT 18 · TYPESCRIPT</span>
          <span className="ml-auto">HECHO PARA INGENIEROS DE PRODUCCIÓN</span>
        </div>
      </div>
    </footer>
  );
}

// --------------------------------- PÁGINA ------------------------------------

export default function Landing() {
  return (
    <div className="relative">
      <div className="lab-ruler hidden lg:block" aria-hidden="true" />
      <div className="lg:pl-6">
        <Nav />
        <Hero />
        <Registro />
        <Observacion />
        <Instrumentos />
        <Procedimiento />
        <Validacion />
        <RegistroGrafico />
        <Metodo />
        <Bitacora />
        <GateSection />
        <Footer />
      </div>
    </div>
  );
}

/** Re-export para el entry: mantiene un único punto de lectura de la clave. */
export { ACCESS_KEY };
