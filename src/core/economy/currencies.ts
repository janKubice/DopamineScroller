/**
 * Definice měn. Viz docs/GDD-02-Mechanics.md §1.
 */
export type CurrencyId =
  | 'DOP' // Dopamin – hlavní měna
  | 'LIK' // Likes
  | 'COM' // Comments
  | 'SHR' // Shares
  | 'BR' // Brain Rot
  | 'CLA'; // Clarity (prestige)

export interface CurrencyDef {
  readonly id: CurrencyId;
  readonly name: string;
  readonly symbol: string;
}

export const CURRENCIES: Readonly<Record<CurrencyId, CurrencyDef>> = {
  DOP: { id: 'DOP', name: 'Dopamin', symbol: '🧠' },
  LIK: { id: 'LIK', name: 'Likes', symbol: '👍' },
  COM: { id: 'COM', name: 'Comments', symbol: '💬' },
  SHR: { id: 'SHR', name: 'Shares', symbol: '🔁' },
  BR: { id: 'BR', name: 'Brain Rot', symbol: '🧟' },
  CLA: { id: 'CLA', name: 'Clarity', symbol: '🧘' },
};

export const ALL_CURRENCIES: readonly CurrencyId[] = Object.keys(CURRENCIES) as CurrencyId[];
