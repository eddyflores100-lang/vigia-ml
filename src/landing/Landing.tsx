import { useEffect, useRef, useState } from "react";
import { GateSection } from "./gate-section";
import { ACCESS_KEY } from "./gate";

// ---------------------------------------------------------------------------
// VIGÍA · landing público (brief del producto) — v0.12
// Página de presentación con acceso restringido a la consola: el visitante
// lee el brief y solicita acceso (formulario) o introduce la clave de demo.
// Sin TensorFlow.js, sin lógica de consola: pura presentación.
// ---------------------------------------------------------------------------

const STATS: Array<[string, string, string]> = [
  ["03", "MODELOS ML", "LSTM · autoencoder · clasificador"],
  ["09", "REGÍMENES DE FALLA", "de carga de líquidos a hidratos"],
  ["173", "TESTS AUTOMÁTICOS", "unitarios + E2E Playwright"],
  ["0", "BYTES A LA NUBE", "tu información no sale del equipo"],
];

const MARQUEE = [
  "TensorFlow.js 4.22",
  "Web Worker",
  "React 18",
  "TypeScript",
  "OPC-UA · WebSocket",
  "Weibull + AFT",
  "Turner 1969",
  "API RP 14E",
  "Arps DCA",
  "Análisis nodal IPR/VLP",
  "PWA offline",
  "Vitest + Playwright",
  "Volve · Equinor",
  "100% estático",
];

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // observa el propio elemento y TODOS los .reveal internos: cada tarjeta,
    // figura o nodo del pipeline se revela al entrar en el viewport
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
  eyebrow,
  title,
  children,
  className = "",
}: {
  id?: string;
  eyebrow: string;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id={id} ref={ref} className={`reveal relative mx-auto w-full max-w-7xl px-5 md:px-8 py-20 md:py-28 ${className}`}>
      <div className="flex items-center gap-4 mb-3">
        <span className="font-mono text-[10px] md:text-[11px] tracking-[0.3em] text-copper">{eyebrow}</span>
        <span className="rule flex-1 max-w-[220px]" />
      </div>
      <h2 className="font-display font-bold text-3xl md:text-[42px] leading-[1.08] tracking-[0.01em] text-fg max-w-3xl">
        {title}
      </h2>
      <div className="mt-8 md:mt-12">{children}</div>
    </section>
  );
}

