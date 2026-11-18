type Listener<T> = (payload: T) => void;

/**
 * Barramento de eventos tipado. É a ponte entre a lógica (core) e a
 * apresentação (Phaser): o core emite fatos ("flag mudou", "save gravado")
 * sem saber quem escuta; as cenas reagem sem acessar os internos do core.
 */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /** Registra um ouvinte e devolve a função que o remove. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  /**
   * Notifica os ouvintes. Um ouvinte que lança erro não impede os demais
   * de rodarem; o erro é reportado no console.
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Cópia: ouvintes podem se remover (once) durante a emissão.
    for (const listener of [...set] as Listener<Events[K]>[]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[EventBus] erro em ouvinte de "${String(event)}":`, error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
