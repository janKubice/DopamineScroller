import { EventBus, type EventMap } from '../events/EventBus';
import { Wallet } from '../economy/Wallet';
import { UpgradeStore } from '../economy/UpgradeStore';
import { bufferScale, bandwidthLoad } from '../economy/Bandwidth';
import type { CurrencyId } from '../economy/currencies';
import { SAVE_VERSION, type SaveState } from '../persistence/SaveData';
import { BigNumber } from '../math/BigNumber';
import { Rng } from '../math/Rng';
import { GameClock, type Tickable } from '../time/GameClock';
import { UPGRADES, categoryOf, effectTotalLabel, type UpgradeDef, type UpgradeCategory } from '../content/upgrades';
import { CLARITY_UPGRADES } from '../content/clarity';
import { ACHIEVEMENTS, type AchievementDef } from '../content/achievements';
import { NARRATIVE, type NarrativeTrigger } from '../content/narrative';
import { PLATFORMS, DEFAULT_PLATFORM_ID, type PlatformDef } from '../content/platforms';
import {
  Phone,
  DEFAULT_PHONE_CONFIG,
  RARITY_MULTIPLIER,
  type Post,
  type Rarity,
  type SwipeResult,
  type PhoneConfig,
} from './Phone';
import {
  CommentPool,
  DEFAULT_REACTION_CONTEXT,
  type CommentDef,
  type CommentResult,
  type ReactionContext,
} from '../content/CommentPool';

/** Doménové eventy (Doména → Prezentace). Viz docs/GDD-05-Architecture.md §4. */
export interface GameEvents extends EventMap {
  PostReady: { phoneId: number; rarity: Rarity };
  SwipeResolved: { phoneId: number; dopamine: BigNumber; rarity: Rarity };
  HiddenGemFound: { phoneId: number; rarity: Rarity };
  /** Jackpot swipe (crit) – odměna byla vynásobena. Viz Vlna 2 / jackpot_algo. */
  Jackpot: { phoneId: number; dopamine: BigNumber; multiplier: number };
  Liked: { phoneId: number; likes: BigNumber };
  CommentPosted: { phoneId: number; commentId: string };
  /** Jeden „naskočený" lajk/dislajk během reakce na komentář. */
  CommentReaction: { phoneId: number; kind: 'like' | 'dislike'; emitted: number };
  /** Konec reakce – outcome se hráči ukáže AŽ tady (opožděně). */
  CommentResolved: { phoneId: number; result: CommentResult };
  CurrencyChanged: { id: CurrencyId; total: BigNumber };
  StreakChanged: { value: number };
  UpgradePurchased: { id: string; level: number };
  PlatformUnlocked: { id: string };
  PlatformChanged: { id: string };
  /** Minihra: vyskočila dopaminová bublina ke kliknutí. */
  BubbleSpawned: { id: number; value: BigNumber };
  BubblePopped: { id: number; value: BigNumber };
  BubbleExpired: { id: number };
  /** Minihra Skip-Ad: vyskočila „reklama" k přeskočení. */
  AdSpawned: { id: number; reward: BigNumber };
  AdSkipped: { id: number; reward: BigNumber };
  AdExpired: { id: number };
  /** Minihra CAPTCHA: „prove you're human" mřížka (cells[i]=true je správná dlaždice). */
  CaptchaSpawned: { id: number; cells: boolean[]; reward: BigNumber };
  CaptchaResolved: { id: number; success: boolean; reward: BigNumber };
  /** Prestige: Dopamine Overdose → reset za Clarity (s „Doomscroll Wrapped" shrnutím). */
  Prestiged: { summary: WrappedSummary };
  /** Odemčen achievement (Fáze 9). */
  AchievementUnlocked: { id: string; name: string; icon: string };
  /** „Hlas Algoritmu" promluvil (narativní vrstva C4). */
  AlgorithmSpeaks: { id: string; text: string };
}

/** View model achievementu pro prezentaci (Fáze 9). */
export interface AchievementView {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  secret: boolean;
}

/** „Doomscroll Wrapped" – shrnutí běhu při prestige (satira Spotify Wrapped). */
export interface WrappedSummary {
  prestige: number; // pořadí tohoto prestige (1 = první)
  clarityGained: BigNumber;
  totalDopamine: BigNumber;
  swipes: number;
  likes: number;
  comments: number;
  gems: number;
  jackpots: number;
  seconds: number;
}

/** Výsledek offline těžby (po načtení hry). */
export interface OfflineEarnings {
  seconds: number; // skutečně započtené sekundy (po zastropování)
  capped: boolean; // true pokud byla doba zastropována
  dopamine: BigNumber;
  likes: BigNumber;
  comments: BigNumber;
}

/** View model jednoho upgradu pro prezentaci. */
export interface UpgradeView {
  id: string;
  name: string;
  icon: string;
  description: string;
  level: number;
  maxed: boolean;
  cost: BigNumber;
  costCurrency: CurrencyId;
  affordable: boolean;
  /** Dopad na síť (Mbps). `uses` = spotřebovává, `adds` = zvyšuje kapacitu. */
  networkDelta: number;
  networkKind: 'uses' | 'adds' | 'none';
  /** Postupné odemykání (T6): zamčený = nelze koupit; viditelný = ukázat v UI (vč. teaseru). */
  locked: boolean;
  visible: boolean;
  /** Text požadavku na odemčení (jen když locked), pro UI. */
  unlockHint?: string;
  /** Kategorie pro vyjížděcí panel (#9). */
  category: UpgradeCategory;
  /** Lidsky čitelný souhrn AKTUÁLNÍHO bonusu na dané úrovni (#B), prázdný na Lv 0. */
  effectTotal: string;
}

/** View model platformy pro prezentaci (přepínač sítí). */
export interface PlatformView {
  id: string;
  name: string;
  icon: string;
  unlocked: boolean;
  active: boolean;
  unlockAt: BigNumber;
}

// ── Balanc konstanty (Fáze 9 je externalizuje do dat) ──
const STREAK_FLOOR = 1;
const STREAK_MAX = 3;
const STREAK_STEP = 0.1;
const STREAK_DECAY = 0.2; // za sekundu
const BASE_BANDWIDTH = 3; // Mbps – domácí Wi-Fi na startu
const BOT_BANDWIDTH_COST = 0.5; // Mbps spotřeby na úroveň bota
// Base Dopamin/post a spotřeba sítě na telefon přicházejí z aktivní platformy.
export const MAX_OFFLINE_SECONDS = 4 * 3600; // strop offline těžby (4 h)
export const OFFLINE_EFFICIENCY = 0.5; // boti jsou offline jen z poloviny efektivní
const AUTO_SCROLL_GRACE = 0.4; // s – jak dlouho post „dýchá" než ho auto-scroller swipne
const MAX_AUTO_WAIT = 8; // s – pojistka: auto-scroller swipne i bez splnění podmínky čekání
const MAX_BOT_BUDGET = 3; // strop nahromaděných bot-akcí (anti-hoarding při nečinnosti)

// ── Minihra: dopaminové bubliny (odemyká se upgradem) ──
const BUBBLE_MIN_INTERVAL = 8; // s mezi spawny (min, před upgrady frekvence)
const BUBBLE_MAX_INTERVAL = 14; // s mezi spawny (max)
const BUBBLE_LIFETIME = 4.5; // s než bublina zmizí
const MAX_BUBBLES = 2; // max bublin naráz
const BUBBLE_REWARD_FACTOR = 2; // hodnota ≈ 2 swipy (před upgrady hodnoty)
const BUBBLE_MIN_REWARD = 2; // minimální odměna

// ── Pozornost (M1): lidský bottleneck. Boti ji nestojí, manuál ano. ──
const MAX_ATTENTION = 100;
const ATTENTION_REGEN = 8; // /s (z nuly plně za ~12 s)
const ATTENTION_COST_SWIPE = 6;
const ATTENTION_COST_LIKE = 3;
const ATTENTION_COST_COMMENT = 5;
const ATTENTION_COST_BUBBLE = 4;
const FOCUS_MIN = 0.35; // minimální násobič odměny manuálu při vyčerpané pozornosti
const FOCUS_THRESHOLD = 0.35; // pod tímto podílem pozornosti se penalizace plně projeví

// ── Vlna 2 (pre-prestige): nové efekty + postupné odemykání ──
const JACKPOT_BASE_MULT = 5; // základní násobič jackpotu (crit) – upgrady přidávají přes critMult
const CRIT_CHANCE_CAP = 0.9; // strop šance na jackpot (ať to nikdy není 100 %)
const OFFLINE_EFFICIENCY_CAP = 1; // offline efektivita nemůže přesáhnout 100 %
const UNLOCK_TEASER_FRACTION = 0.5; // zamčený (jen práh Dopaminu) se v UI ukáže, když je práh z poloviny dosažen

// ── Prestige / Dopamine Overdose (Fáze 6) ──
export const CLARITY_THRESHOLD = 1e10; // kolik vydělaného Dopaminu = 1 Clarity (práh prestige) – laděno pro ~45–60 min
const CLARITY_EXP = 0.5; // sqrt škálování: ×100 Dopaminu ≈ ×10 Clarity (klesající výnos)
const OVERDOSE_DPS_LOG10 = 9; // nad ~1e9 Dopaminu/s je „Overdose" (UI flavor + pobídka k prestige)

