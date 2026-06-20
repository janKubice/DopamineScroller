import { describe, it, expect } from 'vitest';
import { CommentPool, DEFAULT_REACTION_CONTEXT, type CommentDef } from './CommentPool';
import { Rng } from '../math/Rng';

const defs: CommentDef[] = [
  { id: 'good', text: 'super', category: 'wholesome', baseQuality: 0.9, variance: 0.1, brainRotAffinity: 0 },
  { id: 'bad', text: 'flop', category: 'cringe', baseQuality: 0.05, variance: 0.1, brainRotAffinity: 0 },
  { id: 'toxic', text: 'troll', category: 'troll', baseQuality: 0.9, variance: 0.1, brainRotAffinity: 1 },
  { id: 'mid', text: 'meh', category: 'normie', baseQuality: 0.5, variance: 0.2, brainRotAffinity: 0 },
];

describe('CommentPool — výběr', () => {
  it('zabudovaná sada se načte', () => {
    const pool = CommentPool.default();
    expect(pool.size).toBeGreaterThanOrEqual(30);
  });

  it('offer vrací různé komentáře', () => {
    const pool = new CommentPool(defs);
    const offered = pool.offer(new Rng(1), 3);
    expect(offered).toHaveLength(3);
    expect(new Set(offered.map((c) => c.id)).size).toBe(3);
  });
});

describe('CommentPool — vyhodnocení reakcí', () => {
  it('kvalitní komentář dává liky a Dopamin', () => {
    const pool = new CommentPool(defs);
    const good = pool.byId('good')!;
    const result = pool.resolve(good, DEFAULT_REACTION_CONTEXT, new Rng(42));
    expect(result.score).toBeGreaterThan(0);
    expect(result.likes).toBeGreaterThan(0);
    expect(result.dopamine.isPositive()).toBe(true);
    expect(result.penalty.isZero()).toBe(true);
  });

  it('špatný komentář flopne a může penalizovat', () => {
    const pool = new CommentPool(defs);
    const bad = pool.byId('bad')!;
    const result = pool.resolve(bad, DEFAULT_REACTION_CONTEXT, new Rng(42));
    expect(result.score).toBeLessThan(0);
    expect(result.dislikes).toBeGreaterThan(0);
    expect(result.dopamine.isZero()).toBe(true);
  });

  it('toxický komentář dává Brain Rot místo Dopaminu', () => {
    const pool = new CommentPool(defs);
    const toxic = pool.byId('toxic')!;
    const result = pool.resolve(toxic, DEFAULT_REACTION_CONTEXT, new Rng(42));
    expect(result.brainRot.isPositive()).toBe(true);
    expect(result.dopamine.isZero()).toBe(true); // brainRotAffinity = 1
  });

  it('je deterministické pro daný seed', () => {
    const pool = new CommentPool(defs);
    const mid = pool.byId('mid')!;
    const a = pool.resolve(mid, DEFAULT_REACTION_CONTEXT, new Rng(7));
    const b = pool.resolve(mid, DEFAULT_REACTION_CONTEXT, new Rng(7));
    expect(a.score).toBe(b.score);
    expect(a.net).toBe(b.net);
  });
});
