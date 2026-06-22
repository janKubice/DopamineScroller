import { describe, it, expect } from 'vitest';
import { Game, REACTION_WINDOW, expectedRarityMultiplier, OFFLINE_EFFICIENCY, MAX_OFFLINE_SECONDS } from './Game';
import { BigNumber } from '../math/BigNumber';
import type { PlatformDef } from '../content/platforms';
import { categoryOf, effectTotalLabel, UPGRADE_CATEGORIES, type UpgradeDef } from '../content/upgrades';

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

describe('Game — save/load', () => {
  it('serializace a načtení obnoví stav', () => {
    const game = new Game({ seed: 5 });
    game.wallet.add('DOP', BigNumber.of(100000));
    game.buy('clickbait', 3);
    game.addPhone();
    const snapshot = game.serialize();

    const restored = new Game({ seed: 1 });
    restored.loadSave(snapshot);
    expect(restored.upgrades.level('clickbait')).toBe(3);
    expect(restored.phones).toHaveLength(game.phones.length);
    expect(restored.wallet.get('DOP').toNumber()).toBeCloseTo(game.wallet.get('DOP').toNumber(), 0);
  });

  it('načtení vždy obnoví aspoň jeden telefon', () => {
    const game = new Game({ seed: 1 });
    const snapshot = { ...game.serialize(), phoneCount: 0 };
    game.loadSave(snapshot);
    expect(game.phones.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Game — boti & offline', () => {
  it('bez botů žádný odhad ani příjem v čase', () => {
    const game = new Game({ seed: 1 });
    expect(game.estimatedDopaminePerSecond.isZero()).toBe(true);
    const before = game.wallet.get('DOP').toNumber();
    for (let i = 0; i < 100; i++) game.advance(0.1); // 10 s, posty se načtou ale nikdo neswipuje
    expect(game.wallet.get('DOP').toNumber()).toBe(before);
  });

  it('auto-scroller swipuje telefony a generuje Dopamin', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_scroller', 1);
    expect(game.estimatedDopaminePerSecond.isPositive()).toBe(true);
    const before = game.wallet.get('DOP').toNumber();
    for (let i = 0; i < 200; i++) game.advance(0.1); // 20 s
    expect(game.wallet.get('DOP').toNumber()).toBeGreaterThan(before);
  });

  it('auto-liker lajkuje načtené posty', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_liker', 1);
    for (let i = 0; i < 100; i++) game.advance(0.1);
    expect(game.wallet.get('LIK').toNumber()).toBeGreaterThanOrEqual(1);
  });

  it('auto-commenter komentuje načtené posty', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_commenter', 1);
    for (let i = 0; i < 100; i++) game.advance(0.1);
    expect(game.wallet.get('COM').toNumber()).toBeGreaterThanOrEqual(1);
  });

  it('slabý auto-scroller nestíhá hodně telefonů (posty se hromadí)', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e7));
    game.buy('auto_scroller', 1); // jen 0.5 swipu/s
    game.buy('fiber', 1); // dost sítě, ať není přetížení důvod
    for (let i = 0; i < 20; i++) game.addPhone(); // 21 telefonů
    for (let i = 0; i < 300; i++) game.advance(0.1); // 30 s
    const ready = game.phones.filter((p) => p.isReady).length;
    expect(ready).toBeGreaterThan(0); // nestíhá -> část postů čeká
  });

  it('boti zvyšují spotřebu sítě', () => {
    const game = new Game({ seed: 1 });
    const base = game.bandwidthConsumption;
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_scroller', 1);
    expect(game.bandwidthConsumption).toBeGreaterThan(base);
  });

  it('offline připíše Dopamin podle propustnosti botů', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_scroller', 2);
    const est = game.estimatedDopaminePerSecond.toNumber();
    expect(est).toBeGreaterThan(0);
    const before = game.wallet.get('DOP').toNumber();
    const earn = game.computeOfflineEarnings(3600);
    expect(earn.seconds).toBe(3600);
    expect(earn.dopamine.toNumber() / (est * 3600)).toBeCloseTo(OFFLINE_EFFICIENCY, 5);
    expect(game.wallet.get('DOP').toNumber()).toBeGreaterThan(before);
  });

  it('offline bez auto-scrolleru je nulové', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_liker', 1); // jen liker, žádný swiper -> žádné cykly
    const earn = game.computeOfflineEarnings(3600);
    expect(earn.dopamine.isZero()).toBe(true);
  });

  it('offline je zastropované', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_scroller', 1);
    const earn = game.computeOfflineEarnings(10 * 24 * 3600); // 10 dní
    expect(earn.capped).toBe(true);
    expect(earn.seconds).toBe(MAX_OFFLINE_SECONDS);
  });
});

