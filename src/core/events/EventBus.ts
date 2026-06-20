/**
 * EventBus — typovaný publish/subscribe kanál z DOMÉNY do PREZENTACE.
 *
 * Doména emituje doménové eventy (SwipeResolved, CommentReaction, ChaosLevelChanged…),
 * prezentace se na ně přihlašuje. Doména NIKDY nevolá UI přímo — tím zůstává agnostická
 * vůči rendereru. Viz docs/GDD-05-Architecture.md §4.
 *
 * Generický parametr `E` je mapa "název eventu -> typ payloadu".
 */
export type EventMap = Record<string, unknown>;
export type Listener<T> = (payload: T) => void;

export class EventBus<E extends EventMap> {
  private readonly listeners = new Map<keyof E, Set<Listener<unknown>>>();

  /** Přihlásí posluchače. Vrací funkci pro odhlášení. */
  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<unknown>);
    return () => this.off(type, fn);
  }

  /** Přihlásí posluchače jen na jedno doručení. */
  once<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    const off = this.on(type, (payload) => {
      off();
      fn(payload);
    });
    return off;
  }

  off<K extends keyof E>(type: K, fn: Listener<E[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    // Kopie kvůli bezpečnému odhlášení během iterace.
    for (const fn of [...set]) {
      (fn as Listener<E[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
