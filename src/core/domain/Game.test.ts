import { describe, it, expect } from 'vitest';
import { Game, REACTION_WINDOW } from './Game';
import { BigNumber } from '../math/BigNumber';

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

describe('Game — upgrady', () => {
  it('koupě telefonu přidá telefon a utratí Dopamin', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1000));
    expect(game.buy('secondhand_phone', 1)).toBe(1);
    expect(game.phones).toHaveLength(2);
    expect(game.wallet.get('DOP').toNumber()).toBeCloseTo(900, 5); // 1000 - 100
  });

  it('bez měny nelze koupit', () => {
    const game = new Game({ seed: 1 });
    expect(game.buy('secondhand_phone', 1)).toBe(0);
    expect(game.phones).toHaveLength(1);
  });

  it('algoritmy násobí produkci Dopaminu', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(100000));
    expect(game.productionMultiplier.toNumber()).toBe(1);
    game.buy('echo_chamber', 1); // ×1.5
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(1.5, 5);
    game.buy('clickbait', 1); // ×1.1
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(1.65, 5);
  });

  it('maxLevel se respektuje', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(100000));
    expect(game.buy('echo_chamber', 1)).toBe(1);
    expect(game.buy('echo_chamber', 1)).toBe(0); // už na maximu
  });

  it('hromadný nákup koupí víc úrovní najednou', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(100000));
    expect(game.buy('clickbait', 10)).toBe(10);
    expect(game.upgrades.level('clickbait')).toBe(10);
  });

  it('emituje UpgradePurchased', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1000));
    let event: { id: string; level: number } | null = null;
    game.bus.on('UpgradePurchased', (e) => (event = e));
    game.buy('secondhand_phone', 1);
    expect(event).not.toBeNull();
    expect((event as unknown as { id: string }).id).toBe('secondhand_phone');
  });
});

describe('Game — bandwidth', () => {
  it('základní kapacita a spotřeba', () => {
    const game = new Game({ seed: 1 });
    expect(game.totalBandwidth).toBe(3);
    expect(game.bandwidthConsumption).toBe(1); // 1 telefon
    expect(game.isOverloaded).toBe(false);
  });

  it('další telefony zvyšují spotřebu a můžou přetížit síť', () => {
    const game = new Game({ seed: 1 });
    for (let i = 0; i < 5; i++) game.addPhone(); // 6 telefonů / kapacita 3
    expect(game.bandwidthConsumption).toBe(6);
    expect(game.isOverloaded).toBe(true);
  });

  it('síťový upgrade zvýší kapacitu a sníží zatížení', () => {
    const game = new Game({ seed: 1 });
    for (let i = 0; i < 5; i++) game.addPhone();
    const loadBefore = game.bandwidthLoad;
    game.wallet.add('DOP', BigNumber.of(1e9));
    expect(game.buy('fiber', 1)).toBe(1); // +100 Mbps
    expect(game.totalBandwidth).toBe(103);
    expect(game.bandwidthLoad).toBeLessThan(loadBefore);
    expect(game.isOverloaded).toBe(false);
  });

  it('přetížení zpomaluje buffering', () => {
    const game = new Game({ seed: 1 });
    for (let i = 0; i < 10; i++) game.addPhone(); // 11 telefonů / 3 Mbps = velké přetížení
    expect(game.isOverloaded).toBe(true);
    const p = game.phones[0]!;
    expect(p.state).toBe('buffering');
    game.advance(p.config.bufferTime); // normálně ready, ale přetíženo -> ne
    expect(p.isReady).toBe(false);
  });
});