describe('Game — dopaminové bubliny (minihra)', () => {
  /** Hra s odemčenou minihrou (koupený Dopamine Detector). */
  function withBubbles(seed = 1): Game {
    const game = new Game({ seed });
    game.wallet.add('DOP', BigNumber.of(100000));
    game.buy('dopamine_detector', 1);
    return game;
  }

  it('bubliny nespawnují bez odemčení', () => {
    const game = new Game({ seed: 1 });
    expect(game.bubblesUnlocked).toBe(false);
    let spawned = false;
    game.bus.on('BubbleSpawned', () => (spawned = true));
    for (let i = 0; i < 200; i++) game.advance(0.2); // 40 s
    expect(spawned).toBe(false);
  });

  it('po odemčení se bublina po čase objeví a jde sebrat za Dopamin', () => {
    const game = withBubbles();
    expect(game.bubblesUnlocked).toBe(true);
    let spawned: { id: number } | null = null;
    game.bus.on('BubbleSpawned', (e) => (spawned = e));
    for (let i = 0; i < 200 && spawned === null; i++) game.advance(0.2);
    expect(spawned).not.toBeNull();
    const before = game.wallet.get('DOP').toNumber();
    const id = (spawned as unknown as { id: number }).id;
    expect(game.popBubble(id)).not.toBeNull();
    expect(game.wallet.get('DOP').toNumber()).toBeGreaterThan(before);
  });

  it('sebrání neexistující bubliny vrací null', () => {
    const game = new Game({ seed: 1 });
    expect(game.popBubble(999)).toBeNull();
  });

  it('bublina po čase expiruje', () => {
    const game = withBubbles();
    let spawnedId: number | null = null;
    let expiredId: number | null = null;
    game.bus.on('BubbleSpawned', (e) => {
      if (spawnedId === null) spawnedId = e.id;
    });
    game.bus.on('BubbleExpired', (e) => {
      if (e.id === spawnedId) expiredId = e.id;
    });
    for (let i = 0; i < 200 && spawnedId === null; i++) game.advance(0.2);
    expect(spawnedId).not.toBeNull();
    for (let i = 0; i < 40; i++) game.advance(0.2); // > lifetime
    expect(expiredId).toBe(spawnedId);
  });

  it('nikdy není víc než MAX bublin naráz', () => {
    const game = withBubbles();
    let active = 0;
    let peak = 0;
    game.bus.on('BubbleSpawned', () => {
      active++;
      peak = Math.max(peak, active);
    });
    game.bus.on('BubbleExpired', () => active--);
    for (let i = 0; i < 600; i++) game.advance(0.1);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('upgrade hodnoty zvýší odměnu z bubliny', () => {
    const game = withBubbles();
    game.wallet.add('DOP', BigNumber.of(100000));
    const grab = (): number => {
      let spawned: { id: number } | null = null;
      const off = game.bus.on('BubbleSpawned', (e) => (spawned = e));
      for (let i = 0; i < 200 && spawned === null; i++) game.advance(0.2);
      off();
      const before = game.wallet.get('DOP').toNumber();
      game.popBubble((spawned as unknown as { id: number }).id);
      return game.wallet.get('DOP').toNumber() - before;
    };
    const v1 = grab();
    game.buy('bigger_hits', 1); // +25 % hodnoty
    const v2 = grab();
    expect(v2).toBeGreaterThan(v1);
  });
});

describe('Game — early game pacing', () => {
  it('první upgrade je dostupný už za 10 DOP', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(10));
    expect(game.buy('energy_drink', 1)).toBe(1);
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(1.15, 5);
  });
});

describe('Game — virality & Hidden Gems', () => {
  it('expectedRarityMultiplier roste s viralitou', () => {
    expect(expectedRarityMultiplier(0)).toBeGreaterThan(1);
    expect(expectedRarityMultiplier(2)).toBeGreaterThan(expectedRarityMultiplier(0));
    expect(expectedRarityMultiplier(10)).toBeGreaterThan(expectedRarityMultiplier(2));
  });

  it('upgrady zvyšují viralitu', () => {
    const game = new Game({ seed: 1 });
    expect(game.virality).toBe(0);
    game.wallet.add('DOP', BigNumber.of(1e7));
    game.buy('third_eye', 3); // +1.5
    expect(game.virality).toBeCloseTo(1.5, 5);
    game.buy('fake_news', 1); // +1.5
    expect(game.virality).toBeCloseTo(3.0, 5);
  });

  it('vysoká virality produkuje vzácné posty (Hidden Gems)', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e9));
    game.buy('third_eye', 20); // virality ~10
    game.buy('fiber', 5);
    game.buy('auto_scroller', 20);
    for (let i = 0; i < 25; i++) game.addPhone();
    let gems = 0;
    game.bus.on('HiddenGemFound', () => gems++);
    for (let i = 0; i < 300; i++) game.advance(0.1);
    expect(gems).toBeGreaterThan(0);
  });

  it('virality se serializuje jako base (bez dvojího počítání upgradů)', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e7));
    game.buy('third_eye', 2); // virality 1.0
    const restored = new Game({ seed: 2 });
    restored.loadSave(game.serialize());
    expect(restored.virality).toBeCloseTo(game.virality, 5);
  });
});

describe('Game — Pozornost (M1)', () => {
  it('startuje na maximu a focus = 1', () => {
    const game = new Game({ seed: 1 });
    expect(game.attention).toBe(game.maxAttention);
    expect(game.focusFactor).toBe(1);
  });

  it('manuální swipe stojí Pozornost', () => {
    const game = new Game({ seed: 1 });
    game.advance(game.phones[0]!.config.bufferTime); // ready
    const before = game.attention;
    game.swipe(1);
    expect(game.attention).toBeLessThan(before);
  });

  it('boti Pozornost nestojí', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_scroller', 5); // rychlý auto-scroller
    for (let i = 0; i < 100; i++) game.advance(0.1); // boti swipují
    expect(game.attention).toBe(game.maxAttention); // regenerace drží na maxu
  });

  it('Pozornost se po útratě regeneruje', () => {
    const game = new Game({ seed: 1 });
    game.advance(3); // ready
    game.swipe(1);
    const low = game.attention;
    expect(low).toBeLessThan(game.maxAttention);
    game.advance(1); // +regen
    expect(game.attention).toBeGreaterThan(low);
  });

  it('hodně manuálních swipů naráz vyčerpá Pozornost a sníží focus', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e7));
    game.buy('fiber', 1); // dost sítě
    for (let i = 0; i < 25; i++) game.addPhone();
    game.advance(5); // všechny ready
    expect(game.focusFactor).toBe(1);
    for (const p of game.phones) {
      if (p.isReady) game.swipe(p.id); // bez advance -> bez regenerace
    }
    expect(game.attention).toBeLessThan(game.maxAttention);
    expect(game.focusFactor).toBeLessThan(1);
  });
});