// ── Minihry Skip-Ad & CAPTCHA (M4) ──
const AD_UNLOCK_DOPAMINE = 500; // od kolika vydělaného Dopaminu se objevují reklamy
const AD_MIN_INTERVAL = 14; // s mezi reklamami (min)
const AD_MAX_INTERVAL = 26; // s (max)
const AD_LIFETIME = 6; // s než reklama zmizí
const AD_REWARD_FACTOR = 6; // odměna ≈ 6 swipů
const CAPTCHA_UNLOCK_DOPAMINE = 5000; // od kolika vydělaného Dopaminu se objevují CAPTCHA
const CAPTCHA_MIN_INTERVAL = 22; // s mezi CAPTCHA (min)
const CAPTCHA_MAX_INTERVAL = 40; // s (max)
const CAPTCHA_LIFETIME = 9; // s na vyřešení
const CAPTCHA_CELLS = 9; // 3×3 mřížka
const CAPTCHA_TILE_CHANCE = 0.4; // šance, že dlaždice je „správná"
const CAPTCHA_REWARD_FACTOR = 25; // odměna ≈ 25 swipů (těžší minihra = větší odměna)

// ── Rebalance (#5): měkký strop globálního multiplikátoru produkce ──
// Pod prahem se nic nemění (zachová early/mid balanc), nad ním se exponenciální exploze
// stlačí v log prostoru (klesající výnos), ať se hra „od jisté fáze nezlomí".
const PRODUCTION_SOFTCAP_LOG10 = 2; // práh ×100 produkce (zapne se brzy → plató místo exploze)
const PRODUCTION_COMPRESSION = 0.12; // silné zploštění nad prahem (plató)

/** Zaokrouhlí BigNumber dolů (pro celočíselnou Clarity); obří hodnoty nechá být. */
function bigFloor(b: BigNumber): BigNumber {
  if (!b.isPositive() || b.e >= 12) return b;
  return BigNumber.of(Math.floor(b.toNumber()));
}

/** Měkký strop v log10 prostoru: hodnoty ≤ 10^capLog projdou beze změny, vyšší se stlačí. */
function softCapLog10(value: BigNumber, capLog: number, compression: number): BigNumber {
  const log = value.log10();
  if (!Number.isFinite(log) || log <= capLog) return value;
  const compressed = capLog + (log - capLog) * compression;
  const e = Math.floor(compressed);
  return BigNumber.fromMantissaExp(Math.pow(10, compressed - e), e);
}

// ── Synergie měn (M2) ──
const SYNERGY_REACH_K = 0.1; // Likes → Reach (× dopamin/swipe), per řád
const SYNERGY_ENGAGEMENT_K = 0.1; // Comments → Engagement (× yield lajku), per řád
const SYNERGY_SHARE_VIRALITY_K = 0.2; // Shares → Virality, per řád
const OMNIPRESENCE_PER_PLATFORM = 0.08; // globální bonus za každou odemčenou platformu navíc
const SHARE_BY_RARITY: Readonly<Record<Rarity, number>> = { common: 0, rare: 1, epic: 3, legendary: 10 };

/** Doba, po kterou reakce na komentář „naskakuje" (liky/disliky v čase). */
export const REACTION_WINDOW = 4; // s

function rarityChances(virality: number): { legendary: number; epic: number; rare: number } {
  // Zastropováno, ať virality neexploduje rarity multiplikátor donekonečna (rebalance).
  return {
    legendary: Math.min(0.1, 0.001 * (1 + virality)),
    epic: Math.min(0.2, 0.01 * (1 + virality)),
    rare: Math.min(0.5, 0.05 * (1 + virality)),
  };
}

function rollRarity(virality: number, rng: Rng): Rarity {
  const r = rng.next();
  const { legendary, epic, rare } = rarityChances(virality);
  if (r < legendary) return 'legendary';
  if (r < legendary + epic) return 'epic';
  if (r < legendary + epic + rare) return 'rare';
  return 'common';
}

/** Očekávaný multiplikátor rarity (pro odhad pasivního/offline příjmu a balanc). */
export function expectedRarityMultiplier(virality: number): number {
  const { legendary, epic, rare } = rarityChances(virality);
  const common = Math.max(0, 1 - legendary - epic - rare);
  return common * RARITY_MULTIPLIER.common +
    rare * RARITY_MULTIPLIER.rare +
    epic * RARITY_MULTIPLIER.epic +
    legendary * RARITY_MULTIPLIER.legendary;
}

/** Probíhající reakce na komentář, která se vyhodnocuje postupně v čase. */
interface ActiveReaction {
  phoneId: number;
  result: CommentResult;
  duration: number;
  elapsed: number;
  emittedLikes: number;
  emittedDislikes: number;
  creditedFraction: number;
}

/** Aktivní dopaminová bublina (minihra). */
interface ActiveBubble {
  id: number;
  value: BigNumber;
  remaining: number;
}

/** Aktivní „reklama" (minihra Skip-Ad). */
interface ActiveAd {
  id: number;
  reward: BigNumber;
  remaining: number;
}

/** Aktivní CAPTCHA výzva (minihra). `cells[i]=true` = správná dlaždice k označení. */
interface ActiveCaptcha {
  id: number;
  cells: boolean[];
  reward: BigNumber;
  remaining: number;
}

/** Statistiky běhu pro „Doomscroll Wrapped" (resetují se při prestige). */
interface RunStats {
  swipes: number;
  likes: number;
  comments: number;
  gems: number;
  jackpots: number;
  seconds: number;
}

/** Doživotní statistiky (přežijí prestige). */
interface LifetimeStats {
  prestiges: number;
  clarityEarned: BigNumber;
  dopamineAllTime: BigNumber;
}

/** Na co má auto-scroller čekat, než post swipne (M1/T4). */
export type SwipeWaitMode = 'none' | 'like' | 'comment' | 'both';

export interface GameOptions {
  seed?: number;
  comments?: CommentPool;
  upgrades?: readonly UpgradeDef[];
  clarityUpgrades?: readonly UpgradeDef[];
  platforms?: readonly PlatformDef[];
  phoneConfig?: PhoneConfig;
}

/**
 * Game — kořenový herní stav a orchestrátor. Implementuje Tickable (krokuje ho GameClock).
 * Drží peněženku, RNG, telefony, streak, upgrady a komentářový pool; emituje eventy přes
 * EventBus. Prezentace volá Commands (swipe/like/postComment/buy) a odebírá eventy.
 */
export class Game implements Tickable {
  readonly bus = new EventBus<GameEvents>();
  readonly wallet = new Wallet();
  readonly upgrades: UpgradeStore;
  /** Clarity „Zen" upgrady (prestige meta) – samostatný store, přežívá reset. */
  readonly clarity: UpgradeStore;
  readonly rng: Rng;
  readonly clock: GameClock;
  readonly phones: Phone[] = [];

  private readonly comments: CommentPool;
  private readonly pendingComments = new Map<number, CommentDef[]>();
  private readonly reactions: ActiveReaction[] = [];
  private readonly bubbles: ActiveBubble[] = [];
  private bubbleTimer = 0;
  private nextBubbleIn = BUBBLE_MIN_INTERVAL;
  private nextBubbleId = 1;
  // Minihry Skip-Ad & CAPTCHA (jedna aktivní naráz)
  private ad: ActiveAd | null = null;
  private adTimer = 0;
  private nextAdIn = AD_MIN_INTERVAL;
  private nextAdId = 1;
  private captcha: ActiveCaptcha | null = null;
  private captchaTimer = 0;
  private nextCaptchaIn = CAPTCHA_MIN_INTERVAL;
  private nextCaptchaId = 1;
  // Statistiky (Doomscroll Wrapped + lifetime)
  private runStats: RunStats = { swipes: 0, likes: 0, comments: 0, gems: 0, jackpots: 0, seconds: 0 };
  private lifetime: LifetimeStats = { prestiges: 0, clarityEarned: BigNumber.ZERO, dopamineAllTime: BigNumber.ZERO };
  // Achievementy + narativ (Fáze 9) – trvalé (přežijí prestige, ukládají se)
  private readonly unlockedAchievements = new Set<string>();
  private readonly seenNarrative = new Set<string>();
  private autoLikeBudget = 0;
  private autoSwipeBudget = 0;
  private autoCommentBudget = 0;
  private swipeWaitForMode: SwipeWaitMode = 'none';
  private attentionValue = MAX_ATTENTION;
  private streakValue = STREAK_FLOOR;
  private viralityBase = 0;
  private nextPhoneId = 1;
  private readonly likeYield = BigNumber.ONE;

  private readonly platforms: readonly PlatformDef[];
  private activePlatformId: string;
  private unlockedPlatformIds = new Set<string>();
  private totalDopamine = BigNumber.ZERO; // kumulovaný Dopamin za běh (odemyká platformy)

  constructor(options: GameOptions = {}) {
    this.rng = new Rng(options.seed ?? 1);
    this.comments = options.comments ?? CommentPool.default();
    this.upgrades = new UpgradeStore(options.upgrades ?? UPGRADES);
    this.clarity = new UpgradeStore(options.clarityUpgrades ?? CLARITY_UPGRADES);
    this.platforms = options.platforms ?? PLATFORMS;
    this.activePlatformId = this.platforms[0]?.id ?? DEFAULT_PLATFORM_ID;
    this.refreshUnlockedPlatforms();
    this.clock = new GameClock(this);
    this.addPhone(options.phoneConfig ?? DEFAULT_PHONE_CONFIG);
    this.nextBubbleIn = this.rollBubbleInterval();
  }

