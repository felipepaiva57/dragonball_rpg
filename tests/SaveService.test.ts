import { describe, expect, it, vi } from 'vitest';
import { CURRENT_SAVE_VERSION, type MigrationMap } from '@/core/state/migrations';
import { createNewGameState, type NewGameConfig } from '@/core/state/newGame';
import { SaveService } from '@/core/state/SaveService';
import { MemoryStorageAdapter, type StorageAdapter } from '@/core/state/StorageAdapter';
import { EventBus } from '@/shared/EventBus';
import type { GameEvents } from '@/shared/events';
import { validRegistry } from './helpers';

const config: NewGameConfig = { campaignId: 'main', party: [{ characterId: 'hero', level: 3 }], inventory: { meat: 2 } };

function setup(overrides: Partial<ConstructorParameters<typeof SaveService>[0]> = {}) {
  const storage = new MemoryStorageAdapter();
  const events = new EventBus<GameEvents>();
  const service = new SaveService({ storage, events, clock: () => 5000, ...overrides });
  const state = createNewGameState(validRegistry(), config, 1000);
  return { storage, events, service, state };
}

describe('SaveService — gravar e carregar', () => {
  it('faz round-trip sem perder dados e emite eventos', () => {
    const { events, service, state } = setup();
    const written = vi.fn();
    const loaded = vi.fn();
    events.on('save:written', written);
    events.on('save:loaded', loaded);

    const saved = service.save('slot-1', state);
    const result = service.load('slot-1');

    expect(saved.ok).toBe(true);
    expect(result).toEqual({ ok: true, value: state });
    expect(written).toHaveBeenCalledWith({ slot: 'slot-1' });
    expect(loaded).toHaveBeenCalledWith({ slot: 'slot-1' });
  });

  it('grava a versão atual e o horário no envelope', () => {
    const { storage, service, state } = setup();
    service.save('a', state);
    const raw = JSON.parse(storage.getItem('dbrpg:save:a')!);
    expect(raw.version).toBe(CURRENT_SAVE_VERSION);
    expect(raw.savedAt).toBe(5000);
  });

  it('slot vazio → not-found', () => {
    const { service } = setup();
    expect(service.load('nada')).toMatchObject({ ok: false, error: { code: 'not-found' } });
    expect(service.has('nada')).toBe(false);
  });

  it('delete remove o slot', () => {
    const { service, state } = setup();
    service.save('a', state);
    service.delete('a');
    expect(service.has('a')).toBe(false);
  });

  it('recusa gravar um estado inválido e não toca no slot existente', () => {
    const { storage, service, state } = setup();
    service.save('a', state);
    const before = storage.getItem('dbrpg:save:a');

    const broken = { ...state, party: [{ ...state.party[0]!, level: 0 }] };
    const result = service.save('a', broken);

    expect(result).toMatchObject({ ok: false, error: { code: 'invalid' } });
    expect(storage.getItem('dbrpg:save:a')).toBe(before);
  });

  it('falha de armazenamento (cota) vira storage-failed, sem lançar', () => {
    const failing: StorageAdapter = {
      ...new MemoryStorageAdapter(),
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      keys: () => [],
    };
    const { service, state } = setup({ storage: failing });
    expect(service.save('a', state)).toMatchObject({ ok: false, error: { code: 'storage-failed' } });
  });
});