describe('Game — platformy', () => {
  const platforms: PlatformDef[] = [
    { id: 'a', name: 'A', icon: '🅰️', basePostValue: 10, bandwidthPerPhone: 1, viralityBonus: 0, brainRotPerSwipe: 0, unlockAtDopamine: 0 },
    { id: 'b', name: 'B', icon: '🅱️', basePostValue: 50, bandwidthPerPhone: 3, viralityBonus: 0, brainRotPerSwipe: 2, unlockAtDopamine: 30 },
  ];

  /** Odemkne platformu 'b' tím, že nechá boty vydělat dost Dopaminu. */
  function unlockB(game: Game): void {
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_scroller', 10);
    game.buy('fiber', 2);
    for (let i = 0; i < 5; i++) game.addPhone();
    for (let i = 0; i < 300; i++) game.advance(0.1);
  }

  it('startuje na první platformě, ostatní zamčené', () => {
    const game = new Game({ seed: 1, platforms });
    expect(game.activePlatform.id).toBe('a');
    const view = game.platformView();
    expect(view.find((p) => p.id === 'a')!.unlocked).toBe(true);
    expect(view.find((p) => p.id === 'b')!.unlocked).toBe(false);
  });

  it('na zamčenou platformu nelze přepnout', () => {
    const game = new Game({ seed: 1, platforms });
    expect(game.setPlatform('b')).toBe(false);
    expect(game.activePlatform.id).toBe('a');
  });

  it('platforma určuje base Dopamin/post', () => {
    const game = new Game({ seed: 1, platforms });
    expect(game.basePostValue.toNumber()).toBe(10);
  });

  it('vydělaný Dopamin odemkne další platformu', () => {
    const game = new Game({ seed: 1, platforms });
    let unlocked = false;
    game.bus.on('PlatformUnlocked', (e) => {
      if (e.id === 'b') unlocked = true;
    });
    unlockB(game);
    expect(unlocked).toBe(true);
    expect(game.setPlatform('b')).toBe(true);
    expect(game.activePlatform.id).toBe('b');
  });

  it('platforma s brainRotPerSwipe generuje Brain Rot', () => {
    const game = new Game({ seed: 1, platforms });
    unlockB(game);
    expect(game.setPlatform('b')).toBe(true);
    const before = game.wallet.get('BR').toNumber();
    for (let i = 0; i < 100; i++) game.advance(0.1); // boti swipují na 'b'
    expect(game.wallet.get('BR').toNumber()).toBeGreaterThan(before);
  });

  it('save/load obnoví aktivní platformu i odemčení', () => {
    const game = new Game({ seed: 1, platforms });
    unlockB(game);
    game.setPlatform('b');
    const restored = new Game({ seed: 2, platforms });
    restored.loadSave(game.serialize());
    expect(restored.activePlatform.id).toBe('b');
    expect(restored.platformView().find((p) => p.id === 'b')!.unlocked).toBe(true);
  });
});

describe('Game — Brain Rot větev', () => {
  it('Brain Rot upgrade se kupuje za BR a boostuje produkci', () => {
    const game = new Game({ seed: 1 });
    expect(game.buy('rage_bait', 1)).toBe(0); // bez BR nelze
    game.wallet.add('BR', BigNumber.of(1000));
    const before = game.productionMultiplier.toNumber();
    expect(game.buy('rage_bait', 1)).toBe(1);
    expect(game.productionMultiplier.toNumber()).toBeGreaterThan(before);
    expect(game.wallet.get('BR').toNumber()).toBeLessThan(1000);
  });

  it('AI Slop Factory: ×4 produkce, ale +50 % spotřeby sítě (downside)', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('BR', BigNumber.of(1000));
    const consBefore = game.bandwidthConsumption;
    expect(game.buy('ai_slop', 1)).toBe(1);
    expect(game.bandwidthConsumption).toBeCloseTo(consBefore * 1.5, 5);
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(4, 5);
  });

  it('chaosLevel roste s Brain Rot upgrady', () => {
    const game = new Game({ seed: 1 });
    const before = game.chaosLevel;
    game.wallet.add('BR', BigNumber.of(100000));
    game.buy('rage_bait', 3);
    expect(game.chaosLevel).toBeGreaterThan(before);
  });
});

describe('Game — synergie měn (M2)', () => {
  it('Likes zvyšují Reach (dopamin/swipe)', () => {
    const game = new Game({ seed: 1 });
    const before = game.globalSwipeMultiplier.toNumber();
    game.wallet.add('LIK', BigNumber.of(1e6));
    expect(game.synergyReach).toBeGreaterThan(0);
    expect(game.globalSwipeMultiplier.toNumber()).toBeGreaterThan(before);
  });

  it('Comments zvyšují Engagement (víc LIK za lajk)', () => {
    const base = new Game({ seed: 1 });
    advanceToReady(base);
    const baseYield = base.like(1)!.toNumber();

    const boosted = new Game({ seed: 1 });
    boosted.wallet.add('COM', BigNumber.of(1e6));
    advanceToReady(boosted);
    expect(boosted.like(1)!.toNumber()).toBeGreaterThan(baseYield);
  });

  it('Shares zvyšují viralitu', () => {
    const game = new Game({ seed: 1 });
    const before = game.virality;
    game.wallet.add('SHR', BigNumber.of(1e6));
    expect(game.virality).toBeGreaterThan(before);
  });

  it('vzácný post generuje Shares', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e9));
    game.buy('third_eye', 30); // vysoká virality -> vzácné posty
    let guard = 0;
    while (game.wallet.get('SHR').isZero() && guard < 300) {
      advanceToReady(game);
      const p = game.phones[0]!;
      if (p.isReady) game.swipe(p.id);
      guard++;
    }
    expect(game.wallet.get('SHR').isPositive()).toBe(true);
  });

  it('odemčené platformy navíc dávají Omnipresence', () => {
    const platforms: PlatformDef[] = [
      { id: 'a', name: 'A', icon: '🅰️', basePostValue: 1, bandwidthPerPhone: 1, viralityBonus: 0, brainRotPerSwipe: 0, unlockAtDopamine: 0 },
      { id: 'b', name: 'B', icon: '🅱️', basePostValue: 1, bandwidthPerPhone: 1, viralityBonus: 0, brainRotPerSwipe: 0, unlockAtDopamine: 0 },
    ];
    const game = new Game({ seed: 1, platforms });
    expect(game.omnipresenceBonus).toBeGreaterThan(0);
  });
});

describe('Game — auto-scroller čekání (T4)', () => {
  it('waitFor=like neswipne nelajknutý post (bez auto-likeru, do pojistky)', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('fiber', 1); // dost sítě
    game.buy('auto_scroller', 5);
    game.setSwipeWaitFor('like');
    for (let i = 0; i < 60; i++) game.advance(0.1); // 6 s: ready ~3 s, readyElapsed ~3 s < MAX_AUTO_WAIT
    expect(game.phones[0]!.isReady).toBe(true); // čeká na like, neswipnuto
    expect(game.phones[0]!.liked).toBe(false);
  });

  it('waitFor=like swipne až po lajku (s auto-likerem)', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('fiber', 1);
    game.buy('auto_scroller', 5);
    game.buy('auto_liker', 5);
    game.setSwipeWaitFor('like');
    const before = game.wallet.get('DOP').toNumber();
    for (let i = 0; i < 120; i++) game.advance(0.1);
    expect(game.wallet.get('LIK').toNumber()).toBeGreaterThan(0); // lajky proběhly
    expect(game.wallet.get('DOP').toNumber()).toBeGreaterThan(before); // pak swipe -> DOP
  });
});

