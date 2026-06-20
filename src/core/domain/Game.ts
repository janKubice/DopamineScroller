import { EventBus, type EventMap } from '../events/EventBus';
import { Wallet } from '../economy/Wallet';
import type { CurrencyId } from '../economy/currencies';
import { BigNumber } from '../math/BigNumber';
import { Rng } from '../math/Rng';
import { GameClock, type Tickable } from '../time/GameClock';
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
  CommentPosted: { phoneId: number; result: CommentResult };
  CurrencyChanged: { id: CurrencyId; total: BigNumber };
  StreakChanged: { value: number };
}

// ── Balanc konstanty (Fáze 9 je externalizuje do dat) ──
const STREAK_FLOOR = 1;
const STREAK_MAX = 3;
const STREAK_STEP = 0.1;
const STREAK_DECAY = 0.2; // za sekundu
const BASE_POST_VALUE = BigNumber.of(1); // Text-It: nízký base Dopamin

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

export interface GameOptions {
  seed?: number;
  comments?: CommentPool;
  phoneConfig?: PhoneConfig;
}

/**
 * Game — kořenový herní stav a orchestrátor. Implementuje Tickable (krokuje ho GameClock).
 * Drží peněženku, RNG, telefony, streak a komentářový pool; emituje eventy přes EventBus.
 * Prezentace volá Commands (swipe/like/offerComments/postComment) a odebírá eventy.
 */
export class Game implements Tickable {
  readonly bus = new EventBus<GameEvents>();
  readonly wallet = new Wallet();
  readonly rng: Rng;
  readonly clock: GameClock;
  readonly phones: Phone[] = [];

  private readonly comments: CommentPool;
  private readonly pendingComments = new Map<number, CommentDef[]>();
  private streakValue = STREAK_FLOOR;
  private virality = 0;
  private nextPhoneId = 1;
  private readonly likeYield = BigNumber.ONE;

  constructor(options: GameOptions = {}) {
    this.rng = new Rng(options.seed ?? 1);
    this.comments = options.comments ?? CommentPool.default();
    this.clock = new GameClock(this);
    this.addPhone(options.phoneConfig ?? DEFAULT_PHONE_CONFIG);
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
    if (!phone || !phone.isReady) return null;
    const offered = this.comments.offer(this.rng, count);
    this.pendingComments.set(phoneId, offered);
    return offered;
  }

  /** Komentářová ruleta, krok 2: postne vybraný komentář a vyhodnotí reakce. */
  postComment(phoneId: number, commentId: string): CommentResult | null {
    const phone = this.getPhone(phoneId);
    if (!phone || !phone.isReady) return null;
    const offered = this.pendingComments.get(phoneId);
    const def = offered?.find((c) => c.id === commentId) ?? this.comments.byId(commentId);
    if (!def) return null;

    const result = this.comments.resolve(def, this.reactionContext(), this.rng);
    this.pendingComments.delete(phoneId);

    if (result.dopamine.isPositive()) this.credit('DOP', result.dopamine);
    if (result.brainRot.isPositive()) this.credit('BR', result.brainRot);
    if (result.penalty.isPositive()) this.debit('DOP', result.penalty);
    if (result.likes > 0) this.credit('LIK', BigNumber.of(result.likes));
    this.credit('COM', BigNumber.ONE);

    if (result.outcome === 'viral') this.bumpStreak();
    else if (result.outcome === 'flop') this.dampStreak();

    this.bus.emit('CommentPosted', { phoneId, result });
    return result;
  }

  // ── Tick (Tickable) ─────────────────────────────────────────────────────────

  advance(dt: number): void {
    this.setStreak(Math.max(STREAK_FLOOR, this.streakValue - STREAK_DECAY * dt));
    for (const phone of this.phones) {
      const tick = phone.advance(dt);
      if (tick?.type === 'ready') {
        this.bus.emit('PostReady', { phoneId: phone.id, rarity: tick.rarity });
      }
    }
  }

  // ── Vnitřní helpery ─────────────────────────────────────────────────────────

  private generatePost(): Post {
    return { rarity: rollRarity(this.virality, this.rng), baseValue: BASE_POST_VALUE };
  }

  private getPhone(id: number): Phone | undefined {
    return this.phones.find((p) => p.id === id);
  }

  private globalMultiplier(): BigNumber {
    return BigNumber.of(this.streakValue);
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

  private debit(id: CurrencyId, amount: BigNumber): void {
    const actual = BigNumber.min(this.wallet.get(id), amount);
    this.wallet.spend(id, actual);
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