  /** Doplní set odemčených platforem dle kumulovaného Dopaminu (bez eventů). */
  private refreshUnlockedPlatforms(): void {
    for (const p of this.platforms) {
      if (this.totalDopamine.gte(BigNumber.of(p.unlockAtDopamine))) {
        this.unlockedPlatformIds.add(p.id);
      }
    }
  }

  addPhone(config: PhoneConfig = DEFAULT_PHONE_CONFIG): Phone {
    const phone = new Phone(this.nextPhoneId++, config, () => this.generatePost());
    this.phones.push(phone);
    return phone;
  }

  get streak(): number {
    return this.streakValue;
  }

  get dopamine(): BigNumber {
    return this.wallet.get('DOP');
  }

  /** Aktivní platforma (sociální síť). */
  get activePlatform(): PlatformDef {
    return this.platforms.find((p) => p.id === this.activePlatformId) ?? this.platforms[0]!;
  }

  /** Base Dopamin/post podle aktivní platformy. */
  get basePostValue(): BigNumber {
    return BigNumber.of(this.activePlatform.basePostValue);
  }

  /** Kumulovaný Dopamin za běh (odemyká platformy, později Clarity). */
  get totalDopamineEarned(): BigNumber {
    return this.totalDopamine;
  }

  /** Přepne aktivní platformu (jen pokud je odemčená). */
  setPlatform(id: string): boolean {
    if (!this.unlockedPlatformIds.has(id)) return false;
    if (this.activePlatformId !== id) {
      this.activePlatformId = id;
      this.bus.emit('PlatformChanged', { id });
    }
    return true;
  }