// ── Vlna 2 (pre-prestige) ─────────────────────────────────────────────────────

/** Minimální UpgradeDef pro izolované testy efektů (levný, multiplier 1 = fixní cena). */
function up(id: string, effect: UpgradeDef['effect'], extra: Partial<UpgradeDef> = {}): UpgradeDef {
  return {
    id,
    name: id,
    description: id,
    icon: '🔧',
    cost: { currency: 'DOP', base: 1, multiplier: 1 },
    effect,
    ...extra,
  };
}

/** Posune telefon do ready a swipne ho (pro vydělání Dopaminu / nabuzení streaku). */
function readyAndSwipe(game: Game, id = 1): void {
  for (let i = 0; i < 200; i++) {
    const p = game.phones.find((x) => x.id === id);
    if (p?.isReady) break;
    game.advance(0.1);
  }
  game.swipe(id);
}

describe('Game — postupné odemykání upgradů (T6)', () => {
  it('prerekvizitní upgrade je zamčený, dokud není koupena prerekvizita', () => {
    const upgrades = [
      up('base', { type: 'dopamineMultiplier', value: 2 }, { maxLevel: 1 }),
      up('gated', { type: 'dopamineMultiplier', value: 2 }, { maxLevel: 1, unlock: { requires: 'base' } }),
    ];
    const game = new Game({ seed: 1, upgrades });
    game.wallet.add('DOP', BigNumber.of(1000));

    expect(game.isUnlocked('gated')).toBe(false);
    expect(game.buy('gated', 1)).toBe(0); // zamčeno -> nelze koupit

    const lockedView = game.upgradeView().find((u) => u.id === 'gated')!;
    expect(lockedView.locked).toBe(true);
    expect(lockedView.visible).toBe(false); // prereq nesplněn -> schováno
    expect(lockedView.affordable).toBe(false);

    expect(game.buy('base', 1)).toBe(1);
    expect(game.isUnlocked('gated')).toBe(true);
    expect(game.buy('gated', 1)).toBe(1);
    const view = game.upgradeView().find((u) => u.id === 'gated')!;
    expect(view.locked).toBe(false);
    expect(view.visible).toBe(true);
  });

  it('prerekvizita může vyžadovat konkrétní úroveň', () => {
    const upgrades = [
      up('base', { type: 'dopamineMultiplier', value: 1.1 }),
      up('gated', { type: 'dopamineMultiplier', value: 2 }, {
        maxLevel: 1,
        unlock: { requires: 'base', requiresLevel: 3 },
      }),
    ];
    const game = new Game({ seed: 1, upgrades });
    game.wallet.add('DOP', BigNumber.of(1000));
    game.buy('base', 2);
    expect(game.isUnlocked('gated')).toBe(false); // jen Lv 2
    game.buy('base', 1);
    expect(game.isUnlocked('gated')).toBe(true); // Lv 3
  });

  it('práh Dopaminu používá VYDĚLANÝ (kumulovaný) Dopamin, ne aktuální zůstatek', () => {
    const upgrades = [up('gated', { type: 'dopamineMultiplier', value: 2 }, { unlock: { dopamine: 250 } })];
    const platforms: PlatformDef[] = [
      { id: 'x', name: 'X', icon: '✖️', basePostValue: 100, bandwidthPerPhone: 1, viralityBonus: 0, brainRotPerSwipe: 0, unlockAtDopamine: 0 },
    ];
    const game = new Game({ seed: 1, upgrades, platforms });
    game.wallet.add('DOP', BigNumber.of(1e6)); // má peníze, ale nevydělal je

    expect(game.totalDopamineEarned.isZero()).toBe(true);
    expect(game.isUnlocked('gated')).toBe(false);
    expect(game.buy('gated', 1)).toBe(0); // zůstatek nestačí na odemčení
    expect(game.upgradeView().find((u) => u.id === 'gated')!.visible).toBe(false);

    // Vyděláme přes půlku prahu (teaser), ale ne celý.
    while (game.totalDopamineEarned.toNumber() < 250 * 0.5) readyAndSwipe(game);
    if (game.totalDopamineEarned.toNumber() < 250) {
      const teaser = game.upgradeView().find((u) => u.id === 'gated')!;
      expect(teaser.locked).toBe(true);
      expect(teaser.visible).toBe(true); // teaser „brzy"
      expect(teaser.unlockHint).toBeTruthy();
    }

    // Vyděláme přes práh -> odemčeno a koupitelné.
    while (game.totalDopamineEarned.toNumber() < 250) readyAndSwipe(game);
    expect(game.isUnlocked('gated')).toBe(true);
    expect(game.buy('gated', 1)).toBe(1);
  });

  it('reálná data: bubble upgrady jsou zamčené dokud není Dopamine Detector', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e5));
    expect(game.isUnlocked('bigger_hits')).toBe(false);
    expect(game.buy('bigger_hits', 1)).toBe(0);
    expect(game.upgradeView().find((u) => u.id === 'bigger_hits')!.visible).toBe(false);

    game.buy('dopamine_detector', 1);
    expect(game.isUnlocked('bigger_hits')).toBe(true);
    expect(game.upgradeView().find((u) => u.id === 'bigger_hits')!.visible).toBe(true);
    expect(game.buy('bigger_hits', 1)).toBe(1);
  });

  it('reálná data: threshold upgrade nelze koupit z napumpovaného zůstatku', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e9));
    // meditation_app má práh 500 VYDĚLANÉHO Dopaminu – napumpovaný zůstatek nestačí.
    expect(game.buy('meditation_app', 1)).toBe(0);
    expect(game.upgradeView().find((u) => u.id === 'meditation_app')!.locked).toBe(true);
  });

  it('reálná data: threshold upgrade se odemkne vyděláním Dopaminu (boti)', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('auto_scroller', 10);
    game.buy('fiber', 1);
    for (let i = 0; i < 12; i++) game.addPhone();
    expect(game.isUnlocked('meditation_app')).toBe(false); // práh 500
    for (let i = 0; i < 5000 && game.totalDopamineEarned.toNumber() < 500; i++) game.advance(0.1);
    expect(game.totalDopamineEarned.toNumber()).toBeGreaterThanOrEqual(500);
    expect(game.isUnlocked('meditation_app')).toBe(true);
    expect(game.buy('meditation_app', 1)).toBe(1);
  });
});

