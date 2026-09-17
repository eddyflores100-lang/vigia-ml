import { useState } from "react";
import { appendLead, checkKey, grantAccess } from "./gate";

// ---------------------------------------------------------------------------
// VIGÍA · sección de acceso (gate) del landing
// Dos vías: formulario de contacto (registro local de la solicitud) o clave
// de demostración. Al validar, concede el acceso y redirige a la consola.
// ---------------------------------------------------------------------------

export function GateSection() {
  const [tab, setTab] = useState<"form" | "key">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState("");

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Escribe tu nombre para continuar.");
    if (!emailOk) return setError("El correo no parece válido.");
    setError("");
    const rec = { via: "form" as const, name: name.trim(), email: email.trim(), company: company.trim(), role: role.trim(), ts: Date.now() };
    appendLead(rec);
    grantAccess(rec);
    window.location.href = "./app.html";
  };

  const submitKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkKey(keyInput)) return setError("Clave incorrecta. Pídela al administrador de la demo.");
    setError("");
    const rec = { via: "key" as const, ts: Date.now() };
    grantAccess(rec);
    window.location.href = "./app.html";
  };

  return (
    <section id="acceso" className="relative overflow-hidden border-t border-line">
      <div className="absolute inset-0">
        <img
          src="./img/cta-bg.jpg"
          alt="Plataforma de gas al crepúsculo"
          className="w-full h-full object-cover"
          width={1536}
          height={1025}
          loading="lazy"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-ink via-ink/88 to-ink" />

      <div className="relative mx-auto max-w-7xl px-5 md:px-8 py-20 md:py-28 grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div>
          <div className="flex items-center gap-4 mb-3">
            <span className="font-mono text-[10px] md:text-[11px] tracking-[0.3em] text-copper">08 · ACCESO</span>
            <span className="rule flex-1 max-w-[200px]" />
          </div>
          <h2 className="font-display font-bold text-3xl md:text-[42px] leading-[1.08] text-fg">
            Entra a la consola.
            <br />
            <span className="text-copper2">Entrena los modelos ahora mismo.</span>
          </h2>
          <p className="mt-6 text-fg2 text-[15px] leading-relaxed max-w-lg">
            Del otro lado te espera la consola completa: flota de pozos en vivo, entrenamiento de LSTM/autoencoder en
            tu navegador, replay del histórico real de Volve, análisis nodal y el copiloto. Sin registro en nubes ni
            instalaciones — el acceso solo registra tu solicitud localmente.
          </p>
          <ul className="mt-7 space-y-2.5 font-mono text-[11px] tracking-[0.06em] text-fg3">
            <li>◆ ENTRENAMIENTO COMPLETO EN ~10 S (WEBGL) O ~20 S (CPU)</li>
            <li>◆ DEMO ETIQUETADO DE 55 H + 2 POZOS VOLVE REALES INCLUIDOS</li>
            <li>◆ FUNCIONA OFFLINE TRAS LA PRIMERA VISITA (PWA)</li>
          </ul>
        </div>

        <div className="border border-line2 bg-panel/90 backdrop-blur-md p-6 md:p-8" style={{ clipPath: "polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px)" }}>
          <div className="flex border border-line overflow-hidden mb-6" role="tablist" aria-label="Vías de acceso">
            {(
              [
                ["form", "SOLICITAR ACCESO"],
                ["key", "CLAVE DE DEMO"],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => { setTab(t); setError(""); }}
                className={`flex-1 px-3 py-2.5 font-mono text-[10px] tracking-[0.14em] transition-colors ${
                  tab === t ? "bg-copper/15 text-copper2 border-b-2 border-copper" : "text-fg3 hover:text-fg2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "form" ? (
            <form onSubmit={submitForm} noValidate className="grid gap-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="grid gap-1.5">
                  <span className="font-mono text-[9.5px] tracking-[0.16em] text-fg3">NOMBRE *</span>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ana Pérez" />
                </label>
                <label className="grid gap-1.5">
                  <span className="font-mono text-[9.5px] tracking-[0.16em] text-fg3">CORREO *</span>
                  <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="ana@operadora.com" />
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="grid gap-1.5">
                  <span className="font-mono text-[9.5px] tracking-[0.16em] text-fg3">EMPRESA</span>
                  <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" placeholder="Operadora de gas" />
                </label>
                <label className="grid gap-1.5">
                  <span className="font-mono text-[9.5px] tracking-[0.16em] text-fg3">ROL</span>
                  <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="">Selecciona…</option>
                    <option value="Ing. de producción">Ing. de producción</option>
                    <option value="Ing. de yacimientos">Ing. de yacimientos</option>
                    <option value="Supervisor de campo">Supervisor de campo</option>
                    <option value="Data scientist">Data scientist</option>
                    <option value="Estudiante / académico">Estudiante / académico</option>
                    <option value="Otro">Otro</option>
                  </select>
                </label>
              </div>
              {error && <p role="alert" className="font-mono text-[11px] text-crit">⚠ {error}</p>}
              <button type="submit" className="btn-primary w-full justify-center mt-1">
                ENTRAR A LA CONSOLA
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <p className="font-mono text-[9px] leading-relaxed text-fg3">
                La solicitud se registra solo en este navegador. Sin servidores, sin correos automáticos.
              </p>
            </form>
          ) : (
            <form onSubmit={submitKey} noValidate className="grid gap-4">
              <label className="grid gap-1.5">
                <span className="font-mono text-[9.5px] tracking-[0.16em] text-fg3">CLAVE DE ACCESO</span>
                <input
                  className="field text-center tracking-[0.3em] text-[15px]"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="VIGIA-••••"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              {error && <p role="alert" className="font-mono text-[11px] text-crit">⚠ {error}</p>}
              <button type="submit" className="btn-primary w-full justify-center mt-1">
                DESBLOQUEAR
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="5" y="10.5" width="14" height="9.5" rx="1" stroke="currentColor" strokeWidth="2" />
                  <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
              <p className="font-mono text-[9px] leading-relaxed text-fg3">
                ¿Tienes la clave del administrador de la demo? Es la vía rápida para evaluadores y colegas.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
