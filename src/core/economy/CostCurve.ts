import { BigNumber } from '../math/BigNumber';

/**
 * CostCurve — exponenciální cenová křivka pro opakované nákupy.
 *
 * Cena N-tého kusu: ZakladniCena × Multiplikator^(početJižZakoupených).
 * Hromadná cena: součet geometrické řady. Viz docs/GDD-02-Mechanics.md §2.
 */
export class CostCurve {
  constructor(
    private readonly baseCost: BigNumber,
    private readonly multiplier: number,
  ) {
    if (multiplier < 1) {
      throw new Error('CostCurve: multiplikátor musí být >= 1');
    }
  }

  /** Cena dalšího kusu, když už hráč vlastní `owned`. */
  priceAt(owned: number): BigNumber {
    return this.baseCost.mul(BigNumber.of(this.multiplier).pow(owned));
  }

  /** Cena `count` kusů najednou počínaje vlastnictvím `owned`. */
  bulkPrice(owned: number, count: number): BigNumber {
    if (count <= 0) return BigNumber.ZERO;
    const first = this.priceAt(owned);
    if (this.multiplier === 1) {
      return first.mul(BigNumber.of(count));
    }
    // first × (mult^count − 1) / (mult − 1)
    const numerator = BigNumber.of(this.multiplier).pow(count).sub(BigNumber.ONE);
    const denominator = BigNumber.of(this.multiplier - 1);
    return first.mul(numerator).div(denominator);
  }

  /** Kolik kusů lze koupit za `budget`, když hráč vlastní `owned`. */
  maxAffordable(owned: number, budget: BigNumber): number {
    const first = this.priceAt(owned);
    if (budget.lt(first)) return 0;

    if (this.multiplier === 1) {
      return Math.floor(budget.div(first).toNumber());
    }

    // Odhad přes logaritmus: k ≈ log_mult( (budget/first)·(mult−1) + 1 )
    const ratio = budget.div(first);
    const inner = ratio.mul(BigNumber.of(this.multiplier - 1)).add(BigNumber.ONE);
    let k = Math.floor(inner.log10() / Math.log10(this.multiplier));
    if (k < 0) k = 0;

    // Korekce float chyb na hranici (max pár iterací).
    while (k > 0 && this.bulkPrice(owned, k).gt(budget)) k--;
    while (this.bulkPrice(owned, k + 1).lte(budget)) k++;
    return k;
  }
}
