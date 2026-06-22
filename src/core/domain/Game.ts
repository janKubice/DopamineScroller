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

// ── Rebalance (#5): měkký strop globálního multiplikátoru produkce ──
// Pod prahem se nic nemění (zachová early/mid balanc), nad ním se exponenciální exploze
// stlačí v log prostoru (klesající výnos), ať se hra „od jisté fáze nezlomí".
const PRODUCTION_SOFTCAP_LOG10 = 6; // práh ×1e6 produkce
const PRODUCTION_COMPRESSION = 0.5; // nad prahem se každý řád počítá jen z poloviny

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
  return {
    legendary: 0.001 * (1 + virality),
    epic: 0.01 * (1 + virality),
    rare: 0.05 * (1 + virality),
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

/** Na co má auto-scroller čekat, než post swipne (M1/T4). */
export type SwipeWaitMode = 'none' | 'like' | 'comment' | 'both';

export interface GameOptions {
  seed?: number;
  comments?: CommentPool;
  upgrades?: readonly UpgradeDef[];
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
      this.synergyShareVirality
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

  /** Surový součin dopamineMultiplier (před měkkým stropem) – pro UI/diagnostiku. */
  get rawProductionMultiplier(): BigNumber {
    return this.effectProduct('dopamineMultiplier');
  }

  /**
   * Globální multiplikátor produkce z algoritmů + Brain Rot (součin dopamineMultiplier),
   * nad prahem PRODUCTION_SOFTCAP zploštěný (rebalance #5 – brzdí exponenciální explozi).
   */
  get productionMultiplier(): BigNumber {
    return softCapLog10(this.rawProductionMultiplier, PRODUCTION_SOFTCAP_LOG10, PRODUCTION_COMPRESSION);
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
    return STREAK_MAX + this.sumEffect('streakCapBonus');
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
    return Math.min(OFFLINE_EFFICIENCY_CAP, OFFLINE_EFFICIENCY + this.sumEffect('offlineEfficiencyBonus'));
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
  private effectProduct(type: UpgradeDef['effect']['type']): BigNumber {
    let mult = BigNumber.ONE;
    for (const def of this.upgrades.all) {
      const lvl = this.upgrades.level(def.id);
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
    return total * this.effectProduct('bandwidthMult').toNumber();
  }

  /** Násobič rychlosti bufferingu z upgradů (Vlna 2): > 1 = posty se načítají rychleji. */
  get bufferSpeedMultiplier(): number {
    return this.effectProduct('bufferSpeedMult').toNumber();
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
      this.bus.emit('Jackpot', { phoneId, dopamine, multiplier });
    }
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
    };
  }

  /** Načte uložený stav (přepíše aktuální). Telefony se obnoví v počtu, ale v bufferingu. */
  loadSave(data: SaveState): void {
    this.rng.restore(data.rng);
    this.wallet.load(data.wallet);
    this.upgrades.loadLevels(data.upgrades);
    this.streakValue = data.streak;
    this.viralityBase = data.virality;
    this.reactions.length = 0;
    this.pendingComments.clear();
    this.bubbles.length = 0;
    this.bubbleTimer = 0;
    this.nextBubbleIn = this.rollBubbleInterval();
    this.autoLikeBudget = 0;
    this.autoSwipeBudget = 0;
    this.autoCommentBudget = 0;
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
    this.checkPlatformUnlocks();
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
  private sumEffect(type: UpgradeDef['effect']['type']): number {
    let sum = 0;
    for (const def of this.upgrades.all) {
      const lvl = this.upgrades.level(def.id);
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
