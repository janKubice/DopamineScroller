import { describe, it, expect } from 'vitest';
import { CostCurve } from './CostCurve';
import { BigNumber } from '../math/BigNumber';

const n = BigNumber.of;

describe('CostCurve — cena kusu', () => {
  const curve = new CostCurve(n(100), 1.15);

  it('priceAt odpovídá vzorci', () => {
    expect(curve.priceAt(0).toNumber()).toBeCloseTo(100, 5);
    expect(curve.priceAt(1).toNumber()).toBeCloseTo(115, 5);
    expect(curve.priceAt(9).toNumber()).toBeCloseTo(351.79, 1);
  });
});

describe('CostCurve — hromadná cena', () => {
  const curve = new CostCurve(n(100), 1.15);

  it('bulkPrice je součet řady', () => {
    expect(curve.bulkPrice(0, 1).toNumber()).toBeCloseTo(100, 5);
    expect(curve.bulkPrice(0, 2).toNumber()).toBeCloseTo(215, 4);
    expect(curve.bulkPrice(0, 3).toNumber()).toBeCloseTo(347.25, 2);
  });

  it('count <= 0 je nula', () => {
    expect(curve.bulkPrice(0, 0).isZero()).toBe(true);
  });

  it('multiplikátor 1 je lineární', () => {
    const flat = new CostCurve(n(10), 1);
    expect(flat.bulkPrice(0, 5).toNumber()).toBeCloseTo(50, 5);
  });
});

describe('CostCurve — maxAffordable', () => {
  const curve = new CostCurve(n(100), 1.15);

  it('hranice rozpočtu', () => {
    expect(curve.maxAffordable(0, n(99))).toBe(0);
    expect(curve.maxAffordable(0, n(100))).toBe(1);
    expect(curve.maxAffordable(0, n(214))).toBe(1);
    expect(curve.maxAffordable(0, n(215))).toBe(2);
    expect(curve.maxAffordable(0, n(350))).toBe(3);
  });

  it('respektuje již vlastněné kusy', () => {
    // priceAt(2)=132.25, priceAt(3)=152.0875 -> 2 kusy stojí ~284.34
    expect(curve.maxAffordable(2, n(284.34))).toBe(2);
    expect(curve.maxAffordable(2, n(284.33))).toBe(1);
  });
});
