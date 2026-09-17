import { useState } from "react";
import { appendLead, checkKey, grantAccess } from "./gate";

// ---------------------------------------------------------------------------
// VIGÍA · sección de acceso (gate) del landing — «Cuaderno de laboratorio»
// Dos vías: formulario de contacto (registro local de la solicitud) o clave
// de demostración. Al validar, concede el acceso y redirige a la consola.
// El panel se presenta como un impreso formal (FORM. VIG-A1) con bloque de
// título; los rótulos accesibles son estables para los tests E2E.
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
    <section id="acceso" className="relative border-t-2 border-ink bg-paper2/60">
      <div className="mx-auto max-w-6xl px-5 md:px-8 py-16 md:py-24 grid lg:grid-cols-[1.05fr_1fr] gap-11 items-center">
        <div>
          <div className="h-[2px] bg-ink mb-4 max-w-[420px]" />
          <p className="font-mono text-[10.5px] md:text-[11.5px] tracking-[0.22em] text-red font-semibold">
            § 08 — ACCESO AL LABORATORIO
          </p>
          <h2 className="mt-3 font-display font-bold uppercase text-[27px] md:text-[38px] leading-[1.06] text-ink">
            Entra a la consola.
            <br />
            <span className="mark-red">Entrena los modelos ahora mismo.</span>
          </h2>
          <p className="mt-6 text-ink2 text-[14.5px] leading-relaxed max-w-lg">
            Del otro lado te espera la consola completa: flota de pozos en vivo, entrenamiento de LSTM/autoencoder en
            tu navegador, replay del histórico real de Volve, análisis nodal y el copiloto. Sin registro en nubes ni
            instalaciones — el acceso solo registra tu solicitud localmente.
          </p>
          <ul className="mt-7 space-y-2.5 font-mono text-[10.5px] tracking-[0.06em] text-ink2">
            <li>▣ ENTRENAMIENTO COMPLETO EN ~10 S (WEBGL) O ~20 S (CPU)</li>
            <li>▣ DEMO ETIQUETADO DE 55 H + 2 POZOS VOLVE REALES INCLUIDOS</li>
            <li>▣ FUNCIONA OFFLINE TRAS LA PRIMERA VISITA (PWA)</li>
          </ul>
          <p className="mt-8 font-mono text-[9px] tracking-[0.14em] text-ink3">
            FORM. VIG-A1 · REV. C · LA SOLICITUD SE ARCHIVA SOLO EN ESTE NAVEGADOR
          </p>
        </div>

        <div className="relative border border-ink bg-plate" style={{ boxShadow: "5px 5px 0 0 rgba(27,24,18,0.14)" }}>
          {/* bloque de título del impreso */}
          <div className="grid grid-cols-[1fr_auto_auto] divide-x divide-ink border-b border-ink font-mono text-[8.5px] tracking-[0.14em]">
            <div className="px-3.5 py-2 font-semibold text-ink">FORM. VIG-A1 · SOLICITUD DE ACCESO</div>
            <div className="px-3.5 py-2 text-ink2">Nº ______</div>
            <div className="px-3.5 py-2 text-ink2">HOJA 1/1</div>
          </div>

          <div className="p-6 md:p-7">
            <div className="flex border-b-0 mb-6" role="tablist" aria-label="Vías de acceso">
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
                  className="gate-tab"
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "form" ? (
              <form onSubmit={submitForm} noValidate className="grid gap-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="grid gap-1.5">
                    <span className="font-mono text-[9px] tracking-[0.16em] text-ink3">NOMBRE *</span>
                    <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ana Pérez" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="font-mono text-[9px] tracking-[0.16em] text-ink3">CORREO *</span>
                    <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="ana@operadora.com" />
                  </label>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <label className="grid gap-1.5">
                    <span className="font-mono text-[9px] tracking-[0.16em] text-ink3">EMPRESA</span>
                    <input className="field" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" placeholder="Operadora de gas" />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="font-mono text-[9px] tracking-[0.16em] text-ink3">ROL</span>
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
                {error && <p role="alert" className="font-mono text-[11px] text-red">⚠ {error}</p>}
                <button type="submit" className="btn-primary w-full justify-center mt-1">
                  ENTRAR A LA CONSOLA
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <p className="font-mono text-[9.5px] text-ink3 pt-1.5">
                  FIRMA DEL SOLICITANTE: <span className="inline-block w-44 border-b border-ink3 align-baseline" aria-hidden="true">&nbsp;</span>
                </p>
                <p className="font-mono text-[9px] leading-relaxed text-ink3">
                  La solicitud se registra solo en este navegador. Sin servidores, sin correos automáticos.
                </p>
              </form>
            ) : (
              <form onSubmit={submitKey} noValidate className="grid gap-4">
                <label className="grid gap-1.5">
                  <span className="font-mono text-[9px] tracking-[0.16em] text-ink3">CLAVE DE ACCESO</span>
                  <input
                    className="field text-center tracking-[0.3em] text-[15px]"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="VIGIA-••••"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                {error && <p role="alert" className="font-mono text-[11px] text-red">⚠ {error}</p>}
                <button type="submit" className="btn-primary w-full justify-center mt-1">
                  DESBLOQUEAR
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="5" y="10.5" width="14" height="9.5" rx="1" stroke="currentColor" strokeWidth="2" />
                    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                <p className="font-mono text-[9px] leading-relaxed text-ink3">
                  ¿Tienes la clave del administrador de la demo? Es la vía rápida para evaluadores y colegas.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
