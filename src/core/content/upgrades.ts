import type { CurrencyId } from '../economy/currencies';

/**
 * Definice upgradů (data-driven). Viz docs/GDD-03-Content.md §3.
 *
 * Efekt je popsán deklarativně (typ + hodnota); Game ho interpretuje — žádné closury
 * v datech, takže lze později snadno přesunout do JSON (balancování, Fáze 9).
 */
export type UpgradeEffectType =
  | 'addPhone' // přidá telefon(y)
  | 'dopamineMultiplier' // násobí globální produkci Dopaminu
  | 'bandwidth'; // zvýší kapacitu sítě (Mbps)

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly cost: {
    readonly currency: CurrencyId;
    readonly base: number;
    readonly multiplier: number; // exponenciální růst ceny (1 = jednorázová fixní cena)
  };
  /** Maximální úroveň (undefined = neomezeně). */
  readonly maxLevel?: number;
  readonly effect: {
    readonly type: UpgradeEffectType;
    readonly value: number;
  };
}

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'secondhand_phone',
    name: 'Secondhand Smartphone',
    description: 'Opens another feed to scroll on.',
    icon: '📱',
    cost: { currency: 'DOP', base: 100, multiplier: 1.15 },
    effect: { type: 'addPhone', value: 1 },
  },
  {
    id: 'clickbait',
    name: 'Clickbait Optimizer',
    description: '+10% Dopamine per level.',
    icon: '🎣',
    cost: { currency: 'DOP', base: 50, multiplier: 1.2 },
    effect: { type: 'dopamineMultiplier', value: 1.1 },
  },
  {
    id: 'echo_chamber',
    name: 'Echo Chamber',
    description: 'Only shows what you agree with. +50% Dopamine.',
    icon: '🫧',
    cost: { currency: 'DOP', base: 500, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.5 },
  },
  {
    id: 'kitten_boost',
    name: 'Kitten Video Boost',
    description: 'Guaranteed cuteness. ×2 Dopamine.',
    icon: '🐱',
    cost: { currency: 'DOP', base: 2500, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 2 },
  },
  {
    id: 'stolen_wifi',
    name: "Stolen Neighbor's Wi-Fi",
    description: '+2 Mbps of bandwidth.',
    icon: '📡',
    cost: { currency: 'DOP', base: 80, multiplier: 1.3 },
    effect: { type: 'bandwidth', value: 2 },
  },
  {
    id: 'adsl',
    name: 'Old ADSL Modem',
    description: '+10 Mbps of bandwidth.',
    icon: '☎️',
    cost: { currency: 'DOP', base: 800, multiplier: 1.3 },
    effect: { type: 'bandwidth', value: 10 },
  },
  {
    id: 'fiber',
    name: 'Fiber Optics',
    description: '+100 Mbps of bandwidth.',
    icon: '🛜',
    cost: { currency: 'DOP', base: 10000, multiplier: 1.4 },
    effect: { type: 'bandwidth', value: 100 },
  },
];
