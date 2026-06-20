import { describe, it, expect } from 'vitest';
import { Rng } from './Rng';

describe('Rng — determinismus', () => {
  it('stejný seed dává stejnou sekvenci', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('různý seed dává jinou sekvenci', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('serializace zachová stav', () => {
    const a = new Rng(42);
    a.next();
    a.next();
    const b = Rng.deserialize(a.serialize());
    expect(b.next()).toBe(a.next());
  });
});

describe('Rng — rozsahy', () => {
  it('next je v [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int je v [min,max)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.int(5, 10);
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThan(10);
      expect(Number.isInteger(x)).toBe(true);
    }
  });
});

describe('Rng — výběr', () => {
  it('pick vrací prvek z pole', () => {
    const r = new Rng(7);
    const arr = ['a', 'b', 'c'];
    expect(arr).toContain(r.pick(arr));
  });

  it('sampleDistinct vrací různé prvky', () => {
    const r = new Rng(7);
    const arr = [1, 2, 3, 4, 5];
    const sample = r.sampleDistinct(arr, 3);
    expect(sample).toHaveLength(3);
    expect(new Set(sample).size).toBe(3);
  });

  it('sampleDistinct nepřekročí velikost pole', () => {
    const r = new Rng(7);
    expect(r.sampleDistinct([1, 2], 5)).toHaveLength(2);
  });
});

describe('Rng — gaussian', () => {
  it('průměr je přibližně mean', () => {
    const r = new Rng(7);
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) sum += r.gaussian(10, 2);
    expect(sum / N).toBeCloseTo(10, 0);
  });
});
