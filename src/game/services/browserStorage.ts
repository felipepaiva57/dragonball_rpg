import { MemoryStorageAdapter, type StorageAdapter } from '@/core/state/StorageAdapter';

class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: Storage) {}

  getItem(key: string): string | null {
    return this.storage.getItem(key);
  }
  setItem(key: string, value: string): void {
    this.storage.setItem(key, value);
  }
  removeItem(key: string): void {
    this.storage.removeItem(key);
  }
  keys(): string[] {
    return Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i)).filter(
      (k): k is string => k !== null,
    );
  }
}

export interface BrowserStorage {
  adapter: StorageAdapter;
  /** false quando o navegador bloqueia localStorage (ex.: modo privado): o save só dura a sessão. */
  persistent: boolean;
}

export function createBrowserStorage(): BrowserStorage {
  try {
    const probe = '__dbrpg_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { adapter: new LocalStorageAdapter(window.localStorage), persistent: true };
  } catch {
    return { adapter: new MemoryStorageAdapter(), persistent: false };
  }
}
