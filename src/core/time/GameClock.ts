/**
 * GameClock — centrální tick systém s fixním logickým krokem.
 *
 * Veškerá herní logika postupuje přes jediné místo (žádné časovače na entitách).
 * Důvody a návrh viz docs/GDD-05-Architecture.md §3.3.
 *
 *  - `update(realDtMs)` volá prezentační smyčka (requestAnimationFrame). Akumuluje reálný
 *    čas a krokuje doménu po fixních krocích `stepMs` (deterministická simulace nezávislá
 *    na snímkové frekvenci).
 *  - `advanceBy(seconds)` slouží k offline převinutí o velké dt (po načtení save). Doména
 *    musí pro velká dt umět uzavřený dopočet (closed-form) — viz Fáze 7. Ve Fázi 1
 *    (jen manuální hra) offline negeneruje nic, což je korektní.
 */
export interface Tickable {
  advance(dtSeconds: number): void;
}

const MAX_STEPS_PER_UPDATE = 1000; // ochrana proti "spirále smrti" při dlouhém zámrzu

export class GameClock {
  private readonly stepMs: number;
  private readonly stepSeconds: number;
  private accumulatorMs = 0;
  private elapsedSeconds = 0;

  constructor(
    private readonly target: Tickable,
    stepMs = 100,
  ) {
    this.stepMs = stepMs;
    this.stepSeconds = stepMs / 1000;
  }

  /** Reálné odměření času z prezentační smyčky. */
  update(realDtMs: number): void {
    if (realDtMs <= 0) return;
    this.accumulatorMs += realDtMs;
    let steps = 0;
    while (this.accumulatorMs >= this.stepMs && steps < MAX_STEPS_PER_UPDATE) {
      this.target.advance(this.stepSeconds);
      this.accumulatorMs -= this.stepMs;
      this.elapsedSeconds += this.stepSeconds;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_UPDATE) {
      // Zahodíme přebytek, aby se hra po dlouhém zámrzu nezasekla v dohánění.
      this.accumulatorMs = 0;
    }
  }

  /** Offline převinutí o velké dt (jeden doménový krok; closed-form catch-up je Fáze 7). */
  advanceBy(seconds: number): void {
    if (seconds <= 0) return;
    this.target.advance(seconds);
    this.elapsedSeconds += seconds;
  }

  /** Kolik herních sekund už uběhlo. */
  get elapsed(): number {
    return this.elapsedSeconds;
  }
}