describe('Game — nové efekty (Vlna 2)', () => {
  it('bufferSpeedMult zrychlí načítání postů', () => {
    const slow = new Game({ seed: 1 });
    slow.advance(1.5); // půlka bufferTime -> ještě ne ready
    expect(slow.phones[0]!.isReady).toBe(false);

    const fast = new Game({ seed: 1, upgrades: [up('speed', { type: 'bufferSpeedMult', value: 2 })] });
    fast.wallet.add('DOP', BigNumber.of(100));
    fast.buy('speed', 1);
    expect(fast.bufferSpeedMultiplier).toBe(2);
    fast.advance(1.5); // ×2 rychlost -> ready za polovinu času
    expect(fast.phones[0]!.isReady).toBe(true);
  });

  it('attentionMaxMult zvýší maximum Pozornosti', () => {
    const game = new Game({ seed: 1, upgrades: [up('att', { type: 'attentionMaxMult', value: 1.5 })] });
    game.wallet.add('DOP', BigNumber.of(100));
    const base = game.maxAttention;
    game.buy('att', 2); // ×1.5^2 = ×2.25
    expect(game.maxAttention).toBeCloseTo(base * 2.25, 5);
  });

  it('attentionRegenMult zrychlí regeneraci Pozornosti', () => {
    const measure = (game: Game): number => {
      game.advance(3); // ready, pozornost na maximu
      game.swipe(1); // utratí pozornost
      const low = game.attention;
      game.advance(0.2);
      return game.attention - low;
    };
    const base = new Game({ seed: 1 });
    const boosted = new Game({ seed: 1, upgrades: [up('regen', { type: 'attentionRegenMult', value: 3 })] });
    boosted.wallet.add('DOP', BigNumber.of(100));
    boosted.buy('regen', 1);
    expect(boosted.attentionRegenMultiplier).toBe(3);
    expect(measure(boosted)).toBeGreaterThan(measure(base));
  });

  it('streakCapBonus zvedne strop streaku nad základ', () => {
    const game = new Game({
      seed: 1,
      upgrades: [
        up('cap', { type: 'streakCapBonus', value: 2 }, { maxLevel: 1 }),
        up('bw', { type: 'bandwidth', value: 1000 }),
      ],
    });
    game.wallet.add('DOP', BigNumber.of(1e4));
    expect(game.streakMax).toBe(3);
    game.buy('cap', 1);
    expect(game.streakMax).toBe(5);

    game.buy('bw', 1);
    for (let i = 0; i < 40; i++) game.addPhone(); // hodně telefonů = swipy v jednom ticku
    for (let s = 0; s < 6; s++) {
      game.advance(3.2); // všechny ready
      for (const p of game.phones) if (p.isReady) game.swipe(p.id);
    }
    expect(game.streak).toBeGreaterThan(3); // přesáhlo původní strop -> bonus funguje
  });

  it('jackpot (crit): bez upgradu nikdy, s upgradem swipy občas vyplatí násobek', () => {
    const noCrit = new Game({ seed: 1 });
    expect(noCrit.critChance).toBe(0);

    const game = new Game({ seed: 1, upgrades: [up('jack', { type: 'critChance', value: 0.05 }, { maxLevel: 20 })] });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('jack', 18); // 0.9 (po zastropování)
    expect(game.critChance).toBeCloseTo(0.9, 5);

    let jackpot: { dopamine: BigNumber; multiplier: number } | null = null;
    game.bus.on('Jackpot', (e) => {
      if (!jackpot) jackpot = e;
    });
    for (let i = 0; i < 40 && jackpot === null; i++) readyAndSwipe(game);
    expect(jackpot).not.toBeNull();
    expect((jackpot as unknown as { multiplier: number }).multiplier).toBe(5); // base bez Mega-Jackpotu
  });

  it('critMult (Mega-Jackpot) zvýší výplatu jackpotu', () => {
    const game = new Game({ seed: 1, upgrades: [up('mega', { type: 'critMult', value: 3 }, { maxLevel: 8 })] });
    game.wallet.add('DOP', BigNumber.of(1e6));
    expect(game.critMultiplier).toBe(5); // základ
    game.buy('mega', 2); // +6
    expect(game.critMultiplier).toBe(11);
  });

  it('offlineEfficiencyBonus zvýší offline výnos', () => {
    const make = (extra: UpgradeDef[]): Game => {
      const g = new Game({ seed: 1, upgrades: [up('scroll', { type: 'autoSwipeRate', value: 1 }), ...extra] });
      g.wallet.add('DOP', BigNumber.of(1e6));
      g.buy('scroll', 2);
      return g;
    };
    const base = make([]);
    const boosted = make([up('eff', { type: 'offlineEfficiencyBonus', value: 0.1 }, { maxLevel: 5 })]);
    boosted.buy('eff', 5); // +0.5 -> efektivita 1.0
    expect(base.offlineEfficiency).toBeCloseTo(0.5, 5);
    expect(boosted.offlineEfficiency).toBeCloseTo(1.0, 5);

    const baseEarn = base.computeOfflineEarnings(3600).dopamine.toNumber();
    const boostEarn = boosted.computeOfflineEarnings(3600).dopamine.toNumber();
    expect(boostEarn / baseEarn).toBeCloseTo(2, 5); // 1.0 / 0.5
  });

  it('offlineCapHours prodlouží strop offline těžby', () => {
    const game = new Game({
      seed: 1,
      upgrades: [
        up('scroll', { type: 'autoSwipeRate', value: 1 }),
        up('cap', { type: 'offlineCapHours', value: 2 }, { maxLevel: 6 }),
      ],
    });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('scroll', 1);
    expect(game.maxOfflineSeconds).toBe(MAX_OFFLINE_SECONDS);
    game.buy('cap', 3); // +6 h
    expect(game.maxOfflineSeconds).toBe(MAX_OFFLINE_SECONDS + 6 * 3600);

    const earn = game.computeOfflineEarnings(10 * 24 * 3600);
    expect(earn.seconds).toBe(MAX_OFFLINE_SECONDS + 6 * 3600);
    expect(earn.capped).toBe(true);
  });

  it('bandwidthMult znásobí celkovou kapacitu sítě', () => {
    const game = new Game({
      seed: 1,
      upgrades: [
        up('bwbase', { type: 'bandwidth', value: 7 }),
        up('mult', { type: 'bandwidthMult', value: 2 }, { maxLevel: 4 }),
      ],
    });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('bwbase', 1);
    expect(game.totalBandwidth).toBe(10); // 3 + 7
    game.buy('mult', 2); // ×2^2
    expect(game.totalBandwidth).toBe(40);
  });

  it('nové efekty se serializují a načtou (úrovně přežijí save)', () => {
    const game = new Game({
      seed: 1,
      upgrades: [
        up('speed', { type: 'bufferSpeedMult', value: 1.2 }),
        up('jack', { type: 'critChance', value: 0.05 }, { maxLevel: 20 }),
      ],
    });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('speed', 3);
    game.buy('jack', 4);

    const restored = new Game({
      seed: 2,
      upgrades: [
        up('speed', { type: 'bufferSpeedMult', value: 1.2 }),
        up('jack', { type: 'critChance', value: 0.05 }, { maxLevel: 20 }),
      ],
    });
    restored.loadSave(game.serialize());
    expect(restored.upgrades.level('speed')).toBe(3);
    expect(restored.critChance).toBeCloseTo(game.critChance, 5);
  });
});

