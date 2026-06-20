import { describe, it, expect } from 'vitest';
import { UpgradeStore } from './UpgradeStore';
import { BigNumber } from '../math/BigNumber';
import type { UpgradeDef } from '../content/upgrades';

const defs: UpgradeDef[] = [
  {
    id: 'phone',
    name: 'Phone',
    description: '',
    icon: '📱',
    cost: { currency: 'DOP', base: 100, multiplier: 1.15 },
    effect: { type: 'addPhone', value: 1 },
  },
  {
    id: 'once',
    name: 'Once',
    description: '',
    icon: '🫧',
    cost: { currency: 'DOP', base: 500, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.5 },
  },
];

const n = BigNumber.of;

describe('UpgradeStore — ceny', () => {
  it('nextCost roste po úrovních', () => {
    const store = new UpgradeStore(defs);
    expect(store.level('phone')).toBe(0);
    expect(store.nextCost('phone')!.toNumber()).toBeCloseTo(100, 5);
    store.incrementLevel('phone');
    expect(store.nextCost('phone')!.toNumber()).toBeCloseTo(115, 5);
  });

  it('bulkCost je součet řady', () => {
    const store = new UpgradeStore(defs);
    expect(store.bulkCost('phone', 2).toNumber()).toBeCloseTo(215, 4);
  });

  it('maxAffordable respektuje rozpočet a úroveň', () => {
    const store = new UpgradeStore(defs);
    expect(store.maxAffordable('phone', n(215))).toBe(2);
    expect(store.maxAffordable('phone', n(99))).toBe(0);
  });
});

describe('UpgradeStore — maxLevel', () => {
  it('omezuje počet úrovní', () => {
    const store = new UpgradeStore(defs);
    expect(store.remaining('once')).toBe(1);
    expect(store.isMaxed('once')).toBe(false);
    store.incrementLevel('once');
    expect(store.isMaxed('once')).toBe(true);
    expect(store.nextCost('once')).toBeNull();
  });

  it('neomezený upgrade má Infinity remaining', () => {
    const store = new UpgradeStore(defs);
    expect(store.remaining('phone')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('UpgradeStore — serializace', () => {
  it('round-trip úrovní', () => {
    const store = new UpgradeStore(defs);
    store.incrementLevel('phone', 3);
    const restored = new UpgradeStore(defs);
    restored.loadLevels(store.serialize());
    expect(restored.level('phone')).toBe(3);
  });
});