describe('SaveService — saves ruins', () => {
  it('texto que não é JSON → corrupted', () => {
    const { storage, service } = setup();
    storage.setItem('dbrpg:save:a', '{not json');
    expect(service.load('a')).toMatchObject({ ok: false, error: { code: 'corrupted' } });
  });

  it('JSON sem envelope → corrupted', () => {
    const { storage, service } = setup();
    storage.setItem('dbrpg:save:a', JSON.stringify({ hello: 'world' }));
    expect(service.load('a')).toMatchObject({ ok: false, error: { code: 'corrupted' } });
  });

  it('estado adulterado → invalid', () => {
    const { storage, service, state } = setup();
    storage.setItem('dbrpg:save:a', JSON.stringify({ version: CURRENT_SAVE_VERSION, savedAt: 1, state: { ...state, party: 'oops' } }));
    expect(service.load('a')).toMatchObject({ ok: false, error: { code: 'invalid' } });
  });

  it('save de versão futura → newer-version (nunca tenta ler às cegas)', () => {
    const { storage, service, state } = setup();
    storage.setItem('dbrpg:save:a', JSON.stringify({ version: CURRENT_SAVE_VERSION + 1, savedAt: 1, state }));
    expect(service.load('a')).toMatchObject({ ok: false, error: { code: 'newer-version' } });
  });
});

describe('SaveService — migrações', () => {
  // Simula um jogo na v3 cujo formato antigo tinha "gold" solto e o novo o move para meta.
  const migrations: MigrationMap = {
    1: (s) => ({ ...(s as object), legacy: true }), // v1 → v2 (campo extra será removido pela v3)
    2: (s) => {
      const { legacy: _legacy, ...rest } = s as Record<string, unknown> & { legacy?: boolean };
      return rest;
    },
  };

  it('aplica a cadeia de migrações em ordem e valida o resultado', () => {
    const { storage, service, state } = setup({ migrations, currentVersion: 3 });
    storage.setItem('dbrpg:save:old', JSON.stringify({ version: 1, savedAt: 1, state }));

    const result = service.load('old');

    expect(result).toEqual({ ok: true, value: state });
  });

  it('falha de migração vira migration-failed', () => {
    const { storage, service, state } = setup({
      migrations: {
        1: () => {
          throw new Error('x');
        },
      },
      currentVersion: 2,
    });
    storage.setItem('dbrpg:save:old', JSON.stringify({ version: 1, savedAt: 1, state }));
    expect(service.load('old')).toMatchObject({ ok: false, error: { code: 'migration-failed' } });
  });

  it('migração ausente na cadeia vira migration-failed', () => {
    const { storage, service, state } = setup({ migrations: {}, currentVersion: 2 });
    storage.setItem('dbrpg:save:old', JSON.stringify({ version: 1, savedAt: 1, state }));
    expect(service.load('old')).toMatchObject({ ok: false, error: { code: 'migration-failed' } });
  });
});

describe('SaveService — listar, exportar, importar', () => {
  it('listSlots mostra slots válidos e também os ilegíveis, com o erro', () => {
    const { storage, service, state } = setup();
    service.save('slot-1', state);
    storage.setItem('dbrpg:save:slot-2', 'lixo');
    storage.setItem('outra-chave', 'ignorada');

    const list = service.listSlots();

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ slot: 'slot-1', ok: true, value: { savedAt: 5000, campaignId: 'main', playTimeMs: 0 } });
    expect(list[1]).toMatchObject({ slot: 'slot-2', ok: false, error: { code: 'corrupted' } });
  });

  it('exporta e importa em outro slot (e em outro armazenamento) preservando o estado', () => {
    const a = setup();
    a.service.save('slot-1', a.state);
    const exported = a.service.exportSlot('slot-1');
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    const b = setup();
    const imported = b.service.importSlot('slot-9', exported.value);

    expect(imported).toEqual({ ok: true, value: a.state });
    expect(b.service.load('slot-9')).toEqual({ ok: true, value: a.state });
  });

  it('importar texto inválido não grava nada', () => {
    const { storage, service } = setup();
    expect(service.importSlot('a', 'não sou um save')).toMatchObject({ ok: false, error: { code: 'corrupted' } });
    expect(storage.keys()).toHaveLength(0);
  });

  it('exportar slot vazio ou corrompido falha', () => {
    const { storage, service } = setup();
    expect(service.exportSlot('a')).toMatchObject({ ok: false, error: { code: 'not-found' } });
    storage.setItem('dbrpg:save:a', '???');
    expect(service.exportSlot('a')).toMatchObject({ ok: false, error: { code: 'corrupted' } });
  });
});
