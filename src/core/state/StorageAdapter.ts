/**
 * Contrato mínimo de armazenamento chave→texto. O core só conhece isto;
 * a implementação com localStorage fica em src/game/services (fora do core),
 * e os testes usam MemoryStorageAdapter.
 */
export interface StorageAdapter {
  getItem(key: string): string | null;
  /** Pode lançar (ex.: cota do navegador estourada). O SaveService trata. */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}
