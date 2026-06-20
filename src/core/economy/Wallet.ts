import { BigNumber } from '../math/BigNumber';
import type { CurrencyId } from './currencies';

/**
 * Wallet — držitel zůstatků všech měn.
 *
 * Čistá datová struktura bez vazby na eventy či UI. Eventy o změnách měn emituje až
 * orchestrující `Game` (viz docs/GDD-05-Architecture.md §4). Všechny hodnoty jsou BigNumber.
 */
export class Wallet {
  private readonly balances = new Map<CurrencyId, BigNumber>();

  get(id: CurrencyId): BigNumber {
    return this.balances.get(id) ?? BigNumber.ZERO;
  }

  set(id: CurrencyId, amount: BigNumber): void {
    this.balances.set(id, amount);
  }

  add(id: CurrencyId, amount: BigNumber): void {
    this.balances.set(id, this.get(id).add(amount));
  }

  canAfford(id: CurrencyId, cost: BigNumber): boolean {
    return this.get(id).gte(cost);
  }

  /** Pokusí se utratit. Vrací true při úspěchu, jinak nechá zůstatek beze změny. */
  spend(id: CurrencyId, cost: BigNumber): boolean {
    if (!this.canAfford(id, cost)) return false;
    this.balances.set(id, this.get(id).sub(cost));
    return true;
  }

  /** Nahradí všechny zůstatky uloženými hodnotami (pro načtení hry). */
  load(data: Record<string, { m: number; e: number }>): void {
    this.balances.clear();
    for (const [id, value] of Object.entries(data)) {
      this.balances.set(id as CurrencyId, BigNumber.deserialize(value));
    }
  }

  serialize(): Record<string, { m: number; e: number }> {
    const out: Record<string, { m: number; e: number }> = {};
    for (const [id, value] of this.balances) {
      out[id] = value.serialize();
    }
    return out;
  }

  static deserialize(data: Record<string, { m: number; e: number }>): Wallet {
    const wallet = new Wallet();
    for (const [id, value] of Object.entries(data)) {
      wallet.balances.set(id as CurrencyId, BigNumber.deserialize(value));
    }
    return wallet;
  }
}
