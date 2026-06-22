import type { UpgradeDef } from './upgrades';

/**
 * Clarity „Zen" upgrady (prestige meta-progrese). Viz docs/GDD-03-Content.md §5.
 *
 * Kupují se za 🧘 **Clarity** (měna z prestige – Dopamine Overdose) a na rozdíl od běžných
 * upgradů **přežijí reset** (drží se v samostatném `clarity` store, který `prestige()` nemaže).
 * Dávají trvalé bonusy čtené stejnými gettery jako běžné efekty (přes druhý store).
 *
 * Znovupoužívá typ `UpgradeDef` (měna 'CLA') i existující `UpgradeEffectType`, takže žádná
 * nová mašinérie není potřeba – jen druhý store a pár getterů v `Game`.
 */
export const CLARITY_UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'digital_monk',
    name: 'Digital Monk',
    description: 'Inner peace, monetized. Permanent +10% Dopamine per level.',
    icon: '🧘',
    cost: { currency: 'CLA', base: 1, multiplier: 1.6 },
    effect: { type: 'dopamineMultiplier', value: 1.1 },
  },
  {
    id: 'cleared_cache',
    name: 'Cleared Cache',
    description: 'A clean mind loads faster. Permanent +12% buffering speed per level.',
    icon: '🧹',
    cost: { currency: 'CLA', base: 1, multiplier: 1.6 },
    effect: { type: 'bufferSpeedMult', value: 1.12 },
  },
  {
    id: 'inner_eye',
    name: 'Inner Eye',
    description: 'See through the algorithm. Permanent +0.5 virality per level.',
    icon: '👁️‍🗨️',
    cost: { currency: 'CLA', base: 2, multiplier: 1.7 },
    effect: { type: 'virality', value: 0.5 },
  },
  {
    id: 'lossless_mind',
    name: 'Lossless Compression',
    description: 'Waste nothing. Permanent ×1.2 total bandwidth per level.',
    icon: '🗜️',
    cost: { currency: 'CLA', base: 2, multiplier: 1.7 },
    effect: { type: 'bandwidthMult', value: 1.2 },
  },
  {
    id: 'astral_projection',
    name: 'Astral Projection',
    description: 'Mine while you meditate. Permanent +10% offline efficiency per level.',
    icon: '☯️',
    cost: { currency: 'CLA', base: 3, multiplier: 1.8 },
    maxLevel: 5,
    effect: { type: 'offlineEfficiencyBonus', value: 0.1 },
  },
  {
    id: 'flow_state',
    name: 'Flow State',
    description: 'Ride the wave longer. Permanent +0.5 streak ceiling per level.',
    icon: '🌊',
    cost: { currency: 'CLA', base: 4, multiplier: 1.8 },
    maxLevel: 8,
    effect: { type: 'streakCapBonus', value: 0.5 },
  },
];
