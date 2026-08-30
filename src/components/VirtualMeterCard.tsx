import { useMemo } from "react";
import { meterCheck, suggestDia, PSI_ATM } from "../lib/virtualMeter";
import type { Sample, VarKey } from "../lib/sim";
import { VAR_META } from "../lib/sim";
import { SectionHead } from "./bits";

const fmt = (v: number, dec = 0) =>
  Number.isFinite(v) ? v.toLocaleString("es-EC", { maximumFractionDigits: dec, minimumFractionDigits: dec }) : "—";

const VM_COLOR = "#7fb4e6";
const FLAG_COLOR = "#f26d5f";

function Metric({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="min-w-[86px]">
      <div className="font-mono text-[8.5px] tracking-[0.14em] text-fg3 uppercase">{label}</div>
      <div className="font-mono text-[15px] font-semibold tabular-nums leading-tight" style={{ color: accent ?? "var(--color-fg)" }}>
        {value}
        {unit && <span className="text-[9px] font-normal text-fg3 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * Medición virtual por choke: soft-sensor de caudal (fórmula de Bean) que
 * calibra el Cd del pozo contra el medidor fiscal y contrasta ambas lecturas.
 * Si FT-301 decae, el contraste lo señala y la estimación puede usarse de
 * respaldo mientras se re-calibra el instrumento.
 */
export function VirtualMeterCard({ samples, base }: { samples: Sample[]; base: Record<VarKey, number> }) {
  const vm = useMemo(() => {
    const last = samples[samples.length - 1];
    if (!last) return null;
    const dia = suggestDia(base.q, base.pt, base.pl, base.temp, base.choke);
    const chk = meterCheck(
      {
        chokePct: last.choke,
        pUpPsig: last.pt,
        pDownPsig: last.pl,
        tempC: last.temp,
        chokeDiaIn: dia,
      },
      last.q,
    );
    return { dia, chk, last };
  }, [samples, base]);

  if (!vm) return null;
  const { chk } = vm;
  const ok = chk.cdCalibrated !== null && chk.qVirtual > 1;

  return (
    <div className="panel corners p-3.5 flex-1 min-w-[280px] rise" style={{ animationDelay: "240ms" }}>
      <SectionHead
        level="MV"
        title="Medición virtual · soft-sensor por choke"
        accent={VM_COLOR}
        right={
          <span
            className="font-mono text-[8px] font-semibold tracking-[0.14em] px-1.5 py-[2px] border"
            style={{
              color: !ok ? "#5f7a82" : chk.flag ? FLAG_COLOR : "#3fd0b6",
              borderColor: !ok ? "#5f7a8244" : chk.flag ? `${FLAG_COLOR}55` : "#3fd0b655",
              background: !ok ? "transparent" : chk.flag ? `${FLAG_COLOR}0f` : "#3fd0b60f",
            }}
          >
            {!ok ? "SIN CALIBRACIÓN" : chk.flag ? "MEDIDOR · REVISAR" : "MEDIDOR · OK"}
          </span>
        }
      />

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <Metric label="Q virtual (choke)" value={fmt(chk.qVirtual)} unit="Mscf/d" accent={VM_COLOR} />
        <Metric label={`Q medidor (${VAR_META.q.tag})`} value={fmt(chk.qMeasured)} unit="Mscf/d" />
        <Metric
          label="Desviación"
          value={`${chk.devPct >= 0 ? "+" : ""}${fmt(chk.devPct, 1)}`}
          unit="%"
          accent={!ok ? undefined : chk.flag ? FLAG_COLOR : "#3fd0b6"}
        />
        <Metric label="Cd calibrado" value={chk.cdCalibrated ? fmt(chk.cdCalibrated, 2) : "—"} />
        <Metric label="Choke nominal" value={fmt(vm.dia * 64)} unit="/64 in" />
      </div>

      <p className="mt-2.5 text-[10px] text-fg3 leading-relaxed font-mono">
        BEAN (CRÍTICO) + FACTOR SUBCRÍTICO · P·tubing {fmt(vm.last.pt + PSI_ATM, 0)} psia → P·línea{" "}
        {fmt(vm.last.pl + PSI_ATM, 0)} psia · SI {VAR_META.q.tag} DECAE, USAR Q VIRTUAL COME RESPALDO Y
        RE-CALIBRAR EL INSTRUMENTO
      </p>
    </div>
  );
}
