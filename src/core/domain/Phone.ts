import { BigNumber } from '../math/BigNumber';

/**
 * Phone — stavový automat jednoho telefonu. Viz docs/GDD-01-CoreLoop.md §1.
 *
 *   buffering ──(bufferTime hotovo)──> ready ──(swipe)──> swiping ──> buffering
 *                                        │
 *                              (like / comment řeší Game)
 *
 * Na jeden načtený post lze dát Like a Komentář vždy jen JEDNOU (jako na reálné síti).
 * Telefon je generický vůči ekonomice: posty si generuje přes injektovanou továrnu
 * `postFactory`, takže nezná platformy, viralitu ani algoritmy (ty žijí v Game).
 */
export type PhoneState = 'buffering' | 'ready' | 'swiping';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY_MULTIPLIER: Readonly<Record<Rarity, number>> = {
  common: 1,
  rare: 5,
  epic: 25,
  legendary: 100,
};

export interface Post {
  readonly rarity: Rarity;
  /** Základní hodnota Dopaminu před raritou a globálními multiplikátory. */
  readonly baseValue: BigNumber;
}

export interface PhoneConfig {
  bufferTime: number; // s
  swipeTime: number; // s
}

export interface SwipeResult {
  dopamine: BigNumber;
  rarity: Rarity;
}

/** Událost vrácená z advance(), kterou Game přeloží na event pro prezentaci. */
export type PhoneTick = { type: 'ready'; rarity: Rarity } | null;

export const DEFAULT_PHONE_CONFIG: PhoneConfig = {
  bufferTime: 3,
  swipeTime: 0.3,
};

export class Phone {
  state: PhoneState = 'buffering';
  bufferRemaining: number;
  swipeRemaining = 0;
  post: Post | null = null;
  liked = false;
  commented = false;
  /** Jak dlouho (s) je post ve stavu ready — pro prodlevu auto-scrolleru. */
  readyElapsed = 0;

  constructor(
    readonly id: number,
    readonly config: PhoneConfig,
    private readonly postFactory: () => Post,
  ) {
    this.bufferRemaining = config.bufferTime;
  }

  /**
   * Posune časovače. `bufferScale` je rychlost načítání (1 = normál). Při přetížení
   * Bandwidth (Fáze 3) bude < 1 → načítání trvá déle. Viz docs/GDD-02-Mechanics.md §3.
   */
  advance(dt: number, bufferScale = 1): PhoneTick {
    switch (this.state) {
      case 'buffering': {
        this.bufferRemaining -= dt * bufferScale;
        if (this.bufferRemaining <= 0) {
          this.post = this.postFactory();
          this.bufferRemaining = 0;
          this.liked = false;
          this.commented = false;
          this.readyElapsed = 0;
          this.state = 'ready';
          return { type: 'ready', rarity: this.post.rarity };
        }
        return null;
      }
      case 'swiping': {
        this.swipeRemaining -= dt;
        if (this.swipeRemaining <= 0) {
          this.beginBuffering();
        }
        return null;
      }
      case 'ready':
        this.readyElapsed += dt;
        return null;
    }
  }

  get isReady(): boolean {
    return this.state === 'ready' && this.post !== null;
  }

  get canLike(): boolean {
    return this.isReady && !this.liked;
  }

  get canComment(): boolean {
    return this.isReady && !this.commented;
  }

  /** Manuální Like — jen jednou na post. Vrací získané Likes, nebo null. */
  like(yieldPerLike: BigNumber): BigNumber | null {
    if (!this.canLike) return null;
    this.liked = true;
    return yieldPerLike;
  }

  /** Označí post jako okomentovaný (komentovat lze jen jednou). Vrací úspěch. */
  markCommented(): boolean {
    if (!this.canComment) return false;
    this.commented = true;
    return true;
  }

  /**
   * Swipe — inkasuje hlavní Dopamin a vrací telefon do bufferingu.
   * `globalMultiplier` = streak × algoritmy × … (počítá Game).
   */
  swipe(globalMultiplier: BigNumber): SwipeResult | null {
    if (!this.post || this.state !== 'ready') return null;
    const rarity = this.post.rarity;
    const dopamine = this.post.baseValue
      .mul(BigNumber.of(RARITY_MULTIPLIER[rarity]))
      .mul(globalMultiplier);
    this.state = 'swiping';
    this.swipeRemaining = this.config.swipeTime;
    this.post = null;
    return { dopamine, rarity };
  }

  private beginBuffering(): void {
    this.state = 'buffering';
    this.bufferRemaining = this.config.bufferTime;
    this.swipeRemaining = 0;
    this.post = null;
    this.liked = false;
    this.commented = false;
    this.readyElapsed = 0;
  }
}
