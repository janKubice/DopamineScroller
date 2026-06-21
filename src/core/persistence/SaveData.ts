/**
 * Typy uloženého stavu hry. Viz docs/GDD-05-Architecture.md §6.
 *
 * Ukládá se jen perzistentní stav; přechodný stav telefonů (aktuální post, časovače,
 * běžící reakce) se po načtení resetuje do bufferingu. RNG stav je součástí save kvůli
 * reprodukovatelnosti.
 */
export const SAVE_VERSION = 1;

export interface SaveState {
  version: number;
  rng: { state: number };
  wallet: Record<string, { m: number; e: number }>;
  upgrades: Record<string, number>; // id -> úroveň
  streak: number;
  virality: number;
  phoneCount: number;
  // přidáno ve Fázi 5 (volitelné kvůli zpětné kompatibilitě se staršími save)
  activePlatform?: string;
  totalDopamine?: { m: number; e: number };
}
