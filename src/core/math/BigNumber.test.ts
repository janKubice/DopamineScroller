import { describe, it, expect } from 'vitest';
import { BigNumber } from './BigNumber';

const bn = BigNumber.of;

describe('BigNumber — konstrukce a normalizace', () => {
  it('normalizuje běžná čísla', () => {
    expect(bn(0).isZero()).toBe(true);
    expect(bn(1).m).toBeCloseTo(1);
    expect(bn(1).e).toBe(0);
    expect(bn(12345).m).toBeCloseTo(1.2345);
    expect(bn(12345).e).toBe(4);
    expect(bn(0.0005).m).toBeCloseTo(5);
    expect(bn(0.0005).e).toBe(-4);
  });

  it('zachází s nekonečnem a NaN jako s nulou', () => {
    expect(bn(Infinity).isZero()).toBe(true);
    expect(bn(NaN).isZero()).toBe(true);
  });
});

describe('BigNumber — aritmetika', () => {
  it('sčítá', () => {
    expect(bn(100).add(bn(15)).toNumber()).toBeCloseTo(115);
    expect(bn(0).add(bn(42)).toNumber()).toBeCloseTo(42);
  });

  it('zanedbá řádově menší člen', () => {
    const r = bn(1e20).add(bn(1));
    expect(r.e).toBe(20);
    expect(r.m).toBeCloseTo(1);
  });

  it('odčítá včetně výsledku nula', () => {
    expect(bn(7).sub(bn(3)).toNumber()).toBeCloseTo(4);
    expect(bn(5).sub(bn(5)).isZero()).toBe(true);
    expect(bn(3).sub(bn(8)).toNumber()).toBeCloseTo(-5);
  });

  it('násobí i mimo rozsah double', () => {
    expect(bn(2).mul(bn(3)).toNumber()).toBeCloseTo(6);
    const huge = BigNumber.fromMantissaExp(5, 400).mul(BigNumber.fromMantissaExp(2, 400));
    expect(huge.e).toBe(801); // 5e400 * 2e400 = 1e801
    expect(huge.m).toBeCloseTo(1, 5);
  });

  it('dělí a hlídá dělení nulou', () => {
    expect(bn(6).div(bn(3)).toNumber()).toBeCloseTo(2);
    expect(() => bn(1).div(bn(0))).toThrow();
  });

  it('umocňuje (i obří exponenty)', () => {
    expect(bn(2).pow(10).toNumber()).toBeCloseTo(1024);
    expect(bn(1.15).pow(9).toNumber()).toBeCloseTo(3.5179, 3);
    const big = bn(10).pow(100);
    expect(big.e).toBe(100);
    expect(big.m).toBeCloseTo(1, 5);
    expect(bn(2).pow(0).eq(BigNumber.ONE)).toBe(true);
  });

  it('záporný základ s celočíselným exponentem', () => {
    expect(bn(-2).pow(2).toNumber()).toBeCloseTo(4);
    expect(bn(-2).pow(3).toNumber()).toBeCloseTo(-8);
  });
});

describe('BigNumber — porovnání', () => {
  it('porovnává magnitudu', () => {
    expect(bn(1e50).gt(bn(1e49))).toBe(true);
    expect(bn(1e49).lt(bn(1e50))).toBe(true);
    expect(bn(100).eq(bn(100))).toBe(true);
    expect(bn(100).gte(bn(100))).toBe(true);
  });

  it('porovnává znaménka', () => {
    expect(bn(-5).lt(bn(3))).toBe(true);
    expect(bn(-5).lt(bn(-3))).toBe(true);
    expect(bn(-3).gt(bn(-5))).toBe(true);
    expect(bn(0).gt(bn(-1))).toBe(true);
  });

  it('max/min', () => {
    expect(BigNumber.max(bn(3), bn(7)).toNumber()).toBe(7);
    expect(BigNumber.min(bn(3), bn(7)).toNumber()).toBe(3);
  });
});

describe('BigNumber — formátování', () => {
  it('formátuje malá čísla', () => {
    expect(bn(0).format()).toBe('0');
    expect(bn(100).format()).toBe('100');
    expect(bn(12.5).format()).toBe('12.5');
  });

  it('formátuje s příponami a vědecky', () => {
    expect(bn(1000).format()).toBe('1.00K');
    expect(bn(1234567).format()).toBe('1.23M');
    expect(bn(-1500).format()).toBe('-1.50K');
    expect(BigNumber.fromMantissaExp(7.89, 42).format()).toBe('7.89e42');
  });
});

describe('BigNumber — serializace', () => {
  it('round-trip', () => {
    const original = BigNumber.fromMantissaExp(3.14, 159);
    const restored = BigNumber.deserialize(original.serialize());
    expect(restored.eq(original)).toBe(true);
  });
});