describe('Game — rebalance měkkým stropem produkce (#5)', () => {
  it('pod prahem se multiplikátor nemění (zachovaný early/mid balanc)', () => {
    const game = new Game({ seed: 1, upgrades: [up('m', { type: 'dopamineMultiplier', value: 1.1 })] });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('m', 10); // 1.1^10 ≈ 2.594 (<< 1e6)
    expect(game.isProductionSoftCapped).toBe(false);
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(Math.pow(1.1, 10), 6);
    // capped == raw pod prahem
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(game.rawProductionMultiplier.toNumber(), 6);
  });

  it('nad prahem se exploze zploští, ale zůstává rostoucí', () => {
    const game = new Game({ seed: 1, upgrades: [up('m', { type: 'dopamineMultiplier', value: 10 })] });
    game.wallet.add('DOP', BigNumber.of(1e9));
    game.buy('m', 10); // raw = 1e10 (log 10) -> compressed 6 + (10-6)*0.5 = 8 -> 1e8
    expect(game.isProductionSoftCapped).toBe(true);
    expect(game.rawProductionMultiplier.log10()).toBeCloseTo(10, 6);
    expect(game.productionMultiplier.log10()).toBeCloseTo(8, 6);
    expect(game.productionMultiplier.lt(game.rawProductionMultiplier)).toBe(true);

    const before = game.productionMultiplier.log10();
    game.buy('m', 2); // raw log 12 -> compressed 6 + 6*0.5 = 9
    expect(game.productionMultiplier.log10()).toBeGreaterThan(before); // monotonní
    expect(game.productionMultiplier.log10()).toBeCloseTo(9, 6);
  });

  it('měkký strop se promítne do odhadu DOP/s (ne surová exploze)', () => {
    const make = (levels: number): Game => {
      const g = new Game({
        seed: 1,
        upgrades: [up('scroll', { type: 'autoSwipeRate', value: 1 }), up('m', { type: 'dopamineMultiplier', value: 10 })],
      });
      g.wallet.add('DOP', BigNumber.of(1e9));
      g.buy('scroll', 2);
      if (levels > 0) g.buy('m', levels);
      return g;
    };
    const baseline = make(0); // productionMultiplier = 1
    const capped = make(10); // raw 1e10, capped 1e8
    expect(capped.isProductionSoftCapped).toBe(true);
    // DPS škáluje s capped multiplikátorem; vše ostatní (swipy, rarita) je shodné -> poměr == multiplikátor
    const ratio = capped.estimatedDopaminePerSecond.div(baseline.estimatedDopaminePerSecond);
    expect(ratio.log10()).toBeCloseTo(capped.productionMultiplier.log10(), 1); // ≈ 8, ne 10
  });
});

describe('categoryOf — kategorie upgradů (#9)', () => {
  it('řadí podle efektu a měny', () => {
    expect(categoryOf(up('p', { type: 'addPhone', value: 1 }))).toBe('hardware');
    expect(categoryOf(up('spd', { type: 'bufferSpeedMult', value: 1.1 }))).toBe('hardware'); // rychlost telefonu
    expect(categoryOf(up('b', { type: 'bandwidth', value: 1 }))).toBe('network');
    expect(categoryOf(up('bm', { type: 'bandwidthMult', value: 2 }))).toBe('network');
    expect(categoryOf(up('s', { type: 'autoSwipeRate', value: 1 }))).toBe('bots');
    expect(categoryOf(up('d', { type: 'dopamineMultiplier', value: 2 }))).toBe('algorithms');
    expect(
      categoryOf(up('x', { type: 'dopamineMultiplier', value: 2 }, { cost: { currency: 'BR', base: 1, multiplier: 1 } })),
    ).toBe('brainrot');
  });

  it('explicitní category má přednost před odvozením', () => {
    expect(categoryOf(up('c', { type: 'dopamineMultiplier', value: 1.1 }, { category: 'cosmetics' }))).toBe('cosmetics');
  });

  it('každý reálný upgrade má platnou kategorii a UpgradeView ji nese', () => {
    const game = new Game({ seed: 1 });
    const view = game.upgradeView();
    expect(view.length).toBeGreaterThan(0);
    for (const u of view) {
      expect(UPGRADE_CATEGORIES.some((c) => c.id === u.category)).toBe(true);
    }
  });
});

