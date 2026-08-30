import { describe, it, expect } from "vitest";
import {
  beanRate,
  calibrateCd,
  effectiveDia,
  meterCheck,
  suggestDia,
  virtualRate,
  RATIO_CRITICAL,
} from "../src/lib/virtualMeter";

const OK: Parameters<typeof virtualRate>[0] = {
  chokePct: 54,
  pUpPsig: 560,
  pDownPsig: 430,
  tempC: 44,
  sg: 0.68,
  chokeDiaIn: 0.5,
  cd: 0.82,
};

describe("virtualMeter — física del choke", () => {
  it("es monotónico en la presión aguas arriba", () => {
    const lo = virtualRate({ ...OK, pUpPsig: 400 }).qVirtual;
    const hi = virtualRate({ ...OK, pUpPsig: 800 }).qVirtual;
    expect(hi).toBeGreaterThan(lo * 1.5);
  });

  it("escala con el cuadrado del diámetro efectivo", () => {
    const q1 = virtualRate({ ...OK, chokeDiaIn: 0.25 }).qVirtual;
    const q2 = virtualRate({ ...OK, chokeDiaIn: 0.5 }).qVirtual;
    expect(q2 / q1).toBeCloseTo(4, 5);
  });

  it("reduce el caudal al subir la temperatura (densidad menor)", () => {
    const cold = virtualRate({ ...OK, tempC: 20 }).qVirtual;
    const hot = virtualRate({ ...OK, tempC: 90 }).qVirtual;
    expect(hot).toBeLessThan(cold);
    expect(cold / hot).toBeCloseTo(Math.sqrt((90 + 460) / (20 + 460)), 3);
  });

  it("aplica el factor subcrítico solo cuando P2/P1 > r_c", () => {
    const crit = virtualRate({ ...OK, pDownPsig: 100 }); // ratio ≈ 0.18 < 0.7
    expect(crit.regime).toBe("crítico");
    expect(crit.subFactor).toBe(1);
    // subcrítico: P2/P1 = (500+14.7)/(700+14.7) ≈ 0.72 > 0.7
    const sub = virtualRate({ ...OK, pUpPsig: 700, pDownPsig: 500 });
    expect(sub.regime).toBe("subcrítico");
    expect(sub.subFactor).toBeLessThan(1);
    expect(sub.qVirtual).toBeLessThan(0.82 * beanRate(700 + 14.7, 44, 0.68, effectiveDia(0.5, 54)));
  });

  it("el factor subcrítico anula el flujo en ratio → 1", () => {
    const r = virtualRate({ ...OK, pUpPsig: 700, pDownPsig: 699.9 }); // ratio ≈ 0.9999
    const qCrit = 0.82 * beanRate(700 + 14.7, 44, 0.68, effectiveDia(0.5, 54));
    expect(r.qVirtual).toBeLessThan(qCrit * 0.05);
  });

  it("rechaza entradas no físicas con razón", () => {
    expect(virtualRate({ ...OK, pUpPsig: -30 }).valid).toBe(false);
    expect(virtualRate({ ...OK, tempC: 300 }).valid).toBe(false);
    expect(virtualRate({ ...OK, sg: 2 }).valid).toBe(false);
    expect(virtualRate({ ...OK, chokePct: 0 }).reason).toContain("cerrado");
    const r = virtualRate({ ...OK, cd: 1.4 });
    expect(r.valid).toBe(false);
    expect(r.qVirtual).toBe(0);
  });
});

describe("virtualMeter — calibración y contraste de medidor", () => {
  it("calibrateCd reproduce el caudal del medidor", () => {
    const qMeasured = 2250;
    const cd = calibrateCd(OK, qMeasured);
    expect(cd).not.toBeNull();
    expect(cd!).toBeGreaterThanOrEqual(0.5);
    expect(cd!).toBeLessThanOrEqual(1.0);
    const back = virtualRate({ ...OK, cd: cd! }).qVirtual;
    expect(back).toBeCloseTo(qMeasured, 4);
  });

  it("suggestDia produce un choke nominal con Cd ≈ objetivo", () => {
    const dia = suggestDia(2250, 560, 430, 44, 54);
    expect(dia).toBeGreaterThan(0.125);
    expect(dia).toBeLessThanOrEqual(2);
    const cd = calibrateCd({ ...OK, chokeDiaIn: dia }, 2250);
    expect(cd).not.toBeNull();
    expect(Math.abs(cd! - 0.82)).toBeLessThan(0.02);
  });

  it("meterCheck marca un medidor degradado >5 % y no marca uno sano", () => {
    const qTrue = virtualRate({ ...OK, cd: 0.82 }).qVirtual;
    const sane = meterCheck(OK, qTrue * 1.01, 0.82);
    expect(sane.flag).toBe(false);
    const decayed = meterCheck(OK, qTrue * 0.85, 0.82); // medidor 15 % bajo
    expect(decayed.flag).toBe(true);
    expect(decayed.devPct).toBeLessThan(-10);
  });

  it("el ratio crítico por defecto es 0.70 y la calibración devuelve null fuera de rango", () => {
    expect(RATIO_CRITICAL).toBe(0.7);
    // caudal imposible: el Cd necesario se sale del rango físico
    expect(calibrateCd(OK, 1e6)).toBeNull();
    expect(calibrateCd(OK, 0)).toBeNull();
  });
});
