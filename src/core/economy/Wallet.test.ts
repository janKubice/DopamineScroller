import { describe, it, expect } from 'vitest';
import { Wallet } from './Wallet';
import { BigNumber } from '../math/BigNumber';

const n = BigNumber.of;

describe('Wallet', () => {
  it('neznámá měna má nulový zůstatek', () => {
    const w = new Wallet();
    expect(w.get('DOP').isZero()).toBe(true);
  });

  it('add připisuje', () => {
    const w = new Wallet();
    w.add('DOP', n(100));
    w.add('DOP', n(50));
    expect(w.get('DOP').toNumber()).toBe(150);
  });

  it('canAfford', () => {
    const w = new Wallet();
    w.add('DOP', n(100));
    expect(w.canAfford('DOP', n(100))).toBe(true);
    expect(w.canAfford('DOP', n(101))).toBe(false);
  });

  it('spend uspěje a odečte', () => {
    const w = new Wallet();
    w.add('DOP', n(100));
    expect(w.spend('DOP', n(30))).toBe(true);
    expect(w.get('DOP').toNumber()).toBe(70);
  });

  it('spend selže při nedostatku a nechá zůstatek', () => {
    const w = new Wallet();
    w.add('DOP', n(20));
    expect(w.spend('DOP', n(30))).toBe(false);
    expect(w.get('DOP').toNumber()).toBe(20);
  });

  it('serializace round-trip', () => {
    const w = new Wallet();
    w.add('DOP', n(1234));
    w.add('BR', n(56));
    const restored = Wallet.deserialize(w.serialize());
    expect(restored.get('DOP').eq(n(1234))).toBe(true);
    expect(restored.get('BR').eq(n(56))).toBe(true);
  });
});
