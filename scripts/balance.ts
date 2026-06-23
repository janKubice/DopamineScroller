/**
 * Balance simulator (dev tool) — `npm run balance`.
 *
 * Pouští doménu HEADLESS a simuluje „aktivního hráče" (swipe ready telefonů + každou sekundu
 * přepni na nejvyšší platformu + greedy nákup nejlevnějšího affordable upgradu), aby objektivně
 * změřil PACING: čas do 1. prestige a křivku produkce. Slouží k ladění konstant a jako pojistka
 * proti rozbití balancu. Neběží v `npm test`.
 *
 * Pozn.: „optimální" greedy sim je rychlejší než ležérní hra (řádově ~2× dle naměřeného poměru
 * 6.4 vs 16 min), takže cílový sim-čas ~20–25 min ≈ ležérní ~45–60 min.
 */
import { Game, CLARITY_THRESHOLD } from '../src/core/domain/Game';
import { BigNumber } from '../src/core/math/BigNumber';

const MARKS = [60, 120, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 3000, 3600, 4800, 6000];

function simulate(seed: number): void {
  const game = new Game({ seed });
  const PRESTIGE = BigNumber.of(CLARITY_THRESHOLD); // canPrestige práh (vydělaný Dopamin pro 1. Clarity)
  let t = 0;
  let buyTimer = 0;
  let mi = 0;
  let firstCosmetic = -1;
  let lastCosmetic = -1;
  let prestigeAt = -1;
  const cap = 90 * 60; // strop simulace (min*s) – cíl je 45–60 min

  while (t < cap) {
    game.advance(0.2);
    t += 0.2;
    buyTimer += 0.2;
    for (const p of game.phones) if (p.isReady) game.swipe(p.id);

    if (buyTimer >= 1) {
      buyTimer = 0;
      const plats = game.platformView().filter((p) => p.unlocked);
      if (plats.length) game.setPlatform(plats[plats.length - 1]!.id);
      let bought = true;
      while (bought) {
        bought = false;
        const opts = game
          .upgradeView()
          .filter((u) => u.affordable && !u.maxed && !u.locked)
          .sort((a, b) => a.cost.log10() - b.cost.log10());
        for (const u of opts) {
          if (game.buy(u.id, 1) > 0) {
            bought = true;
            if (u.category === 'cosmetics') {
              if (firstCosmetic < 0) firstCosmetic = t;
              lastCosmetic = t;
            }
            break;
          }
        }
      }
    }

    if (prestigeAt < 0 && game.canPrestige) prestigeAt = t;

    if (mi < MARKS.length && t >= MARKS[mi]!) {
      const m = MARKS[mi]!;
      console.log(
        `  ${(m / 60).toString().padStart(3)}min  total=${pad(game.totalDopamineEarned.format())}  prod×${pad(game.productionMultiplier.format())}  raw×${pad(game.rawProductionMultiplier.format())}  DOP/s≈${pad(game.estimatedDopaminePerSecond.format())}  📱${game.phones.length}  ${game.activePlatform.id}${game.isProductionSoftCapped ? '  [softcap]' : ''}`,
      );
      mi++;
    }
    if (prestigeAt >= 0) break; // hlavní metrika = čas do 1. prestige
  }

  console.log('  ─────────────────────────────────────────────');
  console.log(`  >>> 1. PRESTIGE @ ${prestigeAt >= 0 ? (prestigeAt / 60).toFixed(1) + ' min' : 'NEDOSAŽENO'}  (canPrestige práh = ${PRESTIGE.format()} vydělaného Dopaminu)`);
  console.log(`  >>> clarityGain @ prestige = ${game.clarityOnPrestige().format()},  produkce× = ${game.productionMultiplier.format()}`);
  console.log(`  >>> cosmetics: 1. @ ${fmtMin(firstCosmetic)}, poslední @ ${fmtMin(lastCosmetic)} (rozpětí ${firstCosmetic >= 0 ? ((lastCosmetic - firstCosmetic) / 60).toFixed(1) : '–'} min)`);
}

function pad(s: string): string {
  return s.padStart(9);
}
function fmtMin(t: number): string {
  return t < 0 ? '–' : (t / 60).toFixed(1) + 'min';
}

console.log('=== BALANCE SIM (aktivní hráč, greedy nákup) ===');
simulate(12345);