  /** View model platforem pro přepínač. */
  platformView(): PlatformView[] {
    return this.platforms.map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      unlocked: this.unlockedPlatformIds.has(p.id),
      active: p.id === this.activePlatformId,
      unlockAt: BigNumber.of(p.unlockAtDopamine),
    }));
  }

  /** Pozornost (M1): regenerující se lidský zdroj. */
  get attention(): number {
    return this.attentionValue;
  }
  get maxAttention(): number {
    return MAX_ATTENTION * this.effectProduct('attentionMaxMult').toNumber();
  }
  /** Násobič regenerace Pozornosti (upgrady Vlny 2). */
  get attentionRegenMultiplier(): number {
    return this.effectProduct('attentionRegenMult').toNumber();
  }

  /** Násobič odměny manuálních akcí dle pozornosti (1 = svěží, FOCUS_MIN = vyčerpaný). */
  get focusFactor(): number {
    const ratio = this.attentionValue / this.maxAttention;
    return FOCUS_MIN + (1 - FOCUS_MIN) * Math.min(1, ratio / FOCUS_THRESHOLD);
  }

  private spendAttention(cost: number): void {
    this.attentionValue = Math.max(0, this.attentionValue - cost);
  }

  /** Virality (M5/§5): šance na vzácné posty. Base + upgrady + platforma + Shares (M2). */
  get virality(): number {
    return (
      this.viralityBase +
      this.sumEffect('virality') +
      this.activePlatform.viralityBonus +
      this.synergyShareVirality +
      this.clarityVirality
    );
  }

  // ── Synergie měn (M2): nahromaděné LCS dávají bonusy s klesajícím mezním výnosem ──
  /** log10 zůstatku měny (0 pro nulu/podjednotku) – základ pro synergie. */
  private logOf(id: CurrencyId): number {
    const v = this.wallet.get(id);
    return v.isZero() ? 0 : Math.max(0, v.log10());
  }
  /** Likes → Reach: bonus k Dopaminu/swipe. */
  get synergyReach(): number {
    return SYNERGY_REACH_K * this.logOf('LIK');
  }
  /** Comments → Engagement: bonus k yieldu lajku. */
  get synergyEngagement(): number {
    return SYNERGY_ENGAGEMENT_K * this.logOf('COM');
  }
  /** Shares → Virality: bonus k viralitě. */
  get synergyShareVirality(): number {
    return SYNERGY_SHARE_VIRALITY_K * this.logOf('SHR');
  }
  /** Omnipresence: bonus za každou odemčenou platformu navíc. */
  get omnipresenceBonus(): number {
    return OMNIPRESENCE_PER_PLATFORM * Math.max(0, this.unlockedPlatformIds.size - 1);
  }

  // ── Clarity (prestige meta): trvalé bonusy ze samostatného `clarity` store ──
  get clarityProductionMult(): BigNumber {
    return this.effectProduct('dopamineMultiplier', this.clarity);
  }
  get clarityBufferMult(): number {
    return this.effectProduct('bufferSpeedMult', this.clarity).toNumber();
  }
  get clarityBandwidthMult(): number {
    return this.effectProduct('bandwidthMult', this.clarity).toNumber();
  }
  get clarityVirality(): number {
    return this.sumEffect('virality', this.clarity);
  }
  get clarityOfflineBonus(): number {
    return this.sumEffect('offlineEfficiencyBonus', this.clarity);
  }
  get clarityStreakBonus(): number {
    return this.sumEffect('streakCapBonus', this.clarity);
  }

  /** Surový součin dopamineMultiplier (před měkkým stropem) – pro UI/diagnostiku. */
  get rawProductionMultiplier(): BigNumber {
    return this.effectProduct('dopamineMultiplier');
  }

  /**
   * Globální multiplikátor produkce z algoritmů + Brain Rot (součin dopamineMultiplier),
   * nad prahem PRODUCTION_SOFTCAP zploštěný (rebalance #5 – brzdí exponenciální explozi).
   */
  get productionMultiplier(): BigNumber {
    // Běh se měkce stropuje (rebalance #5); Clarity (meta) se násobí navrch BEZ stropu.
    return softCapLog10(this.rawProductionMultiplier, PRODUCTION_SOFTCAP_LOG10, PRODUCTION_COMPRESSION).mul(
      this.clarityProductionMult,
    );
  }

  /** Je globální produkce nad měkkým stropem (UI může naznačit klesající výnos)? */
  get isProductionSoftCapped(): boolean {
    return this.rawProductionMultiplier.log10() > PRODUCTION_SOFTCAP_LOG10;
  }

  /** Multiplikátor Dopaminu/swipe bez streaku: algoritmy × Reach × Omnipresence. */
  get globalSwipeMultiplier(): BigNumber {
    return this.productionMultiplier
      .mul(BigNumber.of(1 + this.synergyReach))
      .mul(BigNumber.of(1 + this.omnipresenceBonus));
  }

  /** Efektivní yield lajku: base × (1 + Engagement). */
  get effectiveLikeYield(): BigNumber {
    return this.likeYield.mul(BigNumber.of(1 + this.synergyEngagement));
  }

  /** Násobič spotřeby sítě (downside Brain Rot upgradů, např. AI Slop ×1.5). */
  get consumptionMultiplier(): number {
    return this.effectProduct('consumptionMultiplier').toNumber();
  }

  // ── Vlna 2: nové efekty (čtené dynamicky) ──
  /** Aktuální strop streaku (M3) – base + upgrady (Doomscroll Stamina). */
  get streakMax(): number {
    return STREAK_MAX + this.sumEffect('streakCapBonus') + this.clarityStreakBonus;
  }
  /** Šance, že je swipe jackpot (crit), 0–1, zastropovaná. 0 = bez upgradů. */
  get critChance(): number {
    return Math.min(CRIT_CHANCE_CAP, this.sumEffect('critChance'));
  }
  /** Násobič odměny při jackpotu: základ + upgrady (Mega-Jackpot). */
  get critMultiplier(): number {
    return JACKPOT_BASE_MULT + this.sumEffect('critMult');
  }
  /** Očekávaný násobič z jackpotů (pro odhad/offline). 1 = bez crit upgradů. */
  get expectedCritFactor(): number {
    const c = this.critChance;
    return c > 0 ? 1 + c * (this.critMultiplier - 1) : 1;
  }
  /** Efektivita offline těžby (0–1): base + upgrady (Time-Dilation), zastropováno. */
  get offlineEfficiency(): number {
    return Math.min(
      OFFLINE_EFFICIENCY_CAP,
      OFFLINE_EFFICIENCY + this.sumEffect('offlineEfficiencyBonus') + this.clarityOfflineBonus,
    );
  }
  /** Strop offline těžby v sekundách: base + upgrady (Cloud Backup). */
  get maxOfflineSeconds(): number {
    return MAX_OFFLINE_SECONDS + this.sumEffect('offlineCapHours') * 3600;
  }

  /**
   * Chaos Level 0–100 (V1): roste s počtem telefonů, Brain Rot upgrady a tierem platformy.
   * Prezentace ho mapuje na vizuální přetížení (glitch/saturace). Viz docs/GDD-04 §V1.
   */
  get chaosLevel(): number {
    let brLevels = 0;
    for (const def of this.upgrades.all) {
      if (def.cost.currency === 'BR') brLevels += this.upgrades.level(def.id);
    }
    const platformTier = Math.max(0, this.platforms.findIndex((p) => p.id === this.activePlatformId));
    const raw = this.phones.length * 1.5 + brLevels * 6 + platformTier * 10;
    return Math.min(100, raw);
  }

  /** Součin value^level daného multiplikativního efektu (kontroluje effect i sideEffect). */
  private effectProduct(type: UpgradeDef['effect']['type'], store: UpgradeStore = this.upgrades): BigNumber {
    let mult = BigNumber.ONE;
    for (const def of store.all) {
      const lvl = store.level(def.id);
      if (lvl <= 0) continue;
      if (def.effect.type === type) mult = mult.mul(BigNumber.of(def.effect.value).pow(lvl));
      if (def.sideEffect?.type === type) mult = mult.mul(BigNumber.of(def.sideEffect.value).pow(lvl));
    }
    return mult;
  }

  /** Celková kapacita sítě (Mbps): (základ + síťové upgrady) × bandwidthMult (Data Center). */
  get totalBandwidth(): number {
    let total = BASE_BANDWIDTH;
    for (const def of this.upgrades.all) {
      if (def.effect.type === 'bandwidth') {
        total += def.effect.value * this.upgrades.level(def.id);
      }
    }
    return total * this.effectProduct('bandwidthMult').toNumber() * this.clarityBandwidthMult;
  }

  /** Násobič rychlosti bufferingu z upgradů (Vlna 2) × Clarity (Cleared Cache). */
  get bufferSpeedMultiplier(): number {
    return this.effectProduct('bufferSpeedMult').toNumber() * this.clarityBufferMult;
  }

  /** Aktuální spotřeba sítě (Mbps): (telefony + boti) × consumptionMultiplier (AI Slop). */
  get bandwidthConsumption(): number {
    let c = this.phones.length * this.activePlatform.bandwidthPerPhone;
    for (const def of this.upgrades.all) {
      if (
        def.effect.type === 'autoLikeRate' ||
        def.effect.type === 'autoSwipeRate' ||
        def.effect.type === 'autoCommentRate'
      ) {
        c += BOT_BANDWIDTH_COST * this.upgrades.level(def.id);
      }
    }
    return c * this.consumptionMultiplier;
  }

  /** Násobič rychlosti bufferingu dle zatížení sítě (1 = ok, < 1 = přetíženo). */
  get bandwidthBufferScale(): number {
    return bufferScale(this.bandwidthConsumption, this.totalBandwidth);
  }

  /** Rychlosti botů (akcí/s) – součet úrovní upgradů. */
  get autoLikeRate(): number {
    return this.sumEffect('autoLikeRate');
  }
  get autoSwipeRate(): number {
    return this.sumEffect('autoSwipeRate');
  }
  get autoCommentRate(): number {
    return this.sumEffect('autoCommentRate');
  }

  /** Na co auto-scroller čeká, než swipne (T4). */
  get swipeWaitFor(): SwipeWaitMode {
    return this.swipeWaitForMode;
  }
  setSwipeWaitFor(mode: SwipeWaitMode): void {
    this.swipeWaitForMode = mode;
  }

  /** Splňuje post na telefonu podmínku čekání auto-scrolleru? */
  private canAutoSwipe(phone: Phone): boolean {
    if (!phone.isReady || phone.readyElapsed < AUTO_SCROLL_GRACE) return false;
    if (phone.readyElapsed >= MAX_AUTO_WAIT) return true; // pojistka proti zaseknutí
    switch (this.swipeWaitForMode) {
      case 'like':
        return phone.liked;
      case 'comment':
        return phone.commented;
      case 'both':
        return phone.liked && phone.commented;
      default:
        return true;
    }
  }

  /**
   * Efektivní swipy/s = min(rychlost auto-scrolleru, kolik postů telefony stihnou vyrobit).
   * Tady se projeví „čím víc telefonů, tím lepší bot je potřeba".
   */
  private effectiveSwipesPerSecond(): number {
    const rate = this.autoSwipeRate;
    if (rate <= 0 || this.phones.length === 0) return 0;
    const bufferTime = this.phones[0]!.config.bufferTime;
    const scale = Math.max(this.bandwidthBufferScale * this.bufferSpeedMultiplier, 1e-6);
    const swipeTime = this.phones[0]!.config.swipeTime;
    const cycle = bufferTime / scale + AUTO_SCROLL_GRACE + swipeTime;
    const supply = this.phones.length / cycle; // max postů/s, které farma vyrobí
    return Math.min(rate, supply);
  }

  /** Odhad Dopaminu/s z botů (pro HUD). Skutečný příjem chodí přes reálné swipy. */
  get estimatedDopaminePerSecond(): BigNumber {
    const swipes = this.effectiveSwipesPerSecond();
    if (swipes <= 0) return BigNumber.ZERO;
    return this.basePostValue.mul(this.globalSwipeMultiplier)
      .mul(BigNumber.of(expectedRarityMultiplier(this.virality)))
      .mul(BigNumber.of(this.expectedCritFactor))
      .mul(BigNumber.of(swipes));
  }

  /** Zatížení sítě (spotřeba / kapacita). > 1 = přetížení. */
  get bandwidthLoad(): number {
    return bandwidthLoad(this.bandwidthConsumption, this.totalBandwidth);
  }

  get isOverloaded(): boolean {
    return this.bandwidthLoad > 1;
  }

  // ── Commands (Prezentace → Doména) ──────────────────────────────────────────

  swipe(phoneId: number, manual = true): SwipeResult | null {
    const phone = this.getPhone(phoneId);
    if (!phone) return null;
    // Manuál: méně pozornosti = menší odměna (focusFactor). Boti penalizaci nepodléhají.
    const focus = manual ? this.focusFactor : 1;
    const result = phone.swipe(this.globalMultiplier().mul(BigNumber.of(focus)));
    if (!result) return null;
    if (manual) this.spendAttention(ATTENTION_COST_SWIPE);
    // Jackpot (crit): jen pokud je šance > 0, ať bez upgradů nesaháme na RNG stream (determinismus).
    let dopamine = result.dopamine;
    const critChance = this.critChance;
    if (critChance > 0 && this.rng.next() < critChance) {
      const multiplier = this.critMultiplier;
      dopamine = dopamine.mul(BigNumber.of(multiplier));
      this.runStats.jackpots++;
      this.bus.emit('Jackpot', { phoneId, dopamine, multiplier });
    }
    this.runStats.swipes++;
    if (result.rarity !== 'common') this.runStats.gems++;
    this.credit('DOP', dopamine);
    // Některé platformy (TokTik+) pasivně hnijou mozek.
    const br = this.activePlatform.brainRotPerSwipe;
    if (br > 0) this.credit('BR', BigNumber.of(br));
    // Vzácné posty se sdílejí → Shares (M2 synergie: Shares → Virality).
    const shares = SHARE_BY_RARITY[result.rarity];
    if (shares > 0) this.credit('SHR', BigNumber.of(shares));
    this.bumpStreak();
    this.bus.emit('SwipeResolved', { phoneId, dopamine, rarity: result.rarity });
    if (result.rarity !== 'common') {
      this.bus.emit('HiddenGemFound', { phoneId, rarity: result.rarity });
    }
    return { dopamine, rarity: result.rarity };
  }

  like(phoneId: number, manual = true): BigNumber | null {
    const phone = this.getPhone(phoneId);
    if (!phone) return null;
    const gained = phone.like(this.effectiveLikeYield);
    if (!gained) return null;
    if (manual) this.spendAttention(ATTENTION_COST_LIKE);
    this.runStats.likes++;
    this.credit('LIK', gained);
    this.bus.emit('Liked', { phoneId, likes: gained });
    return gained;
  }

  /** Komentářová ruleta, krok 1: nabídne `count` různých komentářů k výběru. */
  offerComments(phoneId: number, count = 3): CommentDef[] | null {
    const phone = this.getPhone(phoneId);
    if (!phone || !phone.canComment) return null;
    const offered = this.comments.offer(this.rng, count);
    this.pendingComments.set(phoneId, offered);
    return offered;
  }

  /**
   * Komentářová ruleta, krok 2: postne vybraný komentář. Reakce (liky/disliky) ale
   * NEPŘICHÁZÍ hned — naskakují postupně během REACTION_WINDOW (viz advance). Outcome
   * se hráči ukáže až eventem CommentResolved. Vrací, zda se komentář povedlo postnout.
   */
  postComment(phoneId: number, commentId: string, manual = true): boolean {
    const phone = this.getPhone(phoneId);
    if (!phone || !phone.canComment) return false;
    const offered = this.pendingComments.get(phoneId);
    const def = offered?.find((c) => c.id === commentId) ?? this.comments.byId(commentId);
    if (!def) return false;

    const result = this.comments.resolve(def, this.reactionContext(), this.rng);
    this.pendingComments.delete(phoneId);
    phone.markCommented();
    if (manual) this.spendAttention(ATTENTION_COST_COMMENT);
    this.runStats.comments++;
    this.credit('COM', BigNumber.ONE);

    this.reactions.push({
      phoneId,
      result,
      duration: REACTION_WINDOW,
      elapsed: 0,
      emittedLikes: 0,
      emittedDislikes: 0,
      creditedFraction: 0,
    });
    this.bus.emit('CommentPosted', { phoneId, commentId });
    return true;
  }

  /**
   * Koupí až `requested` úrovní upgradu (hromadný nákup, např. ×10). Koupí maximum, na co
   * stačí měna a co dovolí maxLevel. Vrací počet skutečně koupených úrovní.
   */
  buy(id: string, requested = 1): number {
    const def = this.upgrades.def(id);
    if (!def) return 0;
    if (!this.unlockMet(def)) return 0; // zamčený upgrade (T6) nelze koupit
    const want = Math.min(requested, this.upgrades.remaining(id));
    if (want <= 0) return 0;

    const budget = this.wallet.get(def.cost.currency);
    const n = Math.min(want, this.upgrades.maxAffordable(id, budget));
    if (n <= 0) return 0;

    const cost = this.upgrades.bulkCost(id, n);
    this.wallet.spend(def.cost.currency, cost);
    this.upgrades.incrementLevel(id, n);
    this.applyEffect(def, n);

    this.bus.emit('CurrencyChanged', {
      id: def.cost.currency,
      total: this.wallet.get(def.cost.currency),
    });
    this.bus.emit('UpgradePurchased', { id, level: this.upgrades.level(id) });
    return n;
  }

  /** Koupí Clarity „Zen" upgrade (za 🧘 CLA). Trvalý – přežije prestige. Vrací koupené úrovně. */
  buyClarity(id: string, requested = 1): number {
    const def = this.clarity.def(id);
    if (!def) return 0;
    const want = Math.min(requested, this.clarity.remaining(id));
    if (want <= 0) return 0;
    const n = Math.min(want, this.clarity.maxAffordable(id, this.wallet.get('CLA')));
    if (n <= 0) return 0;
    this.wallet.spend('CLA', this.clarity.bulkCost(id, n));
    this.clarity.incrementLevel(id, n);
    this.bus.emit('CurrencyChanged', { id: 'CLA', total: this.wallet.get('CLA') });
    this.bus.emit('UpgradePurchased', { id, level: this.clarity.level(id) });
    return n;
  }

  /** View model Clarity upgradů (Zen shop). */
  clarityView(): UpgradeView[] {
    return this.clarity.all.map((def) => {
      const maxed = this.clarity.isMaxed(def.id);
      const cost = this.clarity.nextCost(def.id) ?? BigNumber.ZERO;
      const level = this.clarity.level(def.id);
      return {
        id: def.id,
        name: def.name,
        icon: def.icon,
        description: def.description,
        level,
        maxed,
        cost,
        costCurrency: 'CLA',
        affordable: !maxed && this.wallet.canAfford('CLA', cost),
        networkDelta: 0,
        networkKind: 'none',
        locked: false,
        visible: true,
        unlockHint: undefined,
        category: 'algorithms',
        effectTotal: effectTotalLabel(def, level),
      };
    });
  }

  /** Minihra: sebere dopaminovou bublinu (manuál → stojí Pozornost, odměna × focus). */
  popBubble(id: number): BigNumber | null {
    const idx = this.bubbles.findIndex((b) => b.id === id);
    if (idx < 0) return null;
    const bubble = this.bubbles[idx]!;
    this.bubbles.splice(idx, 1);
    const focus = this.focusFactor;
    this.spendAttention(ATTENTION_COST_BUBBLE);
    const value = bubble.value.mul(BigNumber.of(focus));
    this.credit('DOP', value);
    this.bumpStreak();
    this.bus.emit('BubblePopped', { id, value });
    return value;
  }

  /** View model upgradů pro prezentaci (spodní lišta). */
  upgradeView(): UpgradeView[] {
    return this.upgrades.all.map((def) => {
      const maxed = this.upgrades.isMaxed(def.id);
      const cost = this.upgrades.nextCost(def.id) ?? BigNumber.ZERO;
      const network = this.networkImpact(def);
      const unlock = this.unlockInfo(def);
      return {
        id: def.id,
        name: def.name,
        icon: def.icon,
        description: def.description,
        level: this.upgrades.level(def.id),
        maxed,
        cost,
        costCurrency: def.cost.currency,
        affordable: !maxed && !unlock.locked && this.wallet.canAfford(def.cost.currency, cost),
        networkDelta: network.delta,
        networkKind: network.kind,
        locked: unlock.locked,
        visible: unlock.visible,
        unlockHint: unlock.locked ? unlock.hint : undefined,
        category: categoryOf(def),
        effectTotal: effectTotalLabel(def, this.upgrades.level(def.id)),
      };
    });
  }

  /** Je upgrade odemčený (splněny podmínky `unlock`)? Upgrady bez `unlock` jsou vždy odemčené. */
  isUnlocked(id: string): boolean {
    const def = this.upgrades.def(id);
    return def ? this.unlockMet(def) : false;
  }

  /** Splňuje upgrade podmínky odemčení? (prerekvizita + práh kumulovaného Dopaminu) */
  private unlockMet(def: UpgradeDef): boolean {
    const u = def.unlock;
    if (!u) return true;
    if (u.requires && this.upgrades.level(u.requires) < (u.requiresLevel ?? 1)) return false;
    if (u.dopamine !== undefined && this.totalDopamine.lt(BigNumber.of(u.dopamine))) return false;
    return true;
  }

  /**
   * Stav odemčení pro UI (T6). `locked` = nelze koupit. `visible` = ukázat v liště:
   * odemčené vždy; zamčené jen jako „teaser", když je prerekvizita splněná a práh Dopaminu
   * je aspoň z UNLOCK_TEASER_FRACTION dosažen (jinak schováno, ať se strom odhaluje postupně).
   */
  private unlockInfo(def: UpgradeDef): { locked: boolean; visible: boolean; hint: string } {
    const u = def.unlock;
    if (!u) return { locked: false, visible: true, hint: '' };
    const prereqMet = !u.requires || this.upgrades.level(u.requires) >= (u.requiresLevel ?? 1);
    const dopMet = u.dopamine === undefined || this.totalDopamine.gte(BigNumber.of(u.dopamine));
    if (prereqMet && dopMet) return { locked: false, visible: true, hint: '' };

    if (!prereqMet) {
      // Prerekvizita nesplněna → schovej úplně (žádný spoiler).
      const reqDef = this.upgrades.def(u.requires!);
      const lvl = u.requiresLevel ?? 1;
      const hint = `🔒 needs ${reqDef?.name ?? u.requires}${lvl > 1 ? ` Lv ${lvl}` : ''}`;
      return { locked: true, visible: false, hint };
    }
    // Chybí už jen práh Dopaminu → teaser, když je z poloviny dosažen.
    const threshold = BigNumber.of(u.dopamine!);
    const visible = this.totalDopamine.gte(BigNumber.of(u.dopamine! * UNLOCK_TEASER_FRACTION));
    return { locked: true, visible, hint: `🔒 ${threshold.format()} 🧠 total` };
  }

  /** Dopad upgradu na síť (pro UI: co stojí síť / co kapacitu přidává). */
  private networkImpact(def: UpgradeDef): { delta: number; kind: 'uses' | 'adds' | 'none' } {
    switch (def.effect.type) {
      case 'addPhone':
        return { delta: this.activePlatform.bandwidthPerPhone * def.effect.value, kind: 'uses' };
      case 'autoLikeRate':
      case 'autoSwipeRate':
      case 'autoCommentRate':
        return { delta: BOT_BANDWIDTH_COST, kind: 'uses' };
      case 'bandwidth':
        return { delta: def.effect.value, kind: 'adds' };
      default:
        return { delta: 0, kind: 'none' };
    }
  }

  // ── Prestige / Dopamine Overdose (Fáze 6) ───────────────────────────────────

  /** Kolik Clarity by dal prestige právě teď: floor((total/THRESH)^EXP), 0 pod prahem. */
  /** Ids kosmetik (kategorie cosmetics) – „sbírka", která přežívá prestige. */
  private get cosmeticIds(): ReadonlySet<string> {
    return new Set(this.upgrades.all.filter((d) => categoryOf(d) === 'cosmetics').map((d) => d.id));
  }

  clarityOnPrestige(): BigNumber {
    const total = this.totalDopamine;
    if (total.lt(BigNumber.of(CLARITY_THRESHOLD))) return BigNumber.ZERO;
    return bigFloor(total.div(BigNumber.of(CLARITY_THRESHOLD)).pow(CLARITY_EXP));
  }

  /** Lze teď prestižovat? (alespoň 1 Clarity k zisku) */
  get canPrestige(): boolean {
    return this.clarityOnPrestige().gte(BigNumber.ONE);
  }

  /** „Dopamine Overdose": kriticky vysoký Dopamin/s (UI flavor + pobídka k prestige). */
  get isOverdosing(): boolean {
    const dps = this.estimatedDopaminePerSecond;
    return dps.isPositive() && dps.log10() >= OVERDOSE_DPS_LOG10;
  }

  /**
   * Normalizovaný „dopamin metr" 0–1 = log10(Dopamin/s) / práh Overdose. Prezentace ho mapuje
   * na color grading (V4) a sílu chaos shaderu (V1). 0 = klid, 1 = blízko Overdose.
   */
  get dopamineMeter(): number {
    const dps = this.estimatedDopaminePerSecond;
    if (!dps.isPositive()) return 0;
    return Math.max(0, Math.min(1, dps.log10() / OVERDOSE_DPS_LOG10));
  }

  /** Doživotní statistiky (přežijí prestige). */
  get lifetimeStats(): LifetimeStats {
    return { ...this.lifetime };
  }

  /** Aktuální „Doomscroll Wrapped" data tohoto běhu (náhled bez resetu). */
  wrapped(): WrappedSummary {
    return {
      prestige: this.lifetime.prestiges + 1,
      clarityGained: this.clarityOnPrestige(),
      totalDopamine: this.totalDopamine,
      ...this.runStats,
    };
  }

  /**
   * Prestige: „Dopamine Overdose" → kolaps běhu výměnou za 🧘 Clarity. Vrací Doomscroll Wrapped,
   * nebo null pokud zatím nelze (pod prahem). Clarity + Zen upgrady přežijí; vše ostatní se resetuje.
   */
  prestige(): WrappedSummary | null {
    const gain = this.clarityOnPrestige();
    if (gain.lt(BigNumber.ONE)) return null;
    const summary = this.wrapped();

    this.lifetime.prestiges += 1;
    this.lifetime.clarityEarned = this.lifetime.clarityEarned.add(gain);
    this.lifetime.dopamineAllTime = this.lifetime.dopamineAllTime.add(this.totalDopamine);

    // Měny: vynuluj běhové, ponech a navyš Clarity.
    for (const id of ['DOP', 'LIK', 'COM', 'SHR', 'BR'] as CurrencyId[]) this.wallet.set(id, BigNumber.ZERO);
    this.wallet.add('CLA', gain);

    // Reset běhu (Clarity store NEresetujeme – je trvalý). Kosmetiky jsou „sbírka" a přežijí
    // prestige (vč. Clarity-placených a achievement-unlocked) – hráč o svůj vzhled nepřijde.
    this.upgrades.reset(this.cosmeticIds);
    this.streakValue = STREAK_FLOOR;
    this.viralityBase = 0;
    this.totalDopamine = BigNumber.ZERO;
    this.reactions.length = 0;
    this.pendingComments.clear();
    this.bubbles.length = 0;
    this.ad = null;
    this.captcha = null;
    this.autoLikeBudget = 0;
    this.autoSwipeBudget = 0;
    this.autoCommentBudget = 0;
    this.bubbleTimer = 0;
    this.adTimer = 0;
    this.captchaTimer = 0;
    this.nextBubbleIn = this.rollBubbleInterval();
    this.nextAdIn = this.rollInterval(AD_MIN_INTERVAL, AD_MAX_INTERVAL);
    this.nextCaptchaIn = this.rollInterval(CAPTCHA_MIN_INTERVAL, CAPTCHA_MAX_INTERVAL);
    this.runStats = { swipes: 0, likes: 0, comments: 0, gems: 0, jackpots: 0, seconds: 0 };
    this.swipeWaitForMode = 'none';
    this.attentionValue = this.maxAttention;

    // Platformy zpět na první (totalDopamine = 0).
    this.unlockedPlatformIds = new Set<string>();
    this.refreshUnlockedPlatforms();
    this.activePlatformId = this.platforms[0]?.id ?? DEFAULT_PLATFORM_ID;

    // Telefony zpět na jeden.
    this.phones.length = 0;
    this.nextPhoneId = 1;
    this.addPhone();

    this.bus.emit('CurrencyChanged', { id: 'CLA', total: this.wallet.get('CLA') });
    this.bus.emit('Prestiged', { summary });
    return summary;
  }

  // ── Minihry: Skip-Ad & CAPTCHA (M4) ─────────────────────────────────────────

  get adsUnlocked(): boolean {
    return this.totalDopamine.gte(BigNumber.of(AD_UNLOCK_DOPAMINE));
  }
  get captchasUnlocked(): boolean {
    return this.totalDopamine.gte(BigNumber.of(CAPTCHA_UNLOCK_DOPAMINE));
  }
  /** Aktivní reklama (pro UI / re-render po reloadu). */
  get activeAd(): { id: number; reward: BigNumber } | null {
    return this.ad ? { id: this.ad.id, reward: this.ad.reward } : null;
  }
  /** Aktivní CAPTCHA (pro UI). */
  get activeCaptcha(): { id: number; cells: boolean[]; reward: BigNumber } | null {
    return this.captcha ? { id: this.captcha.id, cells: [...this.captcha.cells], reward: this.captcha.reward } : null;
  }

  /** Skip-Ad: přeskočí reklamu → odměna Dopaminu. Vrací odměnu, nebo null. */
  skipAd(id: number): BigNumber | null {
    if (!this.ad || this.ad.id !== id) return null;
    const reward = this.ad.reward;
    this.ad = null;
    this.credit('DOP', reward);
    this.bumpStreak();
    this.bus.emit('AdSkipped', { id, reward });
    return reward;
  }

  /**
   * CAPTCHA: vyřeš výzvu výběrem dlaždic. Úspěch = vybrané indexy přesně odpovídají správným.
   * Vrací true/false (success). Při úspěchu připíše odměnu.
   */
  solveCaptcha(id: number, selected: readonly number[]): boolean {
    if (!this.captcha || this.captcha.id !== id) return false;
    const target = this.captcha.cells;
    const sel = new Set(selected);
    let success = sel.size === target.filter(Boolean).length;
    if (success) {
      for (let i = 0; i < target.length; i++) {
        if (target[i] !== sel.has(i)) {
          success = false;
          break;
        }
      }
    }
    const reward = success ? this.captcha.reward : BigNumber.ZERO;
    this.captcha = null;
    if (success) {
      this.credit('DOP', reward);
      this.bumpStreak();
    }
    this.bus.emit('CaptchaResolved', { id, success, reward });
    return success;
  }

  private rollInterval(min: number, max: number): number {
    return min + this.rng.next() * (max - min);
  }

  /** Minihra Skip-Ad: spawn/expirace (jen po odemčení dle vydělaného Dopaminu). */
  private advanceAds(dt: number): void {
    if (this.ad) {
      this.ad.remaining -= dt;
      if (this.ad.remaining <= 0) {
        const id = this.ad.id;
        this.ad = null;
        this.bus.emit('AdExpired', { id });
      }
      return;
    }
    if (!this.adsUnlocked) return;
    this.adTimer += dt;
    if (this.adTimer >= this.nextAdIn) {
      const id = this.nextAdId++;
      const reward = BigNumber.max(
        BigNumber.of(2),
        this.basePostValue.mul(this.globalSwipeMultiplier).mul(BigNumber.of(AD_REWARD_FACTOR)),
      );
      this.ad = { id, reward, remaining: AD_LIFETIME };
      this.adTimer = 0;
      this.nextAdIn = this.rollInterval(AD_MIN_INTERVAL, AD_MAX_INTERVAL);
      this.bus.emit('AdSpawned', { id, reward });
    }
  }

  /** Minihra CAPTCHA: spawn/expirace (jen po odemčení dle vydělaného Dopaminu). */
  private advanceCaptchas(dt: number): void {
    if (this.captcha) {
      this.captcha.remaining -= dt;
      if (this.captcha.remaining <= 0) {
        const id = this.captcha.id;
        this.captcha = null;
        this.bus.emit('CaptchaResolved', { id, success: false, reward: BigNumber.ZERO });
      }
      return;
    }
    if (!this.captchasUnlocked) return;
    this.captchaTimer += dt;
    if (this.captchaTimer >= this.nextCaptchaIn) {
      const cells: boolean[] = [];
      for (let i = 0; i < CAPTCHA_CELLS; i++) cells.push(this.rng.next() < CAPTCHA_TILE_CHANCE);
      if (!cells.some(Boolean)) cells[Math.floor(this.rng.next() * CAPTCHA_CELLS)] = true; // aspoň jedna
      const id = this.nextCaptchaId++;
      const reward = BigNumber.max(
        BigNumber.of(5),
        this.basePostValue.mul(this.globalSwipeMultiplier).mul(BigNumber.of(CAPTCHA_REWARD_FACTOR)),
      );
      this.captcha = { id, cells, reward, remaining: CAPTCHA_LIFETIME };
      this.captchaTimer = 0;
      this.nextCaptchaIn = this.rollInterval(CAPTCHA_MIN_INTERVAL, CAPTCHA_MAX_INTERVAL);
      this.bus.emit('CaptchaSpawned', { id, cells: [...cells], reward });
    }
  }

  // ── Achievementy & narativ „Hlas Algoritmu" (Fáze 9) ────────────────────────

  isAchievementUnlocked(id: string): boolean {
    return this.unlockedAchievements.has(id);
  }
  get achievementsUnlockedCount(): number {
    return this.unlockedAchievements.size;
  }
  get achievementsTotal(): number {
    return ACHIEVEMENTS.length;
  }

  /** View achievementů (skryté mají popis „???" dokud nejsou odemčené). */
  achievementsView(): AchievementView[] {
    return ACHIEVEMENTS.map((a) => {
      const unlocked = this.unlockedAchievements.has(a.id);
      return {
        id: a.id,
        name: a.name,
        icon: a.icon,
        unlocked,
        secret: a.secret ?? false,
        description: a.secret && !unlocked ? '??? (secret)' : a.description,
      };
    });
  }

  private achievementMet(def: AchievementDef): boolean {
    const c = def.condition;
    switch (c.kind) {
      case 'dopamine':
        return this.totalDopamine.gte(BigNumber.of(c.value));
      case 'phones':
        return this.phones.length >= c.value;
      case 'swipes':
        return this.runStats.swipes >= c.value;
      case 'jackpots':
        return this.runStats.jackpots >= c.value;
      case 'gems':
        return this.runStats.gems >= c.value;
      case 'brainRot':
        return this.wallet.get('BR').gte(BigNumber.of(c.value));
      case 'clarity':
        return this.lifetime.clarityEarned.gte(BigNumber.of(c.value));
      case 'prestiges':
        return this.lifetime.prestiges >= c.value;
      case 'platforms':
        return this.unlockedPlatformIds.size >= c.value;
      case 'upgrade':
        return this.upgrades.level(c.id) >= c.value;
    }
  }

  /** Odemkne nově splněné achievementy. `emit=false` jen tiše označí (po loadu, ať nespamuje). */
  private checkAchievements(emit = true): void {
    for (const a of ACHIEVEMENTS) {
      if (this.unlockedAchievements.has(a.id)) continue;
      if (this.achievementMet(a)) {
        this.unlockedAchievements.add(a.id);
        // Odměna: udělí kosmetiku (vizuál za hraní). Idempotentní; po loadu dorovná staré savy.
        if (a.reward && this.upgrades.def(a.reward) && this.upgrades.level(a.reward) <= 0) {
          this.upgrades.incrementLevel(a.reward, 1);
        }
        if (emit) this.bus.emit('AchievementUnlocked', { id: a.id, name: a.name, icon: a.icon });
      }
    }
  }

  private narrativeMet(t: NarrativeTrigger): boolean {
    switch (t.kind) {
      case 'dopamine':
        return this.totalDopamine.gte(BigNumber.of(t.value));
      case 'prestiges':
        return this.lifetime.prestiges >= t.value;
      case 'chaos':
        return this.chaosLevel >= t.value;
      case 'platforms':
        return this.unlockedPlatformIds.size >= t.value;
      case 'brainRot':
        return this.wallet.get('BR').gte(BigNumber.of(t.value));
      case 'overdose':
        return this.isOverdosing;
    }
  }

  /** Hlas Algoritmu: emituje nové hlášky. `emit=false` jen tiše označí jako viděné (po loadu). */
  private checkNarrative(emit = true): void {
    for (const line of NARRATIVE) {
      if (this.seenNarrative.has(line.id)) continue;
      if (this.narrativeMet(line.trigger)) {
        this.seenNarrative.add(line.id);
        if (emit) this.bus.emit('AlgorithmSpeaks', { id: line.id, text: line.text });
      }
    }
  }

  // ── Persistence & offline ───────────────────────────────────────────────────

  serialize(): SaveState {
    return {
      version: SAVE_VERSION,
      rng: this.rng.serialize(),
      wallet: this.wallet.serialize(),
      upgrades: this.upgrades.serialize(),
      streak: this.streakValue,
      virality: this.viralityBase,
      phoneCount: this.phones.length,
      activePlatform: this.activePlatformId,
      totalDopamine: this.totalDopamine.serialize(),
      clarityUpgrades: this.clarity.serialize(),
      lifetime: {
        prestiges: this.lifetime.prestiges,
        clarityEarned: this.lifetime.clarityEarned.serialize(),
        dopamineAllTime: this.lifetime.dopamineAllTime.serialize(),
      },
      run: { ...this.runStats },
      achievements: [...this.unlockedAchievements],
      narrative: [...this.seenNarrative],
    };
  }

  /** Načte uložený stav (přepíše aktuální). Telefony se obnoví v počtu, ale v bufferingu. */
  loadSave(data: SaveState): void {
    this.rng.restore(data.rng);
    this.wallet.load(data.wallet);
    this.upgrades.loadLevels(data.upgrades);
    this.clarity.reset();
    if (data.clarityUpgrades) this.clarity.loadLevels(data.clarityUpgrades);
    this.streakValue = data.streak;
    this.viralityBase = data.virality;
    this.reactions.length = 0;
    this.pendingComments.clear();
    this.bubbles.length = 0;
    this.bubbleTimer = 0;
    this.nextBubbleIn = this.rollBubbleInterval();
    this.ad = null;
    this.captcha = null;
    this.adTimer = 0;
    this.captchaTimer = 0;
    this.nextAdIn = this.rollInterval(AD_MIN_INTERVAL, AD_MAX_INTERVAL);
    this.nextCaptchaIn = this.rollInterval(CAPTCHA_MIN_INTERVAL, CAPTCHA_MAX_INTERVAL);
    this.autoLikeBudget = 0;
    this.autoSwipeBudget = 0;
    this.autoCommentBudget = 0;
    // Lifetime + run statistiky (volitelné – staré save je nemají).
    this.lifetime = data.lifetime
      ? {
          prestiges: data.lifetime.prestiges,
          clarityEarned: BigNumber.deserialize(data.lifetime.clarityEarned),
          dopamineAllTime: BigNumber.deserialize(data.lifetime.dopamineAllTime),
        }
      : { prestiges: 0, clarityEarned: BigNumber.ZERO, dopamineAllTime: BigNumber.ZERO };
    this.runStats = data.run
      ? { ...data.run }
      : { swipes: 0, likes: 0, comments: 0, gems: 0, jackpots: 0, seconds: 0 };
    this.attentionValue = MAX_ATTENTION;
    // Platformy: obnov kumulovaný Dopamin, dopočítej odemčené, ověř aktivní.
    this.totalDopamine = data.totalDopamine ? BigNumber.deserialize(data.totalDopamine) : BigNumber.ZERO;
    this.unlockedPlatformIds = new Set<string>();
    this.refreshUnlockedPlatforms();
    const wantedPlatform = data.activePlatform ?? this.platforms[0]?.id ?? DEFAULT_PLATFORM_ID;
    this.activePlatformId = this.unlockedPlatformIds.has(wantedPlatform)
      ? wantedPlatform
      : (this.platforms[0]?.id ?? DEFAULT_PLATFORM_ID);
    this.phones.length = 0;
    this.nextPhoneId = 1;
    const count = Math.max(1, Math.floor(data.phoneCount));
    for (let i = 0; i < count; i++) this.addPhone();

    // Achievementy + narativ (F9): obnov ze save, pak tiše dorovnej už splněné (ať load nespamuje).
    this.unlockedAchievements.clear();
    for (const id of data.achievements ?? []) this.unlockedAchievements.add(id);
    this.seenNarrative.clear();
    for (const id of data.narrative ?? []) this.seenNarrative.add(id);
    this.checkAchievements(false);
    this.checkNarrative(false);
  }

  /**
   * Spočítá a připíše offline těžbu za `seconds` (zastropováno na MAX_OFFLINE_SECONDS).
   * Předpokládá ustálený stav (rate × čas) – standardní idle aproximace.
   */
  computeOfflineEarnings(seconds: number): OfflineEarnings {
    const cap = this.maxOfflineSeconds;
    const capped = Math.max(0, Math.min(seconds, cap));
    const wasCapped = seconds > cap;
    const swipesPerSec = this.effectiveSwipesPerSecond();
    if (swipesPerSec <= 0 || capped <= 0) {
      return {
        seconds: capped,
        capped: wasCapped,
        dopamine: BigNumber.ZERO,
        likes: BigNumber.ZERO,
        comments: BigNumber.ZERO,
      };
    }

    // Offline jsou boti jen částečně efektivní (offlineEfficiency – base + upgrady Vlny 2).
    const eff = capped * this.offlineEfficiency;
    const perSwipe = this.basePostValue
      .mul(this.globalSwipeMultiplier)
      .mul(BigNumber.of(expectedRarityMultiplier(this.virality)))
      .mul(BigNumber.of(this.expectedCritFactor));
    const dopamine = perSwipe.mul(BigNumber.of(swipesPerSec * eff));
    // Lajky/komentáře nemůžou překročit počet vyrobených postů.
    const likes = this.likeYield.mul(BigNumber.of(Math.min(this.autoLikeRate, swipesPerSec) * eff));
    const comments = BigNumber.of(Math.min(this.autoCommentRate, swipesPerSec) * eff);

    if (dopamine.isPositive()) this.credit('DOP', dopamine);
    if (likes.isPositive()) this.credit('LIK', likes);
    if (comments.isPositive()) this.credit('COM', comments);
    return { seconds: capped, capped: wasCapped, dopamine, likes, comments };
  }

  // ── Tick (Tickable) ─────────────────────────────────────────────────────────

  advance(dt: number): void {
    this.attentionValue = Math.min(
      this.maxAttention,
      this.attentionValue + ATTENTION_REGEN * this.attentionRegenMultiplier * dt,
    );
    this.setStreak(Math.max(STREAK_FLOOR, this.streakValue - STREAK_DECAY * dt));
    // Přetížení sítě zpomalí buffering; upgrady rychlosti (Vlna 2) ho naopak zrychlí.
    const scale = this.bandwidthBufferScale * this.bufferSpeedMultiplier;
    for (const phone of this.phones) {
      const tick = phone.advance(dt, scale);
      if (tick?.type === 'ready') {
        this.bus.emit('PostReady', { phoneId: phone.id, rarity: tick.rarity });
      }
    }
    this.processBots(dt);
    this.advanceReactions(dt);
    this.advanceBubbles(dt);
    this.advanceAds(dt);
    this.advanceCaptchas(dt);
    this.checkPlatformUnlocks();
    this.checkAchievements();
    this.checkNarrative();
    this.runStats.seconds += dt;
  }

  /** Odemkne platformy, jejichž práh kumulovaného Dopaminu byl právě překročen. */
  private checkPlatformUnlocks(): void {
    for (const p of this.platforms) {
      if (!this.unlockedPlatformIds.has(p.id) && this.totalDopamine.gte(BigNumber.of(p.unlockAtDopamine))) {
        this.unlockedPlatformIds.add(p.id);
        this.bus.emit('PlatformUnlocked', { id: p.id });
      }
    }
  }

  /** Je minihra s bublinami odemčená? (upgrade Dopamine Detector) */
  get bubblesUnlocked(): boolean {
    return this.sumEffect('bubbleUnlock') > 0;
  }

  /** Minihra: spawn/expirace dopaminových bublin (spawn jen pokud odemčeno). */
  private advanceBubbles(dt: number): void {
    if (this.bubblesUnlocked) {
      this.bubbleTimer += dt;
      if (this.bubbleTimer >= this.nextBubbleIn && this.bubbles.length < MAX_BUBBLES) {
        this.spawnBubble();
      }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i]!;
      bubble.remaining -= dt;
      if (bubble.remaining <= 0) {
        this.bubbles.splice(i, 1);
        this.bus.emit('BubbleExpired', { id: bubble.id });
      }
    }
  }

  private spawnBubble(): void {
    const id = this.nextBubbleId++;
    const value = this.bubbleValue();
    this.bubbles.push({ id, value, remaining: BUBBLE_LIFETIME });
    this.bubbleTimer = 0;
    this.nextBubbleIn = this.rollBubbleInterval();
    this.bus.emit('BubbleSpawned', { id, value });
  }

  /** Hodnota bubliny ≈ 2 swipy × upgrady hodnoty. */
  private bubbleValue(): BigNumber {
    const perSwipe = this.basePostValue.mul(this.productionMultiplier);
    const raw = perSwipe.mul(BigNumber.of(BUBBLE_REWARD_FACTOR)).mul(this.bubbleValueMultiplier());
    return BigNumber.max(BigNumber.of(BUBBLE_MIN_REWARD), raw);
  }

  private bubbleValueMultiplier(): BigNumber {
    return this.effectProduct('bubbleValueMult');
  }

  private rollBubbleInterval(): number {
    const base = BUBBLE_MIN_INTERVAL + this.rng.next() * (BUBBLE_MAX_INTERVAL - BUBBLE_MIN_INTERVAL);
    let rate = 1;
    for (const def of this.upgrades.all) {
      if (def.effect.type === 'bubbleRate') {
        rate *= Math.pow(def.effect.value, this.upgrades.level(def.id));
      }
    }
    return base / rate;
  }

  /**
   * Boti obsluhují telefony rychlostí danou levelem. Pořadí: nejdřív lajk, pak komentář,
   * nakonec swipe (po prodlevě) — interakce tak proběhnou před zahozením postu. Když bot
   * nestíhá (málo levelů na hodně telefonů), posty se zahodí nelajknuté/nezakomentované.
   */
  private processBots(dt: number): void {
    this.autoLikeBudget = Math.min(MAX_BOT_BUDGET, this.autoLikeBudget + this.autoLikeRate * dt);
    this.autoCommentBudget = Math.min(MAX_BOT_BUDGET, this.autoCommentBudget + this.autoCommentRate * dt);
    this.autoSwipeBudget = Math.min(MAX_BOT_BUDGET, this.autoSwipeBudget + this.autoSwipeRate * dt);

    while (this.autoLikeBudget >= 1) {
      const phone = this.phones.find((p) => p.canLike);
      if (!phone) break;
      this.like(phone.id, false);
      this.autoLikeBudget -= 1;
    }
    while (this.autoCommentBudget >= 1) {
      const phone = this.phones.find((p) => p.canComment);
      if (!phone) break;
      this.autoCommentPhone(phone.id);
      this.autoCommentBudget -= 1;
    }
    while (this.autoSwipeBudget >= 1) {
      const phone = this.phones.find((p) => this.canAutoSwipe(p));
      if (!phone) break;
      this.swipe(phone.id, false);
      this.autoSwipeBudget -= 1;
    }
  }

  /** Auto-commenter: vybere náhodný komentář a postne ho (vyřeší ruletu sám, bez pozornosti). */
  private autoCommentPhone(phoneId: number): void {
    const def = this.comments.offer(this.rng, 1)[0];
    if (def) this.postComment(phoneId, def.id, false);
  }

  /** Postupné „naskakování" reakcí na komentáře a průběžné připisování odměn. */
  private advanceReactions(dt: number): void {
    if (this.reactions.length === 0) return;
    for (let i = this.reactions.length - 1; i >= 0; i--) {
      const r = this.reactions[i]!;
      r.elapsed += dt;
      const p = Math.min(1, r.elapsed / r.duration);

      const targetLikes = Math.round(p * r.result.likes);
      while (r.emittedLikes < targetLikes) {
        r.emittedLikes++;
        this.wallet.add('LIK', BigNumber.ONE);
        this.bus.emit('CommentReaction', { phoneId: r.phoneId, kind: 'like', emitted: r.emittedLikes });
      }
      const targetDislikes = Math.round(p * r.result.dislikes);
      while (r.emittedDislikes < targetDislikes) {
        r.emittedDislikes++;
        this.bus.emit('CommentReaction', { phoneId: r.phoneId, kind: 'dislike', emitted: r.emittedDislikes });
      }

      const fracDelta = p - r.creditedFraction;
      if (fracDelta > 0) {
        const f = BigNumber.of(fracDelta);
        if (r.result.dopamine.isPositive()) this.wallet.add('DOP', r.result.dopamine.mul(f));
        if (r.result.brainRot.isPositive()) this.wallet.add('BR', r.result.brainRot.mul(f));
        if (r.result.penalty.isPositive()) {
          const pen = r.result.penalty.mul(f);
          this.wallet.spend('DOP', BigNumber.min(this.wallet.get('DOP'), pen));
        }
        r.creditedFraction = p;
      }

      if (p >= 1) {
        this.bus.emit('CurrencyChanged', { id: 'DOP', total: this.wallet.get('DOP') });
        this.bus.emit('CurrencyChanged', { id: 'LIK', total: this.wallet.get('LIK') });
        this.bus.emit('CurrencyChanged', { id: 'BR', total: this.wallet.get('BR') });
        if (r.result.outcome === 'viral') {
          this.bumpStreak();
          this.credit('SHR', BigNumber.ONE); // viral komentář se sdílí (M2)
        } else if (r.result.outcome === 'flop') {
          this.dampStreak();
        }
        this.bus.emit('CommentResolved', { phoneId: r.phoneId, result: r.result });
        this.reactions.splice(i, 1);
      }
    }
  }

  // ── Vnitřní helpery ─────────────────────────────────────────────────────────

  private applyEffect(def: UpgradeDef, times: number): void {
    switch (def.effect.type) {
      case 'addPhone':
        for (let i = 0; i < times * def.effect.value; i++) this.addPhone();
        break;
      case 'dopamineMultiplier':
        // čte se dynamicky v productionMultiplier – žádná akce není potřeba.
        break;
      case 'bandwidth':
        // čte se dynamicky v totalBandwidth – žádná akce není potřeba.
        break;
      case 'autoLikeRate':
      case 'autoSwipeRate':
      case 'autoCommentRate':
        // čtou se dynamicky v processBots – žádná akce není potřeba.
        break;
      case 'bubbleUnlock':
      case 'bubbleValueMult':
      case 'bubbleRate':
        // čtou se dynamicky v minihře – žádná akce není potřeba.
        break;
      case 'virality':
      case 'consumptionMultiplier':
      // ── Vlna 2: vše čteno dynamicky přes gettery – žádná akce při nákupu ──
      case 'bufferSpeedMult':
      case 'attentionMaxMult':
      case 'attentionRegenMult':
      case 'streakCapBonus':
      case 'critChance':
      case 'critMult':
      case 'offlineEfficiencyBonus':
      case 'offlineCapHours':
      case 'bandwidthMult':
        // čtou se dynamicky (gettery) – žádná akce není potřeba.
        break;
    }
  }

  /** Součet hodnot daného aditivního efektu (effect i sideEffect) × level. */
  private sumEffect(type: UpgradeDef['effect']['type'], store: UpgradeStore = this.upgrades): number {
    let sum = 0;
    for (const def of store.all) {
      const lvl = store.level(def.id);
      if (lvl <= 0) continue;
      if (def.effect.type === type) sum += def.effect.value * lvl;
      if (def.sideEffect?.type === type) sum += def.sideEffect.value * lvl;
    }
    return sum;
  }

  private generatePost(): Post {
    return { rarity: rollRarity(this.virality, this.rng), baseValue: this.basePostValue };
  }

  private getPhone(id: number): Phone | undefined {
    return this.phones.find((p) => p.id === id);
  }

  private globalMultiplier(): BigNumber {
    return BigNumber.of(this.streakValue).mul(this.globalSwipeMultiplier);
  }

  private reactionContext(): ReactionContext {
    return {
      ...DEFAULT_REACTION_CONTEXT,
      notificationDensity: 1 + 0.1 * (this.phones.length - 1),
    };
  }

  private credit(id: CurrencyId, amount: BigNumber): void {
    this.wallet.add(id, amount);
    if (id === 'DOP') this.totalDopamine = this.totalDopamine.add(amount);
    this.bus.emit('CurrencyChanged', { id, total: this.wallet.get(id) });
  }

  private bumpStreak(): void {
    this.setStreak(Math.min(this.streakMax, this.streakValue + STREAK_STEP));
  }

  private dampStreak(): void {
    this.setStreak(Math.max(STREAK_FLOOR, this.streakValue - STREAK_STEP * 3));
  }

  private setStreak(value: number): void {
    if (value === this.streakValue) return;
    this.streakValue = value;
    this.bus.emit('StreakChanged', { value });
  }
}
