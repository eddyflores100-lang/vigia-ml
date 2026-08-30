import { useMemo, useRef, useState } from "react";
import { answerQuestion, SUGGESTED_QUESTIONS } from "../lib/copilot";
import type { CopilotAnswer, CopilotContext } from "../lib/copilot";
import { SectionHead } from "./bits";

const CO_COLOR = "#4bd1b4"; // verde del consolo

interface Turn {
  q: string;
  a: CopilotAnswer;
}

/**
 * Panel del copiloto «pregúntale al pozo» (roadmap #2): consulta en lenguaje
 * natural sobre eventos, diagnósticos y tendencias con respuesta determinista
 * compuesta desde el pipeline real. Todo local: la pregunta nunca sale del
 * navegador. Historial de 6 turnos + chips de sugerencia.
 */
export function CopilotPanel({ ctx }: { ctx: CopilotContext }) {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const ask = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const a = answerQuestion(t, ctxRef.current);
    setTurns((prev) => [{ q: t, a }, ...prev].slice(0, 6));
    setQ("");
  };

  const chips = useMemo(() => SUGGESTED_QUESTIONS.slice(0, 5), []);
  const busyRef = useRef(false);

  return (
    <div className="panel corners p-3.5 flex flex-col min-w-0">
      <SectionHead
        level="COPILOTO"
        title="Pregúntale al pozo"
        accent={CO_COLOR}
        right={
          <span className="font-mono text-[8px] tracking-[0.14em] text-fg3">
            NL · 100 % LOCAL · SIN LLM EXTERNO
          </span>
        }
      />

      {turns.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-3 max-h-[320px] overflow-y-auto pr-1">
          {[...turns].reverse().map((t, i) => (
            <div key={`${t.a.intent}-${i}`} className="border border-line/70 rounded-sm p-2.5 bg-black/20">
              <div className="font-mono text-[10px] text-fg2 mb-1.5">
                <span style={{ color: CO_COLOR }}>▸ </span>
                {t.q}
              </div>
              <p className="text-[11.5px] text-fg leading-relaxed whitespace-pre-line">{t.a.answer}</p>
              {t.a.bullets.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {t.a.bullets.map((b, j) => (
                    <li key={j} className="text-[10px] text-fg3 leading-snug pl-2.5 relative">
                      <span className="absolute left-0 top-[5px] w-1 h-1 rounded-full" style={{ background: `${CO_COLOR}88` }} />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-1 font-mono text-[8px] tracking-[0.12em] text-fg3/70 uppercase">intent: {t.a.intent}</div>
            </div>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (busyRef.current) return; // reentrancia del submit
          busyRef.current = true;
          ask(q);
          busyRef.current = false;
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej.: ¿por qué subió el índice? ¿cuándo falla? ¿cuál es el EUR?"
          aria-label="Pregunta al copiloto sobre el pozo"
          className="flex-1 min-w-0 bg-black/30 border border-line px-2.5 py-1.5 text-[11.5px] text-fg placeholder:text-fg3/60 focus:outline-none focus:border-ok/60"
        />
        <button
          type="submit"
          aria-label="Enviar pregunta al copiloto"
          className="px-3 py-1.5 font-mono text-[9.5px] tracking-[0.14em] border transition-colors hover:opacity-90"
          style={{ color: CO_COLOR, borderColor: `${CO_COLOR}66`, background: `${CO_COLOR}14` }}
        >
          PREGUNTAR
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5 mt-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => ask(c)}
            className="px-2 py-[3px] text-[9.5px] text-fg2 border border-line rounded-sm hover:border-ok/60 hover:text-ok transition-colors"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
