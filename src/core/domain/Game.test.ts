import { describe, it, expect } from 'vitest';
import { Game, REACTION_WINDOW } from './Game';

/** Posune hru do okamžiku, kdy je telefon 1 ve stavu ready. */
function advanceToReady(game: Game): void {
  game.advance(game.phones[0]!.config.bufferTime);
}

describe('Game — start', () => {
  it('začíná s jedním telefonem v bufferingu', () => {
    const game = new Game({ seed: 1 });
    expect(game.phones).toHaveLength(1);
    expect(game.phones[0]!.state).toBe('buffering');
    expect(game.dopamine.isZero()).toBe(true);
  });

  it('addPhone přidá další telefon', () => {
    const game = new Game({ seed: 1 });
    game.addPhone();
    expect(game.phones).toHaveLength(2);
    expect(game.phones.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('Game — core loop', () => {
  it('emituje PostReady při načtení', () => {
    const game = new Game({ seed: 1 });
    const events: unknown[] = [];
    game.bus.on('PostReady', (e) => events.push(e));
    advanceToReady(game);
    expect(events).toHaveLength(1);
    expect(game.phones[0]!.isReady).toBe(true);
  });

  it('swipe připíše Dopamin a emituje event', () => {
    const game = new Game({ seed: 1 });
    let resolved = 0;
    game.bus.on('SwipeResolved', () => resolved++);
    advanceToReady(game);
    const before = game.dopamine.toNumber();
    expect(game.swipe(1)).not.toBeNull();
    expect(game.dopamine.toNumber()).toBeGreaterThan(before);
    expect(resolved).toBe(1);
  });

  it('like jde dát jen jednou na post', () => {
    const game = new Game({ seed: 1 });
    advanceToReady(game);
    expect(game.like(1)?.toNumber()).toBe(1);
    expect(game.like(1)).toBeNull(); // už lajknuto
    expect(game.wallet.get('LIK').toNumber()).toBe(1);
  });

  it('swipe zvyšuje streak', () => {
    const game = new Game({ seed: 1 });
    advanceToReady(game);
    expect(game.streak).toBe(1);
    game.swipe(1);
    expect(game.streak).toBeGreaterThan(1);
  });

  it('streak v klidu klesá zpět na podlahu', () => {
    const game = new Game({ seed: 1 });
    advanceToReady(game);
    game.swipe(1);
    expect(game.streak).toBeGreaterThan(1);
    game.advance(30);
    expect(game.streak).toBe(1);
  });
});

describe('Game — komentářová ruleta', () => {
  it('offerComments nabídne 3 různé komentáře', () => {
    const game = new Game({ seed: 1 });
    advanceToReady(game);
    const offered = game.offerComments(1);
    expect(offered).toHaveLength(3);
    expect(new Set(offered!.map((c) => c.id)).size).toBe(3);
  });

  it('offerComments selže, když telefon není ready', () => {
    const game = new Game({ seed: 1 });
    expect(game.offerComments(1)).toBeNull();
  });

  it('komentář jde dát jen jednou na post', () => {
    const game = new Game({ seed: 1 });
    advanceToReady(game);
    const offered = game.offerComments(1)!;
    expect(game.postComment(1, offered[0]!.id)).toBe(true);
    expect(game.postComment(1, offered[0]!.id)).toBe(false); // už okomentováno
    expect(game.offerComments(1)).toBeNull();
  });

  it('reakce přicházejí opožděně – outcome až po REACTION_WINDOW', () => {
    const game = new Game({ seed: 1 });
    advanceToReady(game);
    const offered = game.offerComments(1)!;

    let resolved: { result: { likes: number } } | null = null;
    game.bus.on('CommentResolved', (e) => (resolved = e));

    expect(game.postComment(1, offered[0]!.id)).toBe(true);
    expect(game.wallet.get('COM').toNumber()).toBe(1);

    // hned po postnutí outcome ještě není known
    game.advance(REACTION_WINDOW / 2);
    expect(resolved).toBeNull();

    // po doběhnutí okna se vyhodnotí
    game.advance(REACTION_WINDOW);
    expect(resolved).not.toBeNull();

    // všechny "naskákané" liky se připsaly do LIK
    const r = resolved as unknown as { result: { likes: number } };
    expect(game.wallet.get('LIK').toNumber()).toBe(r.result.likes);
  });
});
