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

/** Kategorie pro UI (vyjížděcí panel #9). Odvozená z efektu/měny – viz `categoryOf`. */
export type UpgradeCategory = 'hardware' | 'algorithms' | 'network' | 'bots' | 'cosmetics' | 'brainrot';

/** Pořadí a popisky kategorií pro panel upgradů. */
export const UPGRADE_CATEGORIES: ReadonlyArray<{ id: UpgradeCategory; label: string; icon: string }> = [
  { id: 'hardware', label: 'Hardware', icon: '📱' },
  { id: 'algorithms', label: 'Algorithms', icon: '🧠' },
  { id: 'network', label: 'Network', icon: '📶' },
  { id: 'bots', label: 'Bots', icon: '🤖' },
  { id: 'cosmetics', label: 'Cosmetics', icon: '🎨' },
  { id: 'brainrot', label: 'Brain Rot', icon: '🧟' },
];

/** Zařadí upgrade do kategorie pro UI (explicitní `category`, jinak odvozeno z efektu/měny). */
export function categoryOf(def: UpgradeDef): UpgradeCategory {
  if (def.category) return def.category;
  if (def.cost.currency === 'BR') return 'brainrot';
  switch (def.effect.type) {
    case 'addPhone':
    case 'bufferSpeedMult': // rychlost načítání telefonu = hardware
      return 'hardware';
    case 'bandwidth':
    case 'bandwidthMult':
      return 'network';
    case 'autoLikeRate':
    case 'autoSwipeRate':
    case 'autoCommentRate':
      return 'bots';
    default:
      return 'algorithms';
  }
}

/** Metadata efektu pro lidsky čitelný „aktuální bonus" na kartě upgradu (#B). */
const EFFECT_META: Record<
  UpgradeEffectType,
  { kind: 'mul' | 'add' | 'flag'; unit: string; percent?: boolean }
> = {
  dopamineMultiplier: { kind: 'mul', unit: 'Dopamine' },
  addPhone: { kind: 'add', unit: 'phones' },
  bandwidth: { kind: 'add', unit: 'Mbps' },
  bandwidthMult: { kind: 'mul', unit: 'bandwidth' },
  autoLikeRate: { kind: 'add', unit: 'likes/s' },
  autoSwipeRate: { kind: 'add', unit: 'swipes/s' },
  autoCommentRate: { kind: 'add', unit: 'comments/s' },
  bubbleUnlock: { kind: 'flag', unit: 'minigame' },
  bubbleValueMult: { kind: 'mul', unit: 'bubble value' },
  bubbleRate: { kind: 'mul', unit: 'bubble rate' },
  virality: { kind: 'add', unit: 'virality' },
  consumptionMultiplier: { kind: 'mul', unit: 'bandwidth use' },
  bufferSpeedMult: { kind: 'mul', unit: 'load speed' },
  attentionMaxMult: { kind: 'mul', unit: 'max Attention' },
  attentionRegenMult: { kind: 'mul', unit: 'Attention regen' },
  streakCapBonus: { kind: 'add', unit: 'streak cap' },
  critChance: { kind: 'add', unit: 'jackpot chance', percent: true },
  critMult: { kind: 'add', unit: 'jackpot ×' },
  offlineEfficiencyBonus: { kind: 'add', unit: 'offline mining', percent: true },
  offlineCapHours: { kind: 'add', unit: 'h offline cap' },
};

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 2 : 1);
}

/** Lidsky čitelný souhrn AKTUÁLNÍHO bonusu upgradu na dané úrovni (prázdný řetězec = bez úrovní). */
export function effectTotalLabel(def: UpgradeDef, level: number): string {
  if (level <= 0) return '';
  const meta = EFFECT_META[def.effect.type];
  if (!meta) return '';
  if (meta.kind === 'flag') return 'active';
  if (meta.kind === 'mul') {
    return `×${Math.pow(def.effect.value, level).toFixed(2)} ${meta.unit}`.trim();
  }
  const total = def.effect.value * level;
  if (meta.percent) return `+${Math.round(total * 100)}% ${meta.unit}`.trim();
  return `+${trimNum(total)} ${meta.unit}`.trim();
}

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
  /** Volitelné vynucení kategorie pro UI (jinak odvozeno z efektu/měny). */
  readonly category?: UpgradeCategory;
}

