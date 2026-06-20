import type { CurrencyId } from '../economy/currencies';

/**
 * Definice upgradů (data-driven). Viz docs/GDD-03-Content.md §3.
 *
 * Efekt je popsán deklarativně (typ + hodnota); Game ho interpretuje — žádné closury
 * v datech, takže lze později snadno přesunout do JSON (balancování, Fáze 9).
 * Pořadí v poli = pořadí v UI (řazeno zhruba od nejlevnějšího).
 */
export type UpgradeEffectType =
  | 'addPhone' // přidá telefon(y)
  | 'dopamineMultiplier' // násobí globální produkci Dopaminu
  | 'bandwidth' // zvýší kapacitu sítě (Mbps)
  | 'passiveDopamine' // bot: pasivní Dopamin/s (těží i offline)
  | 'passiveLikes'; // bot: pasivní Likes/s

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
  // ── Early game (levné, hned je co kupovat) ──
  {
    id: 'energy_drink',
    name: 'Energy Drink',
    description: '+15% Dopamine per level. Sleep is for the weak.',
    icon: '🥤',
    cost: { currency: 'DOP', base: 10, multiplier: 1.35 },
    effect: { type: 'dopamineMultiplier', value: 1.15 },
  },
  {
    id: 'dark_mode',
    name: 'Dark Mode',
    description: 'Saves your eyes for even more scrolling. +10% Dopamine.',
    icon: '🌙',
    cost: { currency: 'DOP', base: 25, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.1 },
  },
  {
    id: 'finger_warmup',
    name: 'Finger Warm-Up',
    description: '+0.1 Dopamine/s. A humble auto-tapper.',
    icon: '🤏',
    cost: { currency: 'DOP', base: 35, multiplier: 1.3 },
    effect: { type: 'passiveDopamine', value: 0.1 },
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
    id: 'push_notifications',
    name: 'Push Notifications',
    description: 'You will never know peace again. +20% Dopamine.',
    icon: '🔔',
    cost: { currency: 'DOP', base: 50, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.2 },
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
    id: 'double_tap',
    name: 'Double-Tap Combo',
    description: '+15% Dopamine per level. Twice the heart, twice the void.',
    icon: '✌️',
    cost: { currency: 'DOP', base: 90, multiplier: 1.3 },
    effect: { type: 'dopamineMultiplier', value: 1.15 },
  },
  {
    id: 'secondhand_phone',
    name: 'Secondhand Smartphone',
    description: 'Opens another feed to scroll on.',
    icon: '📱',
    cost: { currency: 'DOP', base: 100, multiplier: 1.15 },
    effect: { type: 'addPhone', value: 1 },
  },
  {
    id: 'infinite_scroll',
    name: 'Infinite Scroll',
    description: 'The bottom is a myth. +25% Dopamine.',
    icon: '♾️',
    cost: { currency: 'DOP', base: 150, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.25 },
  },
  {
    id: 'auto_liker',
    name: 'Auto-Liker Bot',
    description: '+1 Like/s automatically. Uses bandwidth.',
    icon: '👆',
    cost: { currency: 'DOP', base: 150, multiplier: 1.25 },
    effect: { type: 'passiveLikes', value: 1 },
  },
  {
    id: 'auto_scroller',
    name: 'Auto-Scroller Bot',
    description: '+0.5 Dopamine/s automatically — mines even offline. Uses bandwidth.',
    icon: '🤖',
    cost: { currency: 'DOP', base: 200, multiplier: 1.25 },
    effect: { type: 'passiveDopamine', value: 0.5 },
  },

  // ── Mid game ──
  {
    id: 'for_you_page',
    name: 'For You Page',
    description: 'It knows you better than you do. +30% Dopamine.',
    icon: '🎯',
    cost: { currency: 'DOP', base: 300, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.3 },
  },
  {
    id: 'ring_light',
    name: 'Ring Light',
    description: 'Now you are content too. +20% Dopamine.',
    icon: '💡',
    cost: { currency: 'DOP', base: 400, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.2 },
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
    id: 'autoplay',
    name: 'Autoplay Everything',
    description: 'Consent is optional. +35% Dopamine.',
    icon: '▶️',
    cost: { currency: 'DOP', base: 600, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.35 },
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
    id: 'go_viral',
    name: 'Go Viral',
    description: '+25% Dopamine per level. Fifteen minutes, every time.',
    icon: '📈',
    cost: { currency: 'DOP', base: 1000, multiplier: 1.5 },
    effect: { type: 'dopamineMultiplier', value: 1.25 },
  },
  {
    id: 'verified_badge',
    name: 'Verified Badge',
    description: 'Pay to feel important. +50% Dopamine.',
    icon: '✔️',
    cost: { currency: 'DOP', base: 1500, multiplier: 1 },
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
    id: 'algorithm_whisperer',
    name: 'Algorithm Whisperer',
    description: 'You speak its language now. +40% Dopamine.',
    icon: '🧙',
    cost: { currency: 'DOP', base: 3000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.4 },
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