describe('effectTotalLabel — aktuální bonus na kartě (#B)', () => {
  it('Lv 0 = prázdný řetězec', () => {
    expect(effectTotalLabel(up('m', { type: 'dopamineMultiplier', value: 1.1 }), 0)).toBe('');
  });
  it('multiplikativní efekt: ×value^level', () => {
    expect(effectTotalLabel(up('m', { type: 'dopamineMultiplier', value: 1.1 }), 3)).toBe('×1.33 Dopamine');
    expect(effectTotalLabel(up('s', { type: 'bufferSpeedMult', value: 1.15 }), 2)).toBe('×1.32 load speed');
  });
  it('aditivní efekt: +value*level s jednotkou', () => {
    expect(effectTotalLabel(up('b', { type: 'bandwidth', value: 10 }), 4)).toBe('+40 Mbps');
    expect(effectTotalLabel(up('sw', { type: 'autoSwipeRate', value: 0.5 }), 3)).toBe('+1.5 swipes/s');
  });
  it('procentuální efekt (jackpot/offline)', () => {
    expect(effectTotalLabel(up('j', { type: 'critChance', value: 0.05 }), 4)).toBe('+20% jackpot chance');
    expect(effectTotalLabel(up('o', { type: 'offlineEfficiencyBonus', value: 0.1 }), 3)).toBe('+30% offline mining');
  });
  it('flag efekt (odemčení minihry)', () => {
    expect(effectTotalLabel(up('d', { type: 'bubbleUnlock', value: 1 }), 1)).toBe('active');
  });
  it('UpgradeView nese effectTotal podle úrovně', () => {
    const game = new Game({ seed: 1, upgrades: [up('m', { type: 'dopamineMultiplier', value: 1.1 })] });
    expect(game.upgradeView()[0]!.effectTotal).toBe('');
    game.wallet.add('DOP', BigNumber.of(1000));
    game.buy('m', 2);
    expect(game.upgradeView()[0]!.effectTotal).toBe('×1.21 Dopamine');
  });
});

// ── Fáze 6: Prestige + minihry ────────────────────────────────────────────────

/** Platforma s vysokým base Dopaminem (rychlé vydělání na práh prestige/miniher). */
function richPlatform(basePostValue: number): PlatformDef[] {
  return [
    { id: 'x', name: 'X', icon: '✖️', basePostValue, bandwidthPerPhone: 1, viralityBonus: 0, brainRotPerSwipe: 0, unlockAtDopamine: 0 },
  ];
}

describe('Game — prestige / Dopamine Overdose (Fáze 6)', () => {
  it('na startu nelze prestižovat (0 Clarity)', () => {
    const game = new Game({ seed: 1 });
    expect(game.clarityOnPrestige().isZero()).toBe(true);
    expect(game.canPrestige).toBe(false);
    expect(game.prestige()).toBeNull();
  });

  it('po nasbírání Dopaminu lze prestižovat → Clarity + reset běhu', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(1e8) });
    readyAndSwipe(game); // ~1e8 vydělaného Dopaminu → ratio 100 → ~10 Clarity
    expect(game.canPrestige).toBe(true);
    const gain = game.clarityOnPrestige();
    expect(gain.gte(BigNumber.ONE)).toBe(true);

    game.wallet.add('DOP', BigNumber.of(123)); // i utracený/přidaný zůstatek se vynuluje
    const summary = game.prestige()!;
    expect(summary).not.toBeNull();
    expect(summary.clarityGained.eq(gain)).toBe(true);
    expect(summary.swipes).toBeGreaterThanOrEqual(1);

    // Clarity připsána, běh resetován.
    expect(game.wallet.get('CLA').eq(gain)).toBe(true);
    expect(game.wallet.get('DOP').isZero()).toBe(true);
    expect(game.totalDopamineEarned.isZero()).toBe(true);
    expect(game.phones).toHaveLength(1);
    expect(game.canPrestige).toBe(false);
    expect(game.lifetimeStats.prestiges).toBe(1);
  });

  it('prestige vynuluje běhové upgrady, ale Clarity store zůstává', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(1e8) });
    game.wallet.add('DOP', BigNumber.of(1e6));
    game.buy('clickbait', 3);
    expect(game.upgrades.level('clickbait')).toBe(3);
    readyAndSwipe(game);
    game.prestige();
    expect(game.upgrades.level('clickbait')).toBe(0); // běhové upgrady pryč
  });

  it('emituje Prestiged s Doomscroll Wrapped', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(1e8) });
    let summary: { clarityGained: BigNumber; swipes: number } | null = null;
    game.bus.on('Prestiged', (e) => (summary = e.summary));
    readyAndSwipe(game);
    game.prestige();
    expect(summary).not.toBeNull();
  });
});

describe('Game — Clarity (Zen) upgrady', () => {
  it('buyClarity utratí Clarity a trvale boostuje produkci', () => {
    const game = new Game({ seed: 1 });
    expect(game.buyClarity('digital_monk', 1)).toBe(0); // bez Clarity nelze
    game.wallet.add('CLA', BigNumber.of(100));
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(1, 5);
    expect(game.buyClarity('digital_monk', 1)).toBe(1); // ×1.1
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(1.1, 5);
    expect(game.wallet.get('CLA').toNumber()).toBeLessThan(100);
  });

  it('Clarity virality a buffer se přičítají k běhovým hodnotám', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('CLA', BigNumber.of(100));
    expect(game.virality).toBe(0);
    game.buyClarity('inner_eye', 2); // +1.0 virality
    expect(game.virality).toBeCloseTo(1, 5);
    expect(game.bufferSpeedMultiplier).toBeCloseTo(1, 5);
    game.buyClarity('cleared_cache', 1); // ×1.12 buffer
    expect(game.bufferSpeedMultiplier).toBeCloseTo(1.12, 5);
  });

  it('Clarity upgrady přežijí prestige', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(1e8) });
    game.wallet.add('CLA', BigNumber.of(100));
    game.buyClarity('digital_monk', 1);
    readyAndSwipe(game);
    game.prestige();
    expect(game.clarity.level('digital_monk')).toBe(1); // trvalé
    expect(game.productionMultiplier.toNumber()).toBeCloseTo(1.1, 5);
  });

  it('Clarity produkce se NEstropuje měkkým stropem (na rozdíl od běhu)', () => {
    const game = new Game({ seed: 1, clarityUpgrades: [
      { id: 'mega', name: 'Mega', description: '', icon: '', cost: { currency: 'CLA', base: 1, multiplier: 1 }, effect: { type: 'dopamineMultiplier', value: 10 } },
    ] });
    game.wallet.add('CLA', BigNumber.of(100));
    game.buyClarity('mega', 8); // ×1e8 z Clarity
    expect(game.productionMultiplier.log10()).toBeCloseTo(8, 5); // bez stropu
  });
});

