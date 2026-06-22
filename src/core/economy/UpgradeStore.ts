import { BigNumber } from '../math/BigNumber';
import { CostCurve } from './CostCurve';
import type { UpgradeDef } from '../content/upgrades';

/**
 * UpgradeStore — eviduje úrovně koupených upgradů a počítá ceny přes CostCurve.
 *
 * Čistá datová vrstva: utrácení měn a aplikaci efektů řeší orchestrující `Game`
 * (viz docs/GDD-05-Architecture.md §4). Viz též docs/GDD-02-Mechanics.md §2, §4.
 */
export class UpgradeStore {
  private readonly defsById = new Map<string, UpgradeDef>();
  private readonly curves = new Map<string, CostCurve>();
  private readonly levels = new Map<string, number>();

  constructor(defs: readonly UpgradeDef[]) {
    for (const d of defs) {
      this.defsById.set(d.id, d);
      this.curves.set(d.id, new CostCurve(BigNumber.of(d.cost.base), d.cost.multiplier));
    }
  }

  get all(): UpgradeDef[] {
    return [...this.defsById.values()];
  }

  def(id: string): UpgradeDef | undefined {
    return this.defsById.get(id);
  }

  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  /** Kolik úrovní ještě lze koupit (Infinity = neomezeně). */
  remaining(id: string): number {
    const def = this.defsById.get(id);
    if (!def) return 0;
    if (def.maxLevel === undefined) return Number.POSITIVE_INFINITY;
    return Math.max(0, def.maxLevel - this.level(id));
  }

  isMaxed(id: string): boolean {
    return this.remaining(id) <= 0;
  }

  /** Cena další úrovně, nebo null pokud je upgrade na maximu. */
  nextCost(id: string): BigNumber | null {
    if (this.isMaxed(id)) return null;
    return this.curve(id).priceAt(this.level(id));
  }

  /** Cena `count` dalších úrovní najednou. */
  bulkCost(id: string, count: number): BigNumber {
    return this.curve(id).bulkPrice(this.level(id), count);
  }

  /** Kolik úrovní lze koupit za `budget`. */
  maxAffordable(id: string, budget: BigNumber): number {
    return this.curve(id).maxAffordable(this.level(id), budget);
  }

  incrementLevel(id: string, by = 1): void {
    this.levels.set(id, this.level(id) + by);
  }

  /** Vynuluje všechny úrovně (prestige reset běhu). Definice a křivky zůstávají. */
  reset(): void {
    this.levels.clear();
  }

  serialize(): Record<string, number> {
    return Object.fromEntries(this.levels);
  }

  loadLevels(data: Record<string, number>): void {
    for (const [id, lvl] of Object.entries(data)) {
      if (this.defsById.has(id)) this.levels.set(id, lvl);
    }
  }

  private curve(id: string): CostCurve {
    const c = this.curves.get(id);
    if (!c) throw new Error(`UpgradeStore: neznámý upgrade ${id}`);
    return c;
  }
}
