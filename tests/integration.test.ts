import { describe, expect, it } from 'vitest';
import { statsAtLevel } from '@/core/progression/stats';
import { GameStore } from '@/core/state/GameStore';
import { createNewGameState } from '@/core/state/newGame';
import { SaveService } from '@/core/state/SaveService';
import { MemoryStorageAdapter } from '@/core/state/StorageAdapter';
import { loadGameData } from '@/data/loadData';
import { EventBus } from '@/shared/EventBus';
import type { GameEvents } from '@/shared/events';

/** Fluxo completo da Fase 0 com os dados reais: o mesmo caminho que src/game/context.ts percorre. */
describe('integração: dados reais → estado → save → reload', () => {
  it('novo jogo, jogar um pouco, salvar, "fechar o navegador" e continuar', () => {
    const storage = new MemoryStorageAdapter();
    const data = loadGameData();

    // --- sessão 1 ---
    const events1 = new EventBus<GameEvents>();
    const saves1 = new SaveService({ storage, events: events1 });
    expect(saves1.load('slot-1')).toMatchObject({ ok: false, error: { code: 'not-found' } });

    const store1 = new GameStore(createNewGameState(data), events1);
    const goku = store1.view.party[0]!;
    const gokuDef = data.characters.require(goku.characterId);
    expect(goku.currentHp).toBe(statsAtLevel(gokuDef, goku.level).hp);

    store1.setFlag('pilaf-saga:met-bulma', true);
    store1.addItem('senzu-bean', 1);
    store1.removeItem('roasted-meat', 1);
    store1.addPlayTime(61_000);
    expect(saves1.save('slot-1', store1.snapshot()).ok).toBe(true);

    // --- sessão 2 (objetos novos, mesmo armazenamento) ---
    const events2 = new EventBus<GameEvents>();
    const saves2 = new SaveService({ storage, events: events2 });
    const loaded = saves2.load('slot-1');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const store2 = new GameStore(loaded.value, events2);
    expect(store2.getFlag('pilaf-saga:met-bulma')).toBe(true);
    expect(store2.getItemCount('senzu-bean')).toBe(1);
    expect(store2.getItemCount('roasted-meat')).toBe(2);
    expect(store2.view.meta.playTimeMs).toBe(61_000);
    expect(store2.snapshot()).toEqual(store1.snapshot());

    // todo item do inventário salvo existe nos dados
    for (const itemId of Object.keys(store2.view.inventory)) data.items.require(itemId);
  });
});
