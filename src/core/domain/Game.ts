import { EventBus, type EventMap } from '../events/EventBus';
import { Wallet } from '../economy/Wallet';
import { UpgradeStore } from '../economy/UpgradeStore';
import { bufferScale, bandwidthLoad } from '../economy/Bandwidth';
import type { CurrencyId } from '../economy/currencies';
import { SAVE_VERSION, type SaveState } from '../persistence/SaveData';
import { BigNumber } from '../math/BigNumber';
import { Rng } from '../math/Rng';
import { GameClock, type Tickable } from '../time/GameClock';
import { UPGRADES, type UpgradeDef } from '../content/upgrades';
import {
  Phone,
  DEFAULT_PHONE_CONFIG,
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
  Liked: { phoneId: number; likes: BigNumber };
  CommentPosted: { phoneId: number; commentId: string };
  /** Jeden „naskočený" lajk/dislajk během reakce na komentář. */
  CommentReaction: { phoneId: number; kind: 'like' | 'dislike'; emitted: number };
  /** Konec reakce – outcome se hráči ukáže AŽ tady (opožděně). */
  CommentResolved: { phoneId: number; result: CommentResult };
  CurrencyChanged: { id: CurrencyId; total: BigNumber };
  StreakChanged: { value: number };
  UpgradePurchased: { id: string; level: number };
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
}

// ── Balanc konstanty (Fáze 9 je externalizuje do dat) ──
const STREAK_FLOOR = 1;
const STREAK_MAX = 3;
const STREAK_STEP = 0.1;
const STREAK_DECAY = 0.2; // za sekundu
const BASE_POST_VALUE = BigNumber.of(1); // Text-It: nízký base Dopamin
const BASE_BANDWIDTH = 3; // Mbps – domácí Wi-Fi na startu
const PHONE_BANDWIDTH_COST = 1; // Mbps spotřeby na jeden telefon
const BOT_BANDWIDTH_COST = 0.5; // Mbps spotřeby na úroveň bota
const MAX_OFFLINE_SECONDS = 8 * 3600; // strop offline těžby (8 h)

// ── Minihra: dopaminové bubliny ──
const BUBBLE_MIN_INTERVAL = 2.5; // s mezi spawny (min)
const BUBBLE_MAX_INTERVAL = 5; // s mezi spawny (max)
const BUBBLE_LIFETIME = 4; // s než bublina zmizí
const MAX_BUBBLES = 3; // max bublin naráz
const BUBBLE_REWARD_FACTOR = 5; // hodnota ≈ 5 swipů
const BUBBLE_MIN_REWARD = 3; // minimální odměna early game

/** Doba, po kterou reakce na komentář „naskakuje" (liky/disliky v čase). */
export const REACTION_WINDOW = 4; // s

