/**
 * Typy uloženého stavu hry. Viz docs/GDD-05-Architecture.md §6.
 *
 * Ukládá se jen perzistentní stav; přechodný stav telefonů (aktuální post, časovače,
 * běžící reakce) se po načtení resetuje do bufferingu. RNG stav je součástí save kvůli
 * reprodukovatelnosti.
 */
export const SAVE_VERSION = 2;

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
  // přidáno ve Fázi 6 – Prestige (volitelné kvůli zpětné kompatibilitě se save v1)
  clarityUpgrades?: Record<string, number>; // trvalé Zen upgrady (přežijí prestige)
  lifetime?: {
    prestiges: number;
    clarityEarned: { m: number; e: number };
    dopamineAllTime: { m: number; e: number };
  };
  run?: { swipes: number; likes: number; comments: number; gems: number; jackpots: number; seconds: number };
  // přidáno ve Fázi 9 (volitelné kvůli zpětné kompatibilitě)
  achievements?: string[]; // id odemčených achievementů
  narrative?: string[]; // id už viděných hlášek Algoritmu
}
