import { SAVE_VERSION, type SaveState } from '../core/persistence/SaveData';

/**
 * SaveManager — perzistence do localStorage (prezentační vrstva, browser-specific).
 * Doména zůstává čistá: poskytuje `serialize()`/`loadSave()`/`computeOfflineEarnings()`,
 * SaveManager k tomu doplní časové razítko a ukládání. Viz docs/GDD-05-Architecture.md §6.
 */
export interface LoadedSave {
  state: SaveState;
  savedAt: number; // Date.now() v okamžiku uložení
}

interface StoredPayload {
  savedAt: number;
  state: SaveState;
}

export class SaveManager {
  private timer: number | null = null;

  constructor(private readonly key = 'dopamine-scroller-save') {}

  save(state: SaveState): void {
    try {
      const payload: StoredPayload = { savedAt: Date.now(), state };
      localStorage.setItem(this.key, JSON.stringify(payload));
    } catch {
      // localStorage nemusí být dostupný (privátní režim, kvóta) – ignorujeme.
    }
  }

  load(): LoadedSave | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredPayload;
      if (!parsed?.state || parsed.state.version !== SAVE_VERSION) return null;
      return { state: parsed.state, savedAt: parsed.savedAt };
    } catch {
      return null;
    }
  }

  startAutosave(snapshot: () => SaveState, intervalMs = 5000): void {
    this.stopAutosave();
    this.timer = window.setInterval(() => this.save(snapshot()), intervalMs);
  }

  stopAutosave(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}
