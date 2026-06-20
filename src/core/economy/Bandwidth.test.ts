import { describe, it, expect } from 'vitest';
import { bandwidthLoad, bufferScale, OVERLOAD_EXPONENT } from './Bandwidth';

describe('Bandwidth — load', () => {
  it('počítá zatížení', () => {
    expect(bandwidthLoad(2, 4)).toBe(0.5);
    expect(bandwidthLoad(4, 4)).toBe(1);
    expect(bandwidthLoad(8, 4)).toBe(2);
  });

  it('nulová kapacita = nekonečné zatížení (pokud se spotřebovává)', () => {
    expect(bandwidthLoad(1, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(bandwidthLoad(0, 0)).toBe(0);
  });
});

describe('Bandwidth — bufferScale', () => {
  it('do kapacity je plná rychlost', () => {
    expect(bufferScale(2, 4)).toBe(1);
    expect(bufferScale(4, 4)).toBe(1);
  });

  it('nad kapacitou exponenciálně zpomaluje', () => {
    // load 2 -> scale = 2^-EXP
    expect(bufferScale(8, 4)).toBeCloseTo(Math.pow(2, -OVERLOAD_EXPONENT), 6);
    expect(bufferScale(8, 4)).toBeLessThan(1);
    // vyšší přetížení = ještě pomalejší
    expect(bufferScale(16, 4)).toBeLessThan(bufferScale(8, 4));
  });

  it('bez kapacity je nula (zamrznuto)', () => {
    expect(bufferScale(1, 0)).toBe(0);
  });
});
