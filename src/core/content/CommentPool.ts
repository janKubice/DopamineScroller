import { BigNumber } from '../math/BigNumber';
import type { Rng } from '../math/Rng';
import commentsData from './comments.json';

/**
 * Komentářová ruleta — výběr 3 komentářů a vyhodnocení reakcí (liky/disliky).
 * Klíčová mechanika core loopu. Návrh a vzorce viz docs/GDD-01-CoreLoop.md §4.
 */
export type CommentCategory =
  | 'hot-take'
  | 'wholesome'
  | 'copypasta'
  | 'troll'
  | 'normie'
  | 'cringe';

export interface CommentDef {
  readonly id: string;
  readonly text: string;
  readonly category: CommentCategory;
  /** 0..1 střední úspěšnost (posouvá střed rozdělení reakcí). */
  readonly baseQuality: number;
  /** 0..1 rozptyl (vyšší = větší risk/reward). */
  readonly variance: number;
  /** 0..1 podíl odměny padající jako Brain Rot místo Dopaminu. */
  readonly brainRotAffinity: number;
}

/** Vstupní parametry vyhodnocení (ovlivněné upgrady a stavem hry). */
export interface ReactionContext {
  successBonus: number; // posune kvalitu (upgrade "Provokatér")
  consistencyBonus: number; // sníží rozptyl (upgrade "Copywriter AI")
  likeYield: number; // násobič liků
  dislikeYield: number; // násobič disliků
  thickSkin: number; // 0..1, tlumí disliky
  notificationDensity: number; // roste s počtem telefonů/upgradů
  commentDopamineValue: BigNumber; // DOP za net-like
  commentBrainRotValue: BigNumber; // BR za net-like
  flopPenalty: BigNumber; // DOP penalizace za záporný net
}

export type CommentOutcome = 'viral' | 'ok' | 'flop';

export interface CommentResult {
  commentId: string;
  score: number; // -1..1
  likes: number;
  dislikes: number;
  net: number;
  dopamine: BigNumber;
  brainRot: BigNumber;
  penalty: BigNumber;
  outcome: CommentOutcome;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const clamp01 = (x: number): number => clamp(x, 0, 1);

export const DEFAULT_REACTION_CONTEXT: ReactionContext = {
  successBonus: 0,
  consistencyBonus: 0,
  likeYield: 10,
  dislikeYield: 8,
  thickSkin: 0,
  notificationDensity: 1,
  commentDopamineValue: BigNumber.of(0.5),
  commentBrainRotValue: BigNumber.of(0.2),
  flopPenalty: BigNumber.of(0.1),
};

export class CommentPool {
  constructor(private readonly defs: readonly CommentDef[]) {
    if (defs.length === 0) throw new Error('CommentPool: prázdná datová sada');
  }

  /** Načte zabudovanou datovou sadu (comments.json). */
  static default(): CommentPool {
    return new CommentPool(commentsData as CommentDef[]);
  }

  get size(): number {
    return this.defs.length;
  }

  byId(id: string): CommentDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  /** Nabídne `count` různých komentářů (default 3) k výběru. */
  offer(rng: Rng, count = 3): CommentDef[] {
    return rng.sampleDistinct(this.defs, count);
  }

  /** Vyhodnotí reakce na vybraný komentář. Deterministické pro daný RNG stav. */
  resolve(def: CommentDef, ctx: ReactionContext, rng: Rng): CommentResult {
    const quality = clamp01(def.baseQuality + ctx.successBonus);
    const spread = Math.max(0.02, def.variance * (1 - ctx.consistencyBonus));
    const mean = quality * 2 - 1; // -1..1
    const score = clamp(rng.gaussian(mean, spread), -1, 1);

    const likes = Math.round(Math.max(0, score) * ctx.likeYield * ctx.notificationDensity);
    const dislikes = Math.round(Math.max(0, -score) * ctx.dislikeYield * (1 - ctx.thickSkin));
    const net = likes - dislikes;

    let dopamine = BigNumber.ZERO;
    let brainRot = BigNumber.ZERO;
    let penalty = BigNumber.ZERO;

    if (net > 0) {
      const netBn = BigNumber.of(net);
      dopamine = netBn.mul(BigNumber.of(1 - def.brainRotAffinity)).mul(ctx.commentDopamineValue);
      brainRot = netBn.mul(BigNumber.of(def.brainRotAffinity)).mul(ctx.commentBrainRotValue);
    } else if (net < 0) {
      penalty = BigNumber.of(-net).mul(ctx.flopPenalty);
    }

    const outcome: CommentOutcome = score > 0.5 ? 'viral' : score < -0.2 ? 'flop' : 'ok';

    return { commentId: def.id, score, likes, dislikes, net, dopamine, brainRot, penalty, outcome };
  }
}