describe('Game — minihra Skip-Ad (M4)', () => {
  it('reklamy se objeví až po odemčení a skip dá odměnu', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(600) });
    expect(game.adsUnlocked).toBe(false);
    let spawned: { id: number } | null = null;
    game.bus.on('AdSpawned', (e) => (spawned ??= e));
    for (let i = 0; i < 200; i++) game.advance(0.2); // 40 s, ale zamčeno
    expect(spawned).toBeNull();

    readyAndSwipe(game); // ~600 vydělaného Dopaminu → odemčeno
    expect(game.adsUnlocked).toBe(true);
    for (let i = 0; i < 250 && spawned === null; i++) game.advance(0.2);
    expect(spawned).not.toBeNull();

    const before = game.wallet.get('DOP').toNumber();
    const reward = game.skipAd((spawned as unknown as { id: number }).id);
    expect(reward).not.toBeNull();
    expect(game.wallet.get('DOP').toNumber()).toBeGreaterThan(before);
    expect(game.activeAd).toBeNull();
  });

  it('reklama po čase expiruje (bez odměny)', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(600) });
    readyAndSwipe(game);
    let spawnedId: number | null = null;
    let expiredId: number | null = null;
    game.bus.on('AdSpawned', (e) => (spawnedId ??= e.id));
    game.bus.on('AdExpired', (e) => (expiredId = e.id));
    for (let i = 0; i < 250 && spawnedId === null; i++) game.advance(0.2);
    expect(spawnedId).not.toBeNull();
    for (let i = 0; i < 50; i++) game.advance(0.2); // > AD_LIFETIME
    expect(expiredId).toBe(spawnedId);
  });
});

describe('Game — minihra CAPTCHA (M4)', () => {
  function spawnCaptcha(game: Game): { id: number; cells: boolean[] } {
    let spawned: { id: number; cells: boolean[] } | null = null;
    game.bus.on('CaptchaSpawned', (e) => (spawned ??= e));
    for (let i = 0; i < 400 && spawned === null; i++) game.advance(0.2);
    expect(spawned).not.toBeNull();
    return spawned as unknown as { id: number; cells: boolean[] };
  }

  it('správné řešení dá odměnu, špatné ne', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(6000) });
    expect(game.captchasUnlocked).toBe(false);
    readyAndSwipe(game); // ~6000 → odemčeno
    expect(game.captchasUnlocked).toBe(true);

    // špatné řešení
    const c1 = spawnCaptcha(game);
    const wrong = c1.cells[0] ? [] : [0]; // záměrně neodpovídá
    const before1 = game.wallet.get('DOP').toNumber();
    expect(game.solveCaptcha(c1.id, wrong)).toBe(false);
    expect(game.wallet.get('DOP').toNumber()).toBe(before1);
    expect(game.activeCaptcha).toBeNull();

    // správné řešení (přesně dlaždice s cells=true)
    const c2 = spawnCaptcha(game);
    const correct = c2.cells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    const before2 = game.wallet.get('DOP').toNumber();
    expect(game.solveCaptcha(c2.id, correct)).toBe(true);
    expect(game.wallet.get('DOP').toNumber()).toBeGreaterThan(before2);
  });
});

describe('Game — save v2 (prestige perzistence)', () => {
  it('Clarity upgrady, lifetime a run stats přežijí round-trip', () => {
    const game = new Game({ seed: 1 });
    game.wallet.add('CLA', BigNumber.of(50));
    game.buyClarity('digital_monk', 2);
    advanceToReady(game);
    game.swipe(1); // run stat swipe

    const snap = game.serialize();
    expect(snap.version).toBe(2);

    const restored = new Game({ seed: 9 });
    restored.loadSave(snap);
    expect(restored.clarity.level('digital_monk')).toBe(2);
    expect(restored.productionMultiplier.toNumber()).toBeCloseTo(1.21, 5);
    expect(restored.wallet.get('CLA').toNumber()).toBeCloseTo(game.wallet.get('CLA').toNumber(), 0);
  });

  it('lifetime.prestiges přežije save/load', () => {
    const game = new Game({ seed: 1, platforms: richPlatform(1e8) });
    readyAndSwipe(game);
    game.prestige();
    const restored = new Game({ seed: 2, platforms: richPlatform(1e8) });
    restored.loadSave(game.serialize());
    expect(restored.lifetimeStats.prestiges).toBe(1);
  });

  it('starý save (v1 bez Clarity/lifetime) se načte s defaulty', () => {
    const game = new Game({ seed: 1 });
    const snap = game.serialize();
    // simuluj v1: odeber pole přidaná ve Fázi 6
    delete (snap as { clarityUpgrades?: unknown }).clarityUpgrades;
    delete (snap as { lifetime?: unknown }).lifetime;
    delete (snap as { run?: unknown }).run;
    const restored = new Game({ seed: 2 });
    restored.loadSave(snap);
    expect(restored.lifetimeStats.prestiges).toBe(0);
    expect(restored.clarity.level('digital_monk')).toBe(0);
  });
});

describe('Game — dopamine meter (V4/V1 color grading & chaos)', () => {
  it('je 0 v klidu a roste s Dopaminem/s, zastropováno na 1', () => {
    const game = new Game({ seed: 1 });
    expect(game.dopamineMeter).toBe(0); // bez botů žádná produkce
    game.wallet.add('DOP', BigNumber.of(1e9));
    game.buy('auto_scroller', 5);
    game.buy('fiber', 1);
    for (let i = 0; i < 10; i++) game.addPhone();
    expect(game.dopamineMeter).toBeGreaterThan(0);
    expect(game.dopamineMeter).toBeLessThanOrEqual(1);
  });

  it('blízko Overdose se blíží 1', () => {
    const game = new Game({ seed: 1, platforms: [
      { id: 'x', name: 'X', icon: '✖️', basePostValue: 1e9, bandwidthPerPhone: 1, viralityBonus: 0, brainRotPerSwipe: 0, unlockAtDopamine: 0 },
    ] });
    game.wallet.add('DOP', BigNumber.of(1e12));
    game.buy('auto_scroller', 10);
    game.buy('fiber', 5);
    for (let i = 0; i < 20; i++) game.addPhone();
    expect(game.dopamineMeter).toBeGreaterThan(0.8);
    expect(game.dopamineMeter).toBeLessThanOrEqual(1);
  });
});
