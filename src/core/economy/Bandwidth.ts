/**
 * Bandwidth — propustnost sítě jako zásadní omezovač. Viz docs/GDD-02-Mechanics.md §3.
 *
 * Čisté funkce (bez stavu): Game jim předá aktuální spotřebu a kapacitu. Při překročení
 * kapacity se buffering VŠECH telefonů exponenciálně zpomalí.
 */
export const OVERLOAD_EXPONENT = 2;

/** Zatížení sítě = spotřeba / kapacita. Infinity, pokud není žádná kapacita. */
export function bandwidthLoad(consumption: number, capacity: number): number {
  if (capacity <= 0) return consumption > 0 ? Number.POSITIVE_INFINITY : 0;
  return consumption / capacity;
}

/**
 * Násobič rychlosti bufferingu (1 = plná rychlost). Při přetížení (load > 1) klesá
 * exponenciálně → načítání trvá déle. Předává se do `Phone.advance(dt, bufferScale)`.
 */
export function bufferScale(consumption: number, capacity: number): number {
  const load = bandwidthLoad(consumption, capacity);
  if (load <= 1) return 1;
  if (!Number.isFinite(load)) return 0;
  return Math.pow(load, -OVERLOAD_EXPONENT);
}
