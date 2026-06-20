/**
 * BigNumber — číslo ve vědecké notaci (mantisa + celočíselný exponent).
 *
 * Idle hry s exponenciálním růstem přetečou JS `number` (max ≈ 1.8e308) během hodin.
 * Tento typ ukládá mantisu ∈ (-10,-1] ∪ {0} ∪ [1,10) a celočíselný exponent (base 10),
 * takže pojme prakticky neomezené hodnoty.
 *
 * Instance jsou neměnné (immutable). Operace vrací nové instance.
 *
 * Pozn.: Až hodnoty překročí ~1e308 ve více vrstvách, lze vyměnit za `break_eternity.js`
 * se zachováním tohoto API. Viz docs/GDD-05-Architecture.md §3.1.
 */
export class BigNumber {
  /** Mantisa: 0, nebo |m| ∈ [1, 10). */
  readonly m: number;
  /** Exponent (base 10). */
  readonly e: number;

  private constructor(m: number, e: number) {
    this.m = m;
    this.e = e;
  }

  static readonly ZERO = new BigNumber(0, 0);
  static readonly ONE = new BigNumber(1, 0);

  /** Normalizuje surovou mantisu a exponent do kanonického tvaru. */
  private static normalize(rawM: number, rawE: number): BigNumber {
    if (rawM === 0 || !Number.isFinite(rawM)) {
      return BigNumber.ZERO;
    }
    const sign = Math.sign(rawM);
    let abs = Math.abs(rawM);
    const shift = Math.floor(Math.log10(abs));
    let e = rawE + shift;
    abs /= Math.pow(10, shift);
    // Korekce float chyb (abs může vyjít 9.9999… nebo 10.0000…).
    if (abs >= 10) {
      abs /= 10;
      e += 1;
    } else if (abs < 1) {
      abs *= 10;
      e -= 1;
    }
    // Zaokrouhlení mantisy na 12 platných míst pohltí float dust (např. 6.9999…→7).
    abs = Math.round(abs * 1e12) / 1e12;
    if (abs >= 10) {
      abs /= 10;
      e += 1;
    }
    return new BigNumber(sign * abs, e);
  }

  /** Vytvoří BigNumber z běžného čísla. */
  static fromNumber(n: number): BigNumber {
    if (n === 0 || !Number.isFinite(n)) return BigNumber.ZERO;
    return BigNumber.normalize(n, 0);
  }

  /** Zkratka pro fromNumber. */
  static of(n: number): BigNumber {
    return BigNumber.fromNumber(n);
  }

  /** Vytvoří BigNumber přímo z mantisy a exponentu. */
  static fromMantissaExp(m: number, e: number): BigNumber {
    return BigNumber.normalize(m, e);
  }

  static max(a: BigNumber, b: BigNumber): BigNumber {
    return a.cmp(b) >= 0 ? a : b;
  }

  static min(a: BigNumber, b: BigNumber): BigNumber {
    return a.cmp(b) <= 0 ? a : b;
  }

  // ── Aritmetika ─────────────────────────────────────────────────────────────

  add(o: BigNumber): BigNumber {
    if (this.m === 0) return o;
    if (o.m === 0) return this;
    let big: BigNumber = this;
    let small: BigNumber = o;
    if (o.e > this.e) {
      big = o;
      small = this;
    }
    const delta = big.e - small.e;
    // Menší člen je zanedbatelný oproti přesnosti double.
    if (delta > 15) return big;
    const combined = big.m + small.m * Math.pow(10, -delta);
    return BigNumber.normalize(combined, big.e);
  }

  sub(o: BigNumber): BigNumber {
    return this.add(o.neg());
  }

  mul(o: BigNumber): BigNumber {
    if (this.m === 0 || o.m === 0) return BigNumber.ZERO;
    return BigNumber.normalize(this.m * o.m, this.e + o.e);
  }

  div(o: BigNumber): BigNumber {
    if (o.m === 0) throw new Error('BigNumber: dělení nulou');
    if (this.m === 0) return BigNumber.ZERO;
    return BigNumber.normalize(this.m / o.m, this.e - o.e);
  }

