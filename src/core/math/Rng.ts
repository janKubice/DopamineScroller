/**
 * Rng — deterministický seedovaný generátor pseudonáhodných čísel (mulberry32).
 *
 * Veškerá herní náhoda (rarity postů, reakce na komentáře, Hidden Gems) MUSÍ jít přes
 * tento generátor, ne přes Math.random(). Důvody:
 *   - reprodukovatelné testy ekonomiky (stejný seed → stejný průběh),
 *   - kompatibilita save (seed je součástí uloženého stavu).
 *
 * Stav je serializovatelný. Pro oddělené streamy (logika vs. kosmetika) použij fork().
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Další číslo v intervalu [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Reálné číslo v intervalu [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Celé číslo v intervalu [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number {
    return Math.floor(this.range(minInclusive, maxExclusive));
  }

  /** True s pravděpodobností p. */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Náhodný prvek z neprázdného pole. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: prázdné pole');
    const item = arr[this.int(0, arr.length)];
    return item as T;
  }

  /** `count` různých prvků z pole (bez opakování). Vrací min(count, arr.length) prvků. */
  sampleDistinct<T>(arr: readonly T[], count: number): T[] {
    const n = Math.min(count, arr.length);
    const pool = arr.slice();
    const result: T[] = [];
    for (let i = 0; i < n; i++) {
      const idx = this.int(0, pool.length);
      result.push(pool[idx] as T);
      pool[idx] = pool[pool.length - 1] as T;
      pool.pop();
    }
    return result;
  }

  /** Vzorek z normálního rozdělení (Box-Muller). Užité pro reakce na komentáře. */
  gaussian(mean = 0, sd = 1): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + z * sd;
  }

  /** Odvodí nezávislý generátor (oddělený stream). */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 0xffffffff));
  }

  serialize(): { state: number } {
    return { state: this.state };
  }

  /** Obnoví vnitřní stav (pro načtení uložené hry). */
  restore(data: { state: number }): void {
    this.state = data.state >>> 0;
  }

  static deserialize(data: { state: number }): Rng {
    const rng = new Rng(0);
    rng.restore(data);
    return rng;
  }
}