function rollRarity(virality: number, rng: Rng): Rarity {
  const r = rng.next();
  const legendary = 0.001 * (1 + virality);
  const epic = 0.01 * (1 + virality);
  const rare = 0.05 * (1 + virality);
  if (r < legendary) return 'legendary';
  if (r < legendary + epic) return 'epic';
  if (r < legendary + epic + rare) return 'rare';
  return 'common';
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

export interface GameOptions {
  seed?: number;
  comments?: CommentPool;
  upgrades?: readonly UpgradeDef[];
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
  private streakValue = STREAK_FLOOR;
  private virality = 0;
  private nextPhoneId = 1;
  private readonly likeYield = BigNumber.ONE;

  constructor(options: GameOptions = {}) {
    this.rng = new Rng(options.seed ?? 1);
    this.comments = options.comments ?? CommentPool.default();
    this.upgrades = new UpgradeStore(options.upgrades ?? UPGRADES);
    this.clock = new GameClock(this);
    this.addPhone(options.phoneConfig ?? DEFAULT_PHONE_CONFIG);
    this.nextBubbleIn = this.rollBubbleInterval();
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

  /** Globální multiplikátor produkce z algoritmů (součin koupených dopamineMultiplier). */
  get productionMultiplier(): BigNumber {
    let mult = BigNumber.ONE;
    for (const def of this.upgrades.all) {
      if (def.effect.type === 'dopamineMultiplier') {
        const lvl = this.upgrades.level(def.id);
        if (lvl > 0) mult = mult.mul(BigNumber.of(def.effect.value).pow(lvl));
      }
    }
    return mult;
  }

  /** Celková kapacita sítě (Mbps): základ + síťové upgrady. */
  get totalBandwidth(): number {
    let total = BASE_BANDWIDTH;
    for (const def of this.upgrades.all) {
      if (def.effect.type === 'bandwidth') {
        total += def.effect.value * this.upgrades.level(def.id);
      }
    }
    return total;
  }

  /** Aktuální spotřeba sítě (Mbps): telefony + boti. */
  get bandwidthConsumption(): number {
    let c = this.phones.length * PHONE_BANDWIDTH_COST;
    for (const def of this.upgrades.all) {
      if (def.effect.type === 'passiveDopamine' || def.effect.type === 'passiveLikes') {
        c += BOT_BANDWIDTH_COST * this.upgrades.level(def.id);
      }
    }
    return c;
  }

  /** Pasivní Dopamin/s z botů (auto-scroller). Násoben algoritmy i penalizací sítě. */
  get passiveDopamineRate(): BigNumber {
    const base = this.sumEffect('passiveDopamine');
    if (base === 0) return BigNumber.ZERO;
    const scale = bufferScale(this.bandwidthConsumption, this.totalBandwidth);
    return BigNumber.of(base).mul(this.productionMultiplier).mul(BigNumber.of(scale));
  }

  /** Pasivní Likes/s z botů (auto-liker). Násobeno penalizací sítě. */
  get passiveLikesRate(): BigNumber {
    const base = this.sumEffect('passiveLikes');
    if (base === 0) return BigNumber.ZERO;
    const scale = bufferScale(this.bandwidthConsumption, this.totalBandwidth);
    return BigNumber.of(base).mul(BigNumber.of(scale));
  }

  /** Zatížení sítě (spotřeba / kapacita). > 1 = přetížení. */
  get bandwidthLoad(): number {
    return bandwidthLoad(this.bandwidthConsumption, this.totalBandwidth);
  }

  get isOverloaded(): boolean {
    return this.bandwidthLoad > 1;
  }

  // ── Commands (Prezentace → Doména) ──────────────────────────────────────────

  swipe(phoneId: number): SwipeResult | null {
    const phone = this.getPhone(phoneId);
    if (!phone) return null;
    const result = phone.swipe(this.globalMultiplier());
    if (!result) return null;
    this.credit('DOP', result.dopamine);
    this.bumpStreak();
    this.bus.emit('SwipeResolved', { phoneId, dopamine: result.dopamine, rarity: result.rarity });
    if (result.rarity !== 'common') {
      this.bus.emit('HiddenGemFound', { phoneId, rarity: result.rarity });
    }
    return result;
  }

  like(phoneId: number): BigNumber | null {
    const phone = this.getPhone(phoneId);
    if (!phone) return null;
    const gained = phone.like(this.likeYield);
    if (!gained) return null;
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
  postComment(phoneId: number, commentId: string): boolean {
    const phone = this.getPhone(phoneId);
    if (!phone || !phone.canComment) return false;
    const offered = this.pendingComments.get(phoneId);
    const def = offered?.find((c) => c.id === commentId) ?? this.comments.byId(commentId);
    if (!def) return false;

    const result = this.comments.resolve(def, this.reactionContext(), this.rng);
    this.pendingComments.delete(phoneId);
    phone.markCommented();
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

  /** Minihra: sebere dopaminovou bublinu, připíše Dopamin a posílí streak. */
  popBubble(id: number): BigNumber | null {
    const idx = this.bubbles.findIndex((b) => b.id === id);
    if (idx < 0) return null;
    const bubble = this.bubbles[idx]!;
    this.bubbles.splice(idx, 1);
    this.credit('DOP', bubble.value);
    this.bumpStreak();
    this.bus.emit('BubblePopped', { id, value: bubble.value });
    return bubble.value;
  }

  /** View model upgradů pro prezentaci (spodní lišta). */
  upgradeView(): UpgradeView[] {
    return this.upgrades.all.map((def) => {
      const maxed = this.upgrades.isMaxed(def.id);
      const cost = this.upgrades.nextCost(def.id) ?? BigNumber.ZERO;
      return {
        id: def.id,
        name: def.name,
        icon: def.icon,
        description: def.description,
        level: this.upgrades.level(def.id),
        maxed,
        cost,
        costCurrency: def.cost.currency,
        affordable: !maxed && this.wallet.canAfford(def.cost.currency, cost),
      };
    });
  }

  // ── Persistence & offline ───────────────────────────────────────────────────

  serialize(): SaveState {
    return {
      version: SAVE_VERSION,
      rng: this.rng.serialize(),
      wallet: this.wallet.serialize(),
      upgrades: this.upgrades.serialize(),
      streak: this.streakValue,
      virality: this.virality,
      phoneCount: this.phones.length,
    };
  }

  /** Načte uložený stav (přepíše aktuální). Telefony se obnoví v počtu, ale v bufferingu. */
  loadSave(data: SaveState): void {
    this.rng.restore(data.rng);
    this.wallet.load(data.wallet);
    this.upgrades.loadLevels(data.upgrades);
    this.streakValue = data.streak;
    this.virality = data.virality;
    this.reactions.length = 0;
    this.pendingComments.clear();
    this.bubbles.length = 0;
    this.bubbleTimer = 0;
    this.nextBubbleIn = this.rollBubbleInterval();
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
    const capped = Math.max(0, Math.min(seconds, MAX_OFFLINE_SECONDS));
    const t = BigNumber.of(capped);
    const dopamine = this.passiveDopamineRate.mul(t);
    const likes = this.passiveLikesRate.mul(t);
    if (dopamine.isPositive()) this.credit('DOP', dopamine);
    if (likes.isPositive()) this.credit('LIK', likes);
    return { seconds: capped, capped: seconds > MAX_OFFLINE_SECONDS, dopamine, likes };
  }

  // ── Tick (Tickable) ─────────────────────────────────────────────────────────

  advance(dt: number): void {
    this.setStreak(Math.max(STREAK_FLOOR, this.streakValue - STREAK_DECAY * dt));
    // Přetížení sítě zpomalí buffering všech telefonů stejně.
    const scale = bufferScale(this.bandwidthConsumption, this.totalBandwidth);
    for (const phone of this.phones) {
      const tick = phone.advance(dt, scale);
      if (tick?.type === 'ready') {
        this.bus.emit('PostReady', { phoneId: phone.id, rarity: tick.rarity });
      }
    }
    this.advanceReactions(dt);
    this.advancePassive(dt);
    this.advanceBubbles(dt);
  }

  /** Minihra: spawn/expirace dopaminových bublin. */
  private advanceBubbles(dt: number): void {
    this.bubbleTimer += dt;
    if (this.bubbleTimer >= this.nextBubbleIn && this.bubbles.length < MAX_BUBBLES) {
      this.spawnBubble();
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

  /** Hodnota bubliny ≈ 5 swipů, aby zůstala relevantní i v mid game. */
  private bubbleValue(): BigNumber {
    const perSwipe = BASE_POST_VALUE.mul(this.productionMultiplier);
    return BigNumber.max(BigNumber.of(BUBBLE_MIN_REWARD), perSwipe.mul(BigNumber.of(BUBBLE_REWARD_FACTOR)));
  }

  private rollBubbleInterval(): number {
    return BUBBLE_MIN_INTERVAL + this.rng.next() * (BUBBLE_MAX_INTERVAL - BUBBLE_MIN_INTERVAL);
  }

  /** Pasivní příjem z botů (čte se přímo, HUD si HUD aktualizuje sám). */
  private advancePassive(dt: number): void {
    const dop = this.passiveDopamineRate;
    if (dop.isPositive()) this.wallet.add('DOP', dop.mul(BigNumber.of(dt)));
    const lik = this.passiveLikesRate;
    if (lik.isPositive()) this.wallet.add('LIK', lik.mul(BigNumber.of(dt)));
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
        if (r.result.outcome === 'viral') this.bumpStreak();
        else if (r.result.outcome === 'flop') this.dampStreak();
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
      case 'passiveDopamine':
      case 'passiveLikes':
        // čtou se dynamicky v passive*Rate – žádná akce není potřeba.
        break;
    }
  }

  /** Součet hodnot daného typu efektu napříč koupenými upgrady (value × level). */
  private sumEffect(type: UpgradeDef['effect']['type']): number {
    let sum = 0;
    for (const def of this.upgrades.all) {
      if (def.effect.type === type) sum += def.effect.value * this.upgrades.level(def.id);
    }
    return sum;
  }

  private generatePost(): Post {
    return { rarity: rollRarity(this.virality, this.rng), baseValue: BASE_POST_VALUE };
  }

  private getPhone(id: number): Phone | undefined {
    return this.phones.find((p) => p.id === id);
  }

  private globalMultiplier(): BigNumber {
    return BigNumber.of(this.streakValue).mul(this.productionMultiplier);
  }

  private reactionContext(): ReactionContext {
    return {
      ...DEFAULT_REACTION_CONTEXT,
      notificationDensity: 1 + 0.1 * (this.phones.length - 1),
    };
  }

  private credit(id: CurrencyId, amount: BigNumber): void {
    this.wallet.add(id, amount);
    this.bus.emit('CurrencyChanged', { id, total: this.wallet.get(id) });
  }

  private bumpStreak(): void {
    this.setStreak(Math.min(STREAK_MAX, this.streakValue + STREAK_STEP));
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