  /** Umocnění na (reálný) exponent. Zvládá obří výsledky bez přetečení. */
  pow(exp: number): BigNumber {
    if (exp === 0) return BigNumber.ONE;
    if (exp === 1) return this;
    if (this.m === 0) return BigNumber.ZERO;
    if (this.m < 0) {
      if (!Number.isInteger(exp)) {
        throw new Error('BigNumber.pow: záporný základ s neceločíselným exponentem');
      }
      const res = this.abs().pow(exp);
      return exp % 2 === 0 ? res : res.neg();
    }
    const log = this.log10() * exp;
    const e = Math.floor(log);
    const m = Math.pow(10, log - e);
    return BigNumber.normalize(m, e);
  }

  neg(): BigNumber {
    if (this.m === 0) return BigNumber.ZERO;
    return new BigNumber(-this.m, this.e);
  }

  abs(): BigNumber {
    if (this.m === 0) return BigNumber.ZERO;
    return this.m < 0 ? new BigNumber(-this.m, this.e) : this;
  }

  log10(): number {
    if (this.m === 0) return -Infinity;
    if (this.m < 0) return NaN;
    return Math.log10(this.m) + this.e;
  }

  // ── Porovnání ──────────────────────────────────────────────────────────────

  /** Vrací -1, 0, nebo 1. */
  cmp(o: BigNumber): number {
    const sa = Math.sign(this.m);
    const sb = Math.sign(o.m);
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (sa === 0) return 0; // obě nuly
    // Stejné znaménko, obě nenulové: porovnej magnitudu (exponent, pak mantisu).
    let magCmp: number;
    if (this.e !== o.e) {
      magCmp = this.e > o.e ? 1 : -1;
    } else if (this.m === o.m) {
      magCmp = 0;
    } else {
      magCmp = Math.abs(this.m) > Math.abs(o.m) ? 1 : -1;
    }
    // U záporných čísel je větší magnituda menší hodnota.
    return sa > 0 ? magCmp : -magCmp;
  }

  eq(o: BigNumber): boolean {
    return this.cmp(o) === 0;
  }
  neq(o: BigNumber): boolean {
    return this.cmp(o) !== 0;
  }
  gt(o: BigNumber): boolean {
    return this.cmp(o) > 0;
  }
  gte(o: BigNumber): boolean {
    return this.cmp(o) >= 0;
  }
  lt(o: BigNumber): boolean {
    return this.cmp(o) < 0;
  }
  lte(o: BigNumber): boolean {
    return this.cmp(o) <= 0;
  }

  isZero(): boolean {
    return this.m === 0;
  }
  isPositive(): boolean {
    return this.m > 0;
  }
  isNegative(): boolean {
    return this.m < 0;
  }

  // ── Konverze & formátování ──────────────────────────────────────────────────

  /** Převod na běžné číslo (může vrátit ±Infinity při extrémních exponentech). */
  toNumber(): number {
    if (this.m === 0) return 0;
    return this.m * Math.pow(10, this.e);
  }

  private static readonly SUFFIXES = [
    '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
  ] as const;

  /** Lidsky čitelný formát (idle notace): "0", "12.34", "1.23K", "4.56M", "7.89e42". */
  format(): string {
    if (this.m === 0) return '0';
    const neg = this.m < 0;
    const abs = this.abs();
    let body: string;

    if (abs.e < 3) {
      const n = abs.toNumber();
      body = n >= 100 ? n.toFixed(0) : trimZeros(n.toFixed(2));
    } else {
      const tier = Math.floor(abs.e / 3);
      const suffix = BigNumber.SUFFIXES[tier];
      if (suffix !== undefined) {
        const scaled = abs.m * Math.pow(10, abs.e - tier * 3); // ∈ [1, 1000)
        body = scaled.toFixed(2) + suffix;
      } else {
        body = abs.m.toFixed(2) + 'e' + abs.e;
      }
    }
    return neg ? '-' + body : body;
  }

  toString(): string {
    return this.format();
  }

  /** Ladicí reprezentace (mantisa+exponent). */
  toDebugString(): string {
    return `${this.m}e${this.e}`;
  }

  serialize(): { m: number; e: number } {
    return { m: this.m, e: this.e };
  }

  static deserialize(data: { m: number; e: number }): BigNumber {
    return BigNumber.normalize(data.m, data.e);
  }
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