/** Sentinel prahu odemčení: kosmetika je POUZE odměna za achievement (normálně nedosažitelná/nekoupitelná). */
export const ACHIEVEMENT_ONLY = Number.MAX_SAFE_INTEGER;

export const UPGRADES: readonly UpgradeDef[] = [
  // ── Early game (levné, hned je co kupovat – záměrně bez zámků) ──
  {
    id: 'energy_drink',
    name: 'Energy Drink',
    description: '+10% Dopamine per level. Sleep is for the weak.',
    icon: '🥤',
    cost: { currency: 'DOP', base: 10, multiplier: 1.55 },
    maxLevel: 30,
    effect: { type: 'dopamineMultiplier', value: 1.1 },
  },
  {
    id: 'dark_mode',
    name: 'Dark Mode',
    description: 'Saves your eyes for even more scrolling. +10% Dopamine, switches to dark theme.',
    icon: '🌙',
    cost: { currency: 'DOP', base: 40, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.1 },
    category: 'cosmetics',
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
    cost: { currency: 'DOP', base: 35, multiplier: 1.4 },
    effect: { type: 'autoSwipeRate', value: 0.2 },
  },
  {
    id: 'clickbait',
    name: 'Clickbait Optimizer',
    description: '+6% Dopamine per level.',
    icon: '🎣',
    cost: { currency: 'DOP', base: 50, multiplier: 1.4 },
    maxLevel: 30,
    effect: { type: 'dopamineMultiplier', value: 1.06 },
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
    description: '+8% Dopamine per level. Twice the heart, twice the void.',
    icon: '✌️',
    cost: { currency: 'DOP', base: 90, multiplier: 1.5 },
    maxLevel: 25,
    effect: { type: 'dopamineMultiplier', value: 1.08 },
  },
  {
    id: 'secondhand_phone',
    name: 'Secondhand Smartphone',
    description: 'Opens another feed to scroll on. More phones = more throughput (but you need bandwidth & bots to feed them).',
    icon: '📱',
    cost: { currency: 'DOP', base: 100, multiplier: 1.55 },
    maxLevel: 9,
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
    cost: { currency: 'DOP', base: 150, multiplier: 1.38 },
    effect: { type: 'autoLikeRate', value: 1 },
  },
  {
    id: 'auto_scroller',
    name: 'Auto-Scroller Bot',
    description: 'Auto-swipes ready posts: +0.5 swipes/s per level — mines even offline. Uses bandwidth.',
    icon: '🤖',
    cost: { currency: 'DOP', base: 200, multiplier: 1.4 },
    effect: { type: 'autoSwipeRate', value: 0.5 },
  },
  {
    id: 'auto_commenter',
    name: 'Auto-Commenter Bot',
    description: 'Auto-posts comments: +0.3 comments/s per level. Generates Comments & reactions.',
    icon: '🗨️',
    cost: { currency: 'DOP', base: 350, multiplier: 1.42 },
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
    description: '+12% Dopamine per level. Fifteen minutes, every time.',
    icon: '📈',
    cost: { currency: 'DOP', base: 1000, multiplier: 1.5 },
    maxLevel: 18,
    effect: { type: 'dopamineMultiplier', value: 1.12 },
    unlock: { dopamine: 1200 },
  },
  {
    id: 'third_eye',
    name: 'Third Eye',
    description: 'See the hidden gems. +0.4 virality per level (more Rare/Epic/Legendary posts).',
    icon: '👁️',
    cost: { currency: 'DOP', base: 400, multiplier: 1.55 },
    maxLevel: 8,
    effect: { type: 'virality', value: 0.4 },
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
    description: 'Guaranteed cuteness. +60% Dopamine.',
    icon: '🐱',
    cost: { currency: 'DOP', base: 2500, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.6 },
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
    description: '+100 Mbps of bandwidth (max 6).',
    icon: '🛜',
    cost: { currency: 'DOP', base: 10000, multiplier: 1.55 },
    maxLevel: 6,
    effect: { type: 'bandwidth', value: 100 },
  },

  // ── Vlna 2 — nové typy efektů (pre-prestige „wow" upgrady, postupně odemykané) ──
  {
    id: 'fresh_battery',
    name: 'Close Background Apps',
    description: 'Frees up your phone. Posts load +10% faster per level (faster buffering).',
    icon: '🔋',
    cost: { currency: 'DOP', base: 45, multiplier: 1.3 },
    effect: { type: 'bufferSpeedMult', value: 1.1 },
  },
  {
    id: 'gigabit_thumbs',
    name: 'Gigabit Thumbs',
    description: 'Upgrade your phone: posts load +15% faster per level. The feed never rests.',
    icon: '⚡',
    cost: { currency: 'DOP', base: 400, multiplier: 1.4 },
    effect: { type: 'bufferSpeedMult', value: 1.15 },
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
    description: 'Ironically used to scroll longer. +35% Attention regen per level.',
    icon: '🧘',
    cost: { currency: 'DOP', base: 600, multiplier: 1.45 },
    maxLevel: 5,
    effect: { type: 'attentionRegenMult', value: 1.35 },
    unlock: { dopamine: 500 },
  },
  {
    id: 'adderall',
    name: 'Off-Brand Adderall',
    description: "+30% max Attention per level. Don't ask where it's from.",
    icon: '💊',
    cost: { currency: 'DOP', base: 1200, multiplier: 1.5 },
    maxLevel: 5,
    effect: { type: 'attentionMaxMult', value: 1.3 },
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
    maxLevel: 8,
    effect: { type: 'critChance', value: 0.05 },
    unlock: { dopamine: 2500 },
  },
  {
    id: 'mega_jackpot',
    name: 'Mega-Jackpot Mode',
    description: '+3 to the jackpot payout multiplier per level. When it hits, it HITS.',
    icon: '💰',
    cost: { currency: 'DOP', base: 18000, multiplier: 1.6 },
    maxLevel: 5,
    effect: { type: 'critMult', value: 2 },
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
    maxLevel: 3,
    effect: { type: 'bandwidthMult', value: 1.6 },
    unlock: { dopamine: 30000, requires: 'fiber' },
  },

  // ── Cosmetics / Juice (vizuální „skiny" – paroduje placení za vzhled; každý dá i malý bonus) ──
  {
    id: 'neon_mode',
    name: 'Neon Mode',
    description: 'Glowing neon everything. Pretty AND addictive. +15% Dopamine.',
    icon: '🌈',
    cost: { currency: 'DOP', base: 1200, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.15 },
    unlock: { dopamine: 800 },
    category: 'cosmetics',
  },
  {
    id: 'crt_filter',
    name: 'Retro CRT Filter',
    description: 'Nostalgic scanlines for that 90s screen-time. +12% Dopamine.',
    icon: '📺',
    cost: { currency: 'DOP', base: 5000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.12 },
    unlock: { dopamine: 3000 },
    category: 'cosmetics',
  },
  {
    id: 'confetti_cannon',
    name: 'Confetti Cannon',
    description: 'Rare posts explode in 3× the confetti. Celebrate the void. +10% Dopamine.',
    icon: '🎉',
    cost: { currency: 'DOP', base: 25000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.1 },
    unlock: { dopamine: 15000 },
    category: 'cosmetics',
  },
  {
    id: 'combo_text',
    name: 'Floating Combo Text',
    description: 'Bigger, juicier dopamine numbers fly off your phones. +10% Dopamine.',
    icon: '💥',
    cost: { currency: 'DOP', base: 120000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.1 },
    unlock: { dopamine: 70000 },
    category: 'cosmetics',
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave Aesthetic',
    description: 'A E S T H E T I C. Pink-and-cyan synthwave grid. +20% Dopamine.',
    icon: '🌴',
    cost: { currency: 'DOP', base: 600000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.2 },
    unlock: { dopamine: 350000 },
    category: 'cosmetics',
  },
  {
    id: 'screen_shake',
    name: 'Haptic Overdrive',
    description: 'Jackpots physically shake the whole screen. Feel the dopamine. +15% Dopamine.',
    icon: '📳',
    cost: { currency: 'DOP', base: 4000000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.15 },
    unlock: { dopamine: 2500000 },
    category: 'cosmetics',
  },
  {
    id: 'gold_rush',
    name: 'Gold Everything',
    description: 'Recolors the UI in tasteless gold. You have made it. +25% Dopamine.',
    icon: '🏆',
    cost: { currency: 'DOP', base: 30000000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.25 },
    unlock: { dopamine: 18000000 },
    category: 'cosmetics',
  },
  {
    id: 'disco_ball',
    name: 'Disco Ball Mode',
    description: 'The whole background slowly cycles through every color. +20% Dopamine.',
    icon: '🪩',
    cost: { currency: 'DOP', base: 200000000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.2 },
    unlock: { dopamine: 120000000 },
    category: 'cosmetics',
  },
  // ── Nové efekty + skiny na pozadí (DOP) ──
  {
    id: 'sepia_mode',
    name: 'Sepia Nostalgia',
    description: 'Everything looks like a warm, faded memory of a simpler time. +15% Dopamine.',
    icon: '📷',
    cost: { currency: 'DOP', base: 80000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.15 },
    unlock: { dopamine: 50000 },
    category: 'cosmetics',
  },
  {
    id: 'kitten_bg',
    name: 'Kitten Wallpaper',
    description: 'A soothing wall of kittens behind the feed. Purely for your wellbeing. +18% Dopamine.',
    icon: '🐱',
    cost: { currency: 'DOP', base: 300000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.18 },
    unlock: { dopamine: 200000 },
    category: 'cosmetics',
  },
  {
    id: 'rainbow_text',
    name: 'Rainbow Everything',
    description: 'Every number shimmers through the entire spectrum. Tasteful. +20% Dopamine.',
    icon: '🌈',
    cost: { currency: 'DOP', base: 1500000, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.2 },
    unlock: { dopamine: 1000000 },
    category: 'cosmetics',
  },
  // ── „Hyper" kosmetiky za Clarity (vzácná měna z prestige). Přežijí prestige jako každá kosmetika;
  // nemají dopamine-unlock (ten by se po prestige resetoval) – gate je jen cena v 🧠 Clarity. ──
  {
    id: 'aurora_skin',
    name: 'Aurora Overload',
    description: 'A living aurora ripples behind everything. Paid in hard-won Clarity. +6% Dopamine.',
    icon: '🌌',
    cost: { currency: 'CLA', base: 3, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.06 },
    category: 'cosmetics',
  },
  {
    id: 'galaxy_brain',
    name: 'Galaxy Brain',
    description: 'You have ascended. A whole galaxy slowly swirls behind the feed. +8% Dopamine.',
    icon: '🌠',
    cost: { currency: 'CLA', base: 10, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.08 },
    category: 'cosmetics',
  },
  // ── Odměny za achievementy (nekupují se – udělí se při odemčení; viz Game.checkAchievements) ──
  {
    id: 'golden_thumb',
    name: 'Golden Thumb',
    description: 'Reward for Thumb of Steel. A regal gold sheen for a thumb that never rests. +12% Dopamine.',
    icon: '👑',
    cost: { currency: 'DOP', base: 1, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.12 },
    unlock: { dopamine: ACHIEVEMENT_ONLY },
    category: 'cosmetics',
  },
  {
    id: 'grass_filter',
    name: 'Touched Grass',
    description: 'Reward for your first prestige. A gentle green calm settles over the feed. +12% Dopamine.',
    icon: '🌱',
    cost: { currency: 'DOP', base: 1, multiplier: 1 },
    maxLevel: 1,
    effect: { type: 'dopamineMultiplier', value: 1.12 },
    unlock: { dopamine: ACHIEVEMENT_ONLY },
    category: 'cosmetics',
  },

  // ── Brain Rot větev (za 🧟 BR z TokTik+) — velký boost, ale poškozuje UI (chaos) ──
  {
    id: 'rage_bait',
    name: 'Rage-Bait Generator',
    description: 'Turns every caption into provocative nonsense. +30% Dopamine per level.',
    icon: '😡',
    cost: { currency: 'BR', base: 20, multiplier: 1.6 },
    maxLevel: 12,
    effect: { type: 'dopamineMultiplier', value: 1.3 },
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
