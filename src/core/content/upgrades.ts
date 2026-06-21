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
  | 'autoLikeRate' // bot: lajků/s (lajkuje načtené posty)
  | 'autoSwipeRate' // bot: swipů/s (auto-scroller – swipe po prodlevě)
  | 'autoCommentRate' // bot: komentářů/s (auto-commenter)
  | 'bubbleUnlock' // odemkne minihru s bublinami
  | 'bubbleValueMult' // násobí hodnotu bublin
  | 'bubbleRate' // zvyšuje frekvenci bublin
  | 'virality' // zvyšuje šanci na vzácné posty (Hidden Gems)
  | 'consumptionMultiplier' // násobí spotřebu sítě (downside Brain Rot upgradů)
  // ── Vlna 2 (pre-prestige): nové typy efektů, ne jen procenta ──
  | 'bufferSpeedMult' // násobí rychlost bufferingu (rychlejší načítání postů)
  | 'attentionMaxMult' // násobí maximum Pozornosti (M1)
  | 'attentionRegenMult' // násobí regeneraci Pozornosti
  | 'streakCapBonus' // zvyšuje strop streaku (aditivně)
  | 'critChance' // šance na jackpot swipe (aditivně, 0–1)
  | 'critMult' // přidává k násobiči jackpotu (aditivně)
  | 'offlineEfficiencyBonus' // přidává k efektivitě offline těžby (aditivně, 0–1)
  | 'offlineCapHours' // prodlužuje strop offline těžby (hodiny, aditivně)
  | 'bandwidthMult'; // násobí celkovou kapacitu sítě

/** Podmínka odemčení upgradu (postupné odemykání stromu, T6/#4). */
export interface UpgradeUnlock {
  /** Práh kumulovaného (vydělaného) Dopaminu – viz Game.totalDopamineEarned. */
  readonly dopamine?: number;
  /** Prerekvizitní upgrade (musí být vlastněn aspoň na `requiresLevel`). */
  readonly requires?: string;
  /** Minimální úroveň prerekvizity (default 1). */
  readonly requiresLevel?: number;
}

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
  /** Volitelný vedlejší efekt (typicky downside, např. +spotřeba sítě). */
  readonly sideEffect?: {
    readonly type: UpgradeEffectType;
    readonly value: number;
  };
  /** Volitelná podmínka odemčení (jinak je upgrade dostupný od začátku). */
  readonly unlock?: UpgradeUnlock;
}