// --------------------------------- NAV --------------------------------------

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links: Array<[string, string]> = [
    ["El problema", "#problema"],
    ["Capacidades", "#capacidades"],
    ["Pipeline", "#pipeline"],
    ["Datos reales", "#datos"],
    ["Tecnología", "#tecnologia"],
    ["Roadmap", "#roadmap"],
  ];
  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-colors duration-300 ${
        scrolled ? "bg-ink/85 backdrop-blur-md border-b border-line" : "bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-5 md:px-8 h-16 flex items-center gap-8">
        <a href="#top" className="flex items-center gap-2.5 shrink-0" aria-label="VIGÍA — inicio">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
            <path d="M16 2 28 9v14L16 30 4 23V9z" fill="none" stroke="#3fd0b6" strokeWidth="2" />
            <path d="M16 8l5 12h-3.2v4h-3.6v-4H11z" fill="#3fd0b6" />
          </svg>
          <span className="font-display font-bold tracking-[0.22em] text-lg">VIGÍA</span>
          <span className="hidden sm:inline font-mono text-[9px] tracking-[0.18em] text-fg3 mt-1">ML</span>
        </a>
        <nav className="hidden lg:flex items-center gap-6 ml-4" aria-label="Secciones">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="font-mono text-[11px] tracking-[0.14em] text-fg3 hover:text-fg transition-colors"
            >
              {label.toUpperCase()}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://github.com/eddyflores100-lang/vigia-ml"
            target="_blank"
            rel="noreferrer"
            className="hidden md:inline-flex font-mono text-[11px] tracking-[0.14em] text-fg3 hover:text-fg transition-colors"
          >
            GITHUB ↗
          </a>
          <a
            href="#acceso"
            className="font-display font-semibold text-[13px] tracking-[0.1em] px-4 py-2 text-ink bg-gradient-to-br from-copper2 to-copper border border-copper2/60 hover:brightness-110 transition-[filter,transform] hover:-translate-y-[1px]"
            style={{ clipPath: "polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)" }}
          >
            ACCEDER
          </a>
          <button
            className="lg:hidden font-mono text-[11px] tracking-[0.14em] text-fg2 border border-line px-2.5 py-1.5"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Abrir menú"
          >
            MENÚ
          </button>
        </div>
      </div>
      {open && (
        <nav className="lg:hidden bg-ink/95 backdrop-blur-md border-b border-line px-5 py-4 flex flex-col gap-3" aria-label="Menú móvil">
          {links.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="font-mono text-[11px] tracking-[0.14em] text-fg2 hover:text-fg"
            >
              {label.toUpperCase()}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

// --------------------------------- HERO -------------------------------------

function Hero() {
  return (
    <section id="top" className="relative min-h-[100svh] flex flex-col overflow-hidden hero-scan">
      <div className="absolute inset-0">
        <img
          src="./img/hero.jpg"
          alt="Plataforma de producción de gas en alta mar de noche"
          className="w-full h-full object-cover"
          width={1456}
          height={816}
          fetchPriority="high"
        />
      </div>
      <div className="absolute inset-0 hero-shade" />
      <div className="absolute inset-0 tech-grid opacity-60" />

      <div className="relative z-10 flex-1 flex flex-col justify-center mx-auto w-full max-w-7xl px-5 md:px-8 pt-24 pb-14">
        <p className="font-mono text-[10px] md:text-[12px] tracking-[0.34em] text-copper2 mb-5">
          CONSOLA PREDICTIVA · POZOS DE GAS · MACHINE LEARNING EN EL NAVEGADOR
        </p>
        <h1 className="font-display font-bold leading-[0.98] tracking-[0.005em] text-[clamp(2.6rem,7.2vw,5.6rem)] max-w-5xl">
          Anticipa la falla.
          <br />
          <span className="text-copper2 glow-copper">Salva la producción.</span>
        </h1>
        <p className="mt-7 max-w-2xl text-fg2 text-[15px] md:text-lg leading-relaxed">
          VIGÍA vigila tus pozos con tres modelos de machine learning que corren <strong className="text-fg">100 % en tu
          navegador</strong>: pronóstico LSTM a 24 h, detección de anomalías por autoencoder y diagnóstico de
          {" "}9 regímenes de falla — sin que un solo dato salga de tu equipo.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <a href="#acceso" className="btn-primary">
            SOLICITAR ACCESO
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <a href="#pipeline" className="btn-ghost">
            VER LA TECNOLOGÍA
          </a>
        </div>

        <dl className="mt-16 md:mt-20 grid grid-cols-2 lg:grid-cols-4 gap-px bg-line/60 border border-line/60 max-w-4xl">
          {STATS.map(([n, label, sub]) => (
            <div key={label} className="bg-ink/70 backdrop-blur-sm px-5 py-4">
              <dt className="font-display font-bold text-3xl md:text-[34px] text-fg tabular-nums leading-none">
                {n}
                {n !== "0" && <span className="text-copper text-xl align-top ml-0.5">+</span>}
              </dt>
              <dd className="mt-2">
                <div className="font-mono text-[9.5px] tracking-[0.16em] text-fg2">{label}</div>
                <div className="font-mono text-[9px] tracking-[0.06em] text-fg3 mt-0.5">{sub}</div>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative z-10 pb-5 flex justify-center">
        <a href="#problema" aria-label="Bajar a la siguiente sección" className="font-mono text-[9px] tracking-[0.3em] text-fg3 hover:text-fg2 transition-colors animate-bounce">
          ▼ DESPLAZA
        </a>
      </div>
    </section>
  );
}

function Marquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="relative border-y border-line bg-deep/70 overflow-hidden py-3.5" aria-hidden="true">
      <div className="marquee-track">
        {items.map((t, i) => (
          <span key={i} className="inline-flex items-center font-mono text-[11px] tracking-[0.18em] text-fg3 mx-6">
            {t.toUpperCase()}
            <span className="ml-6 text-copper/70">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------- PROBLEMA -----------------------------------

const PROBLEMS: Array<{ icon: React.ReactNode; title: string; body: string }> = [
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v6m0 0-3 6h6l-3-6m-6.5 9A8.5 8.5 0 1 1 12 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "La carga de líquidos avanza en silencio",
    body: "Cuando el caudal ya cayó, llevas días produciendo por debajo del potencial. El pozo no lanza una alarma: se apaga despacio, slug a slug, y el informe mensual llega tarde.",
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <ellipse cx="12" cy="5.5" rx="8" ry="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
    title: "El histórico duerme en el SCADA",
    body: "Años de telemetría minuto a minuto archivados sin retroalimentar la operación. El dato que habría anticipado la falla existía — solo que nadie lo estaba mirando con modelos.",
  },
  {
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l8 4v5c0 5-3.4 8-8 9-4.6-1-8-4-8-9V7l8-4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9.5 12l2 2 3.5-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "Lo predictivo exige subir tus datos",
    body: "Las plataformas de ML industrial piden vaciar tu telemetría en su nube: compliance, contratos y fricción. VIGÍA invierte el modelo — el modelo viaja al dato, no al revés.",
  },
];

function Problema() {
  return (
    <Section id="problema" eyebrow="01 · EL PROBLEMA" title={<>El pozo no avisa.<br /><span className="text-fg3">La pérdida llega antes que el informe.</span></>}>
      <div className="grid lg:grid-cols-[1fr_1.15fr] gap-10 items-center">
        <figure className="relative reveal">
          <div className="absolute -inset-3 border border-copper/25 pointer-events-none" style={{ clipPath: "polygon(18px 0,100% 0,100% calc(100% - 18px),calc(100% - 18px) 100%,0 100%,0 18px)" }} />
          <img
            src="./img/valves.jpg"
            alt="Válvula de bola motorizada sobre ducto de gas"
            className="w-full h-[340px] md:h-[440px] object-cover border border-line"
            width={1400}
            height={1252}
            loading="lazy"
          />
          <figcaption className="absolute bottom-3 left-3 font-mono text-[9px] tracking-[0.14em] text-fg2 bg-ink/80 backdrop-blur px-2 py-1 border border-line">
            MANIFOLD DE PRODUCCIÓN · VÁLVULA MOTORIZADA
          </figcaption>
        </figure>
        <div className="grid gap-4">
          {PROBLEMS.map((p, i) => (
            <article key={p.title} className="cap-card p-5 md:p-6 reveal" style={{ "--reveal-delay": `${i * 90}ms` } as React.CSSProperties}>
              <div className="flex items-start gap-4">
                <span className="text-copper shrink-0 mt-0.5">{p.icon}</span>
                <div>
                  <h3 className="font-display font-semibold text-[17px] tracking-[0.02em] text-fg">{p.title}</h3>
                  <p className="mt-1.5 text-fg2 text-[13.5px] leading-relaxed">{p.body}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------ CAPACIDADES ---------------------------------

const CAPS: Array<{ tag: string; title: string; body: string; nuevo?: boolean }> = [
  {
    tag: "N1",
    title: "Pronóstico LSTM a 24 h",
    body: "Red recurrente entrenada en tu navegador proyecta presión y caudal con banda de incertidumbre calibrada y estimación de cruce de umbrales.",
  },
  {
    tag: "N2",
    title: "Detección de anomalías",
    body: "Autoencoder sobre 14 features físicas, fusionado con z-score multivariable. El índice 0–100 explica qué variable empuja el score.",
  },
  {
    tag: "N3",
    title: "Diagnóstico de 9 regímenes",
    body: "Clasificador + reglas físicas: carga de líquidos, restricción, falla de sensor, actuador, fugas anular/tubing, hidratos y arena.",
  },
  {
    tag: "RUL",
    title: "Vida útil restante",
    body: "Weibull con aceleración AFT por severidad: mediana p10–p90 de tiempo hasta la falla por régimen activo.",
  },
  {
    tag: "TWIN",
    title: "Gemelo digital calibrado",
    body: "Respuesta k/a/b del pozo (caudal–choke, drawdown, casing) ajustada por mínimos cuadrados con calidad NRMSE y rechazo sin excitación.",
  },
  {
    tag: "OPS",
    title: "Asesor de setpoints",
    body: "Apertura óptima de choke balanceando producción × supervivencia, con límites de Turner 1969 y erosión API RP 14E.",
  },
  {
    tag: "NODAL",
    title: "Análisis nodal IPR/VLP",
    body: "Punto de operación natural en el nodo de cabezal: IPR por regresión pt–q y VLP por inversa de Bean, con ventana operativa.",
    nuevo: true,
  },
  {
    tag: "REPLAY",
    title: "Replay CSV + matriz de confusión",
    body: "Reproduce tu histórico a 1×–900× y puntúa la detección contra etiquetas reales: exactitud, F1 y retardo por evento.",
    nuevo: true,
  },
  {
    tag: "NL",
    title: "Copiloto del operador",
    body: "17 intenciones en lenguaje natural, 100 % determinista y offline: «¿cuál es el choke óptimo?», «¿cuándo se estima la falla?».",
  },
];

function Capacidades() {
  return (
    <Section
      id="capacidades"
      eyebrow="02 · CAPACIDADES"
      title={<>Una consola, <span className="text-copper2">nueve capas</span> de vigilancia.</>}
    >
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {CAPS.map((c, i) => (
          <article key={c.title} className="cap-card p-5 reveal" style={{ "--reveal-delay": `${(i % 3) * 80}ms` } as React.CSSProperties}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] font-semibold tracking-[0.18em] px-2 py-1 border border-copper/40 text-copper2 bg-copper/5">
                {c.tag}
              </span>
              {c.nuevo && (
                <span className="font-mono text-[9px] font-semibold tracking-[0.16em] px-2 py-1 border border-ok/50 text-ok bg-ok/5">
                  v0.12 · NUEVO
                </span>
              )}
            </div>
            <h3 className="font-display font-semibold text-[16.5px] text-fg leading-snug">{c.title}</h3>
            <p className="mt-2 text-fg2 text-[13px] leading-relaxed">{c.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------- PIPELINE -----------------------------------

const PIPE: Array<{ n: string; t: string; d: string }> = [
  { n: "N1", t: "Pronóstico", d: "LSTM + Holt: proyección de pt/q/pl con banda de confianza." },
  { n: "N2", t: "Anomalía", d: "Autoencoder + z-score: índice 0–100 con contribuciones." },
  { n: "N3", t: "Diagnóstico", d: "Clasificador + reglas: hipótesis rankeadas con evidencia." },
  { n: "N4", t: "Umbrales físicos", d: "Turner, erosión y envolventes de operación del pozo." },
  { n: "N5", t: "Acciones", d: "Recomendaciones priorizadas y reporte operativo exportable." },
];

function Pipeline() {
  return (
    <Section
      id="pipeline"
      eyebrow="03 · PIPELINE"
      title={<>Cada muestra pasa por <span className="text-copper2">cinco capas</span> antes de llegar a ti.</>}
    >
      <div className="relative">
        <div className="absolute left-0 right-0 top-[52px] h-px bg-gradient-to-r from-line2 via-copper/40 to-line2 hidden md:block" />
        <ol className="grid md:grid-cols-5 gap-6 md:gap-4">
          {PIPE.map((p, i) => (
            <li key={p.n} className="pipe-node p-5 reveal" style={{ "--reveal-delay": `${i * 110}ms` } as React.CSSProperties}>
              <div className="font-display font-bold text-2xl text-copper2">{p.n}</div>
              <div className="font-display font-semibold text-[15px] mt-1 text-fg">{p.t}</div>
              <p className="text-fg3 text-[12px] leading-relaxed mt-2">{p.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 font-mono text-[10.5px] tracking-[0.08em] text-fg3 leading-relaxed max-w-3xl">
          FUSIÓN ML + REGLAS EN CADA CAPA · FALLBACK ESTADÍSTICO PERMANENTE · ENTRENAMIENTO POR LOTES EN WEB WORKER —
          LA CONSOLA NUNCA SE CONGELA.
        </p>
      </div>
    </Section>
  );
}

// ------------------------------ DATOS REALES --------------------------------

function DatosReales() {
  return (
    <Section
      id="datos"
      eyebrow="04 · DATOS REALES"
      title={<>Tu histórico. Tu modelo.<br /><span className="text-copper2">Esta habría sido la detección.</span></>}
    >
      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-fg2 text-[15px] leading-relaxed">
            Carga el CSV de cualquier pozo y reprodúcelo a velocidad ajustable contra el pipeline completo. Si el
            histórico trae etiquetas de eventos reales, la consola se examina a sí misma:{" "}
            <strong className="text-fg">matriz de confusión, precisión, recall, F1 y retardo de detección</strong> por
            evento — el argumento definitivo ante el escéptico.
          </p>
          <ul className="mt-6 space-y-3.5">
            {[
              ["Volve · Equinor", "Dos pozos reales del campo Volve (2008–2016) incluidos: F-12 H con 8,5 años de historia diaria y F-11 H."],
              ["CSV flexible", "Separadores , ; tab · fechas ISO/epoch · sinónimos de columnas en ES/EN · reporte de calidad con huecos y duplicados."],
              ["Base auto-derivada", "La base operativa del pozo se recalcula del propio histórico: sin configuración manual."],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3.5">
                <span className="mt-[7px] w-1.5 h-1.5 shrink-0 bg-copper rotate-45" />
                <div>
                  <span className="font-display font-semibold text-fg text-[14.5px]">{t}</span>
                  <span className="text-fg2 text-[13px] leading-relaxed"> — {d}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-[10px] text-fg3 leading-relaxed">
            DATOS VOLVE: EQUIVAR/EOFINA — CONJUNTO PÚBLICO DE CAMPO VOLVE, LICENCIA CC BY-NC-SA 4.0. CON FINES DE
            DEMOSTRACIÓN.
          </p>
        </div>
        <figure className="shot-frame reveal">
          <img
            src="./img/shot-diagnostico.jpg"
            alt="Consola VIGÍA mostrando diagnóstico de carga de líquidos con evidencia física"
            className="w-full border border-line"
            width={1400}
            height={1499}
            loading="lazy"
          />
          <figcaption className="absolute bottom-2 inset-x-0 text-center font-mono text-[9px] tracking-[0.16em] text-fg3">
            DIAGNÓSTICO N3 · CARGA DE LÍQUIDOS · CONF. 97 %
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}

// ------------------------------ CAPTURAS ------------------------------------

function Capturas() {
  const shots: Array<[string, string, string]> = [
    ["./img/shot-consola.jpg", "CONSOLA OPERATIVA", "Flota, KPIs, pronóstico y copiloto en una pantalla"],
    ["./img/shot-flota.jpg", "COMPARATIVA DE FLOTA", "Estado, tendencia y score por pozo"],
    ["./img/shot-diagnostico.jpg", "DIAGNÓSTICO ML", "Hipótesis con evidencia física auditable"],
  ];
  return (
    <Section eyebrow="05 · LA CONSOLA" title={<>Ingeniería densa, <span className="text-copper2">cero fricción</span>.</>}>
      <div className="grid md:grid-cols-3 gap-6 items-start">
        {shots.map(([src, tag, sub], i) => (
          <figure key={tag} className="shot-frame reveal" style={{ "--reveal-delay": `${i * 110}ms` } as React.CSSProperties}>
            <img src={src} alt={`${tag} — ${sub}`} className="w-full border border-line" width={1400} height={1499} loading="lazy" />
            <figcaption className="absolute bottom-2 inset-x-0 text-center">
              <span className="font-mono text-[9px] tracking-[0.16em] text-fg2">{tag}</span>
              <span className="hidden md:block font-mono text-[8.5px] tracking-[0.08em] text-fg3 mt-0.5">{sub.toUpperCase()}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------ TECNOLOGÍA ----------------------------------

function Tecnologia() {
  return (
    <Section
      id="tecnologia"
      eyebrow="06 · TECNOLOGÍA"
      title={<>El modelo viaja al dato.<br /><span className="text-copper2">Nunca al revés.</span></>}
    >
      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 items-stretch">
        <figure className="relative border border-line overflow-hidden min-h-[300px]">
          <img
            src="./img/control-room.jpg"
            alt="Ingenieras supervisando pantallas en sala de control"
            className="absolute inset-0 w-full h-full object-cover"
            width={1600}
            height={1067}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent" />
          <figcaption className="absolute bottom-4 left-4 right-4">
            <div className="font-mono text-[9px] tracking-[0.18em] text-fg2 bg-ink/75 backdrop-blur border border-line px-2.5 py-1.5 inline-block">
              SALA DE CONTROL · TURNO NOCTURNO · MODO PWA OFFLINE
            </div>
          </figcaption>
        </figure>
        <div className="grid gap-4 content-start">
          {[
            ["100 % navegador", "Los tres modelos entrenan e infieren en un Web Worker con TensorFlow.js. Verificable: abre la pestaña de red — sin credenciales configuradas, la consola no hace ni una llamada externa."],
            ["Ingesta estándar", "Puente OPC-UA vía WebSocket para SCADA en vivo, o replay CSV para históricos. Las muestras entran saneadas con guardas de rango físico."],
            ["Calidad de producción", "173 tests unitarios, E2E con Playwright en CI, PWA instalable offline, typecheck estricto y build reproducible en cada push."],
            ["Honestidad ante todo", "Telemetría sintética declarada, datos Volve atribuidos, calibraciones que se rechazan solas sin excitación suficiente."],
          ].map(([t, d], i) => (
            <article key={t} className="cap-card p-5 reveal" style={{ "--reveal-delay": `${i * 80}ms` } as React.CSSProperties}>
              <h3 className="font-display font-semibold text-[16px] text-copper2">{t}</h3>
              <p className="mt-1.5 text-fg2 text-[13px] leading-relaxed">{d}</p>
            </article>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------- ROADMAP ------------------------------------

const ROAD: Array<[string, string, string]> = [
  ["v0.6", "Robustez", "Suite Vitest · saneamiento · PWA offline · export CSV/JSON"],
  ["v0.7", "Rendimiento", "Motor TF.js en Web Worker · comparativa de flota · reporte PDF"],
  ["v0.8", "Datos reales I", "DCA Arps (EUR) · conector OPC-UA vía puente WebSocket"],
  ["v0.9", "Soft-sensors", "Medición virtual por choke (Bean) · RUL Weibull + AFT"],
  ["v0.10", "Interacción", "Copiloto NL 100 % local · tarjeta EXPLAIN"],
  ["v0.11", "Física operativa", "Asesor de setpoints · 4 regímenes nuevos · gemelo digital"],
  ["v0.12", "Piloto con datos reales", "Replay CSV · Volve real · análisis nodal · E2E · este sitio"],
];

function Roadmap() {
  return (
    <Section id="roadmap" eyebrow="07 · ROADMAP" title={<>De demo didáctica a <span className="text-copper2">herramienta de piloto</span>.</>}>
      <ol className="relative border-l border-line2 ml-2 space-y-7">
        {ROAD.map(([v, t, d], i) => (
          <li key={v} className="relative pl-8 reveal" style={{ "--reveal-delay": `${i * 70}ms` } as React.CSSProperties}>
            <span
              className={`absolute -left-[7px] top-1 w-[13px] h-[13px] rotate-45 border ${
                v === "v0.12" ? "bg-copper border-copper2" : "bg-ink border-line2"
              }`}
            />
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className={`font-mono text-[12px] font-semibold tracking-[0.12em] ${v === "v0.12" ? "text-copper2" : "text-fc"}`}>
                {v}
              </span>
              <span className="font-display font-semibold text-[16px] text-fg">{t}</span>
              {v === "v0.12" && (
                <span className="font-mono text-[9px] tracking-[0.16em] px-2 py-0.5 border border-copper/50 text-copper2">
                  LANZAMIENTO ACTUAL
                </span>
              )}
            </div>
            <p className="text-fg3 text-[13px] leading-relaxed mt-1 max-w-2xl">{d}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

// --------------------------------- FOOTER -----------------------------------

function Footer() {
  return (
    <footer className="border-t border-line bg-deep/60">
      <div className="mx-auto max-w-7xl px-5 md:px-8 py-10 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M16 2 28 9v14L16 30 4 23V9z" fill="none" stroke="#3fd0b6" strokeWidth="2" />
              <path d="M16 8l5 12h-3.2v4h-3.6v-4H11z" fill="#3fd0b6" />
            </svg>
            <span className="font-display font-bold tracking-[0.22em]">VIGÍA ML</span>
          </div>
          <p className="mt-3 text-fg3 text-[12px] leading-relaxed max-w-sm">
            Consola predictiva de pozos de gas con machine learning en el navegador. Proyecto de demostración
            educativa: no sustituye sistemas de control ni debe usarse para decisiones operativas críticas.
          </p>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-fg3 mb-3">PROYECTO</div>
          <ul className="space-y-2 text-[13px]">
            <li><a className="text-fg2 hover:text-copper2 transition-colors" href="https://github.com/eddyflores100-lang/vigia-ml" target="_blank" rel="noreferrer">Repositorio GitHub ↗</a></li>
            <li><a className="text-fg2 hover:text-copper2 transition-colors" href="https://github.com/eddyflores100-lang/vigia-ml/releases" target="_blank" rel="noreferrer">Releases ↗</a></li>
            <li><a className="text-fg2 hover:text-copper2 transition-colors" href="#roadmap">Roadmap</a></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-fg3 mb-3">DATOS</div>
          <ul className="space-y-2 text-[13px] text-fg2">
            <li>Telemetría sintética declarada</li>
            <li>Volve © Equinor · CC BY-NC-SA 4.0</li>
            <li>Licencia del código: AL-1.0</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto max-w-7xl px-5 md:px-8 py-4 flex flex-wrap gap-x-6 gap-y-2 items-center font-mono text-[9.5px] tracking-[0.12em] text-fg3">
          <span>VIGÍA ML v0.12.0 · 2026</span>
          <span>TENSORFLOW.JS · REACT 18 · TYPESCRIPT</span>
          <span className="ml-auto">HECHO PARA INGENIEROS DE PRODUCCIÓN</span>
        </div>
      </div>
    </footer>
  );
}

// --------------------------------- PÁGINA -----------------------------------

export default function Landing() {
  return (
    <div className="relative">
      <Nav />
      <Hero />
      <Marquee />
      <div className="relative">
        <div className="absolute inset-0 tech-grid opacity-30 pointer-events-none" />
        <Problema />
        <Capacidades />
        <Pipeline />
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <img src="./img/wide-strip.jpg" alt="Silueta de plataforma marina al atardecer" className="w-full h-[240px] md:h-[300px] object-cover border-y border-line opacity-80" width={1500} height={544} loading="lazy" />
        </div>
        <DatosReales />
        <Capturas />
        <Tecnologia />
        <Roadmap />
      </div>
      <GateSection />
      <Footer />
    </div>
  );
}

/** Re-export para el entry: mantiene un único punto de lectura de la clave. */
export { ACCESS_KEY };