export const UPGRADES: readonly UpgradeDef[] = [
  // ── Early game (levné, hned je co kupovat – záměrně bez zámků) ──
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
    description: 'Saves your eyes for even more scrolling. +10% Dopamine, switches to dark theme.',
    icon: '🌙',
    cost: { currency: 'DOP', base: 25, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.1 },
  },
  {
    id: 'dopamine_detector',
    name: 'Dopamine Detector',
    description: 'Unlocks the dopamine bubble minigame. Tap bubbles for bonus Dopamine.',
    icon: '🫧',
    cost: { currency: 'DOP', base: 30, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'bubbleUnlock', value: 1 },
  },
  {
    id: 'finger_warmup',
    name: 'Finger Warm-Up',
    description: 'A humble auto-tapper: auto-swipes +0.2 posts/s. Uses bandwidth.',
    icon: '🤏',
    cost: { currency: 'DOP', base: 35, multiplier: 1.3 },
    effect: { type: 'autoSwipeRate', value: 0.2 },
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
    unlock: { dopamine: 150 },
  },
  {
    id: 'auto_liker',
    name: 'Auto-Liker Bot',
    description: 'Auto-likes ready posts: +1 like/s per level. Buy more to keep up with more phones.',
    icon: '👆',
    cost: { currency: 'DOP', base: 150, multiplier: 1.25 },
    effect: { type: 'autoLikeRate', value: 1 },
  },
  {
    id: 'auto_scroller',
    name: 'Auto-Scroller Bot',
    description: 'Auto-swipes ready posts: +0.5 swipes/s per level — mines even offline. Uses bandwidth.',
    icon: '🤖',
    cost: { currency: 'DOP', base: 200, multiplier: 1.25 },
    effect: { type: 'autoSwipeRate', value: 0.5 },
  },
  {
    id: 'auto_commenter',
    name: 'Auto-Commenter Bot',
    description: 'Auto-posts comments: +0.3 comments/s per level. Generates Comments & reactions.',
    icon: '🗨️',
    cost: { currency: 'DOP', base: 350, multiplier: 1.3 },
    effect: { type: 'autoCommentRate', value: 0.3 },
  },
  {
    id: 'bigger_hits',
    name: 'Bigger Hits',
    description: '+25% bubble value per level. (Requires Dopamine Detector.)',
    icon: '💧',
    cost: { currency: 'DOP', base: 120, multiplier: 1.4 },
    effect: { type: 'bubbleValueMult', value: 1.25 },
    unlock: { requires: 'dopamine_detector' },
  },
  {
    id: 'faster_bubbles',
    name: 'Faster Bubbles',
    description: '+20% bubble frequency per level. (Requires Dopamine Detector.)',
    icon: '⏩',
    cost: { currency: 'DOP', base: 200, multiplier: 1.4 },
    effect: { type: 'bubbleRate', value: 1.2 },
    unlock: { requires: 'dopamine_detector' },
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
    unlock: { dopamine: 250 },
  },
  {
    id: 'ring_light',
    name: 'Ring Light',
    description: 'Now you are content too. +20% Dopamine.',
    icon: '💡',
    cost: { currency: 'DOP', base: 400, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.2 },
    unlock: { dopamine: 400 },
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
    unlock: { dopamine: 700 },
  },
  {
    id: 'adsl',
    name: 'Old ADSL Modem',
    description: '+10 Mbps of bandwidth.',
    icon: '☎️',
    cost: { currency: 'DOP', base: 800, multiplier: 1.3 },
    effect: { type: 'bandwidth', value: 10 },
    unlock: { dopamine: 700 },
  },
  {
    id: 'go_viral',
    name: 'Go Viral',
    description: '+25% Dopamine per level. Fifteen minutes, every time.',
    icon: '📈',
    cost: { currency: 'DOP', base: 1000, multiplier: 1.5 },
    effect: { type: 'dopamineMultiplier', value: 1.25 },
    unlock: { dopamine: 1200 },
  },
  {
    id: 'third_eye',
    name: 'Third Eye',
    description: 'See the hidden gems. +0.5 virality per level (more Rare/Epic/Legendary posts).',
    icon: '👁️',
    cost: { currency: 'DOP', base: 400, multiplier: 1.45 },
    effect: { type: 'virality', value: 0.5 },
  },
  {
    id: 'verified_badge',
    name: 'Verified Badge',
    description: 'Pay to feel important. +50% Dopamine.',
    icon: '✔️',
    cost: { currency: 'DOP', base: 1500, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.5 },
    unlock: { dopamine: 2500 },
  },
  {
    id: 'kitten_boost',
    name: 'Kitten Video Boost',
    description: 'Guaranteed cuteness. ×2 Dopamine.',
    icon: '🐱',
    cost: { currency: 'DOP', base: 2500, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 2 },
    unlock: { dopamine: 5000 },
  },
  {
    id: 'algorithm_whisperer',
    name: 'Algorithm Whisperer',
    description: 'You speak its language now. +40% Dopamine.',
    icon: '🧙',
    cost: { currency: 'DOP', base: 3000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.4 },
    unlock: { dopamine: 8000 },
  },
  {
    id: 'fake_news',
    name: 'Fake News Syndicate',
    description: 'Conspiracy sells. +1.5 virality (much higher Hidden Gem chance).',
    icon: '📰',
    cost: { currency: 'DOP', base: 5000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'virality', value: 1.5 },
  },
  {
    id: 'fiber',
    name: 'Fiber Optics',
    description: '+100 Mbps of bandwidth.',
    icon: '🛜',
    cost: { currency: 'DOP', base: 10000, multiplier: 1.4 },
    effect: { type: 'bandwidth', value: 100 },
  },

  // ── Vlna 2 — nové typy efektů (pre-prestige „wow" upgrady, postupně odemykané) ──
  {
    id: 'gigabit_thumbs',
    name: 'Gigabit Thumbs',
    description: '+15% buffering speed per level. Posts load faster — feed never rests.',
    icon: '⚡',
    cost: { currency: 'DOP', base: 500, multiplier: 1.4 },
    effect: { type: 'bufferSpeedMult', value: 1.15 },
    unlock: { dopamine: 350 },
  },
  {
    id: 'predictive_preload',
    name: 'Predictive Preload',
    description: 'The app loads the next outrage before you ask. +25% buffering speed per level.',
    icon: '🔮',
    cost: { currency: 'DOP', base: 9000, multiplier: 1.5 },
    effect: { type: 'bufferSpeedMult', value: 1.25 },
    unlock: { dopamine: 12000, requires: 'gigabit_thumbs', requiresLevel: 3 },
  },
  {
    id: 'meditation_app',
    name: 'Meditation App (Premium)',
    description: 'Ironically used to scroll longer. +50% Attention regen per level.',
    icon: '🧘',
    cost: { currency: 'DOP', base: 600, multiplier: 1.45 },
    effect: { type: 'attentionRegenMult', value: 1.5 },
    unlock: { dopamine: 500 },
  },
  {
    id: 'adderall',
    name: 'Off-Brand Adderall',
    description: "+40% max Attention per level. Don't ask where it's from.",
    icon: '💊',
    cost: { currency: 'DOP', base: 1200, multiplier: 1.5 },
    maxLevel: 8,
    effect: { type: 'attentionMaxMult', value: 1.4 },
    unlock: { dopamine: 900 },
  },
  {
    id: 'doomscroll_stamina',
    name: 'Doomscroll Stamina',
    description: '+0.5 to the streak ceiling per level. Longer combos, deeper hole.',
    icon: '🥵',
    cost: { currency: 'DOP', base: 2000, multiplier: 1.6 },
    maxLevel: 6,
    effect: { type: 'streakCapBonus', value: 0.5 },
    unlock: { dopamine: 1800 },
  },
  {
    id: 'jackpot_algo',
    name: 'Jackpot Algorithm',
    description: '+5% chance per level that a swipe is a JACKPOT (×5+ Dopamine). Slot-machine brain.',
    icon: '🎰',
    cost: { currency: 'DOP', base: 3000, multiplier: 1.55 },
    maxLevel: 12,
    effect: { type: 'critChance', value: 0.05 },
    unlock: { dopamine: 2500 },
  },
  {
    id: 'mega_jackpot',
    name: 'Mega-Jackpot Mode',
    description: '+3 to the jackpot payout multiplier per level. When it hits, it HITS.',
    icon: '💰',
    cost: { currency: 'DOP', base: 18000, multiplier: 1.6 },
    maxLevel: 8,
    effect: { type: 'critMult', value: 3 },
    unlock: { dopamine: 20000, requires: 'jackpot_algo', requiresLevel: 2 },
  },
  {
    id: 'time_dilation',
    name: 'Time-Dilation Field',
    description: '+10% offline mining efficiency per level (your bots try harder while away).',
    icon: '⏳',
    cost: { currency: 'DOP', base: 5000, multiplier: 1.5 },
    maxLevel: 5,
    effect: { type: 'offlineEfficiencyBonus', value: 0.1 },
    unlock: { dopamine: 5000 },
  },
  {
    id: 'cloud_backup',
    name: 'Cloud Backup',
    description: '+2h to the offline mining cap per level. Scroll even in your sleep.',
    icon: '☁️',
    cost: { currency: 'DOP', base: 7000, multiplier: 1.5 },
    maxLevel: 6,
    effect: { type: 'offlineCapHours', value: 2 },
    unlock: { dopamine: 6000 },
  },
  {
    id: 'data_center',
    name: 'Personal Data Center',
    description: '×2 total bandwidth capacity per level. Industrial-scale doomscrolling.',
    icon: '🏢',
    cost: { currency: 'DOP', base: 25000, multiplier: 1.7 },
    maxLevel: 4,
    effect: { type: 'bandwidthMult', value: 2 },
    unlock: { dopamine: 30000, requires: 'fiber' },
  },

  // ── Brain Rot větev (za 🧟 BR z TokTik+) — velký boost, ale poškozuje UI (chaos) ──
  {
    id: 'rage_bait',
    name: 'Rage-Bait Generator',
    description: 'Turns every caption into provocative nonsense. +60% Dopamine per level.',
    icon: '😡',
    cost: { currency: 'BR', base: 20, multiplier: 1.5 },
    effect: { type: 'dopamineMultiplier', value: 1.6 },
  },
  {
    id: 'hate_bots',
    name: 'Hate-Speech Bots',
    description: 'Aggressive bots smash every interaction. +3 auto-likes/s per level.',
    icon: '💢',
    cost: { currency: 'BR', base: 40, multiplier: 1.4 },
    effect: { type: 'autoLikeRate', value: 3 },
    unlock: { requires: 'rage_bait' },
  },
  {
    id: 'ai_slop',
    name: 'AI Slop Factory',
    description: 'Cheap AI garbage floods the feed. ×4 Dopamine, but +50% bandwidth use.',
    icon: '🗑️',
    cost: { currency: 'BR', base: 150, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 4 },
    sideEffect: { type: 'consumptionMultiplier', value: 1.5 },
  },
  {
    id: 'neural_implant',
    name: 'Neural Implant (Beta)',
    description: 'Brain-to-feed interface. ×2 Attention regen per level. Chaos intensifies.',
    icon: '🧠',
    cost: { currency: 'BR', base: 80, multiplier: 1.5 },
    maxLevel: 5,
    effect: { type: 'attentionRegenMult', value: 2 },
    unlock: { requires: 'ai_slop' },
  },
  {
    id: 'skibidi',
    name: 'Skibidi Generator',
    description: 'Incomprehensible Gen-Alpha brainrot. ×2.5 Dopamine. Brain age −5 years.',
    icon: '🚽',
    cost: { currency: 'BR', base: 300, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 2.5 },
    unlock: { requires: 'ai_slop' },
  },
];
