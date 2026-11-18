import { describe, expect, it, vi } from 'vitest';
import { GameStore } from '@/core/state/GameStore';
import { createNewGameState, type NewGameConfig } from '@/core/state/newGame';
import { GameStateSchema } from '@/core/state/schemas';
import { EventBus } from '@/shared/EventBus';
import type { GameEvents } from '@/shared/events';
import { validRegistry } from './helpers';

const config: NewGameConfig = {
  campaignId: 'main',
  party: [{ characterId: 'hero', level: 1 }],
  inventory: { meat: 2 },
};

function setup() {
  const events = new EventBus<GameEvents>();
  const data = validRegistry();
  const state = createNewGameState(data, config, 1000);
  return { events, data, state, store: new GameStore(state, events) };
}

describe('createNewGameState', () => {
  it('gera um estado válido pelo schema, com equipe no HP/KI máximos', () => {
    const { state } = setup();
    expect(GameStateSchema.safeParse(state).success).toBe(true);
    expect(state.party[0]).toMatchObject({ characterId: 'hero', level: 1, currentHp: 20, currentKi: 10, knownMoves: ['punch'] });
    expect(state.meta.createdAt).toBe(1000);
    expect(state.inventory).toEqual({ meat: 2 });
  });

  it('falha cedo se a configuração apontar para dado inexistente', () => {
    const data = validRegistry();
    expect(() => createNewGameState(data, { ...config, party: [{ characterId: 'ghost', level: 1 }] })).toThrow(/não existe/);
    expect(() => createNewGameState(data, { ...config, inventory: { ghost: 1 } })).toThrow(/não existe/);
  });
});

describe('GameStore', () => {
  it('setFlag emite evento com valor anterior e ignora valor igual', () => {
    const { events, store } = setup();
    const fn = vi.fn();
    events.on('flag:changed', fn);

    store.setFlag('met-bulma', true);
    store.setFlag('met-bulma', true); // sem mudança
    store.setFlag('met-bulma', false);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, { key: 'met-bulma', value: true, previous: undefined });
    expect(fn).toHaveBeenNthCalledWith(2, { key: 'met-bulma', value: false, previous: true });
    expect(store.getFlag('met-bulma')).toBe(false);
  });

  it('addItem/removeItem mantêm o inventário e emitem eventos', () => {
    const { events, store } = setup();
    const fn = vi.fn();
    events.on('inventory:changed', fn);

    store.addItem('senzu', 2);
    expect(store.getItemCount('senzu')).toBe(2);
    expect(store.removeItem('senzu', 1)).toBe(true);
    expect(fn).toHaveBeenLastCalledWith({ itemId: 'senzu', quantity: 1 });
  });

  it('removeItem não remove além do que existe e não altera nada nesse caso', () => {
    const { events, store } = setup();
    const fn = vi.fn();
    events.on('inventory:changed', fn);

    expect(store.removeItem('meat', 3)).toBe(false);
    expect(store.getItemCount('meat')).toBe(2);
    expect(fn).not.toHaveBeenCalled();
  });

  it('item zerado é removido do inventário (mantém o invariante do schema)', () => {
    const { store } = setup();
    store.removeItem('meat', 2);
    expect(store.view.inventory).not.toHaveProperty('meat');
    expect(GameStateSchema.safeParse(store.snapshot()).success).toBe(true);
  });

  it('rejeita quantidades inválidas', () => {
    const { store } = setup();
    expect(() => store.addItem('meat', 0)).toThrow(RangeError);
    expect(() => store.removeItem('meat', -1)).toThrow(RangeError);
    expect(() => store.addItem('meat', 1.5)).toThrow(RangeError);
  });

  it('addPartyMember emite evento e impede duplicados', () => {
    const { events, data, store } = setup();
    const fn = vi.fn();
    events.on('party:changed', fn);
    const extra = { ...createNewGameState(data, config).party[0]!, characterId: 'yamcha' };

    store.addPartyMember(extra);

    expect(store.view.party).toHaveLength(2);
    expect(fn).toHaveBeenCalledWith({ characterId: 'yamcha' });
    expect(() => store.addPartyMember(extra)).toThrow(/já está/);
  });

  it('updatePartyVitals atualiza HP/KI, emite evento e valida os valores', () => {
    const { events, store } = setup();
    const fn = vi.fn();
    events.on('party:changed', fn);

    store.updatePartyVitals('hero', { currentHp: 7, currentKi: 3 });

    expect(store.view.party[0]).toMatchObject({ currentHp: 7, currentKi: 3 });
    expect(fn).toHaveBeenCalledWith({ characterId: 'hero' });
    expect(() => store.updatePartyVitals('ghost', { currentHp: 1, currentKi: 1 })).toThrow(/não está na equipe/);
    expect(() => store.updatePartyVitals('hero', { currentHp: -1, currentKi: 1 })).toThrow(RangeError);
    expect(() => store.updatePartyVitals('hero', { currentHp: 1.5, currentKi: 1 })).toThrow(RangeError);
  });

  it('snapshot é uma cópia independente do estado vivo', () => {
    const { store } = setup();
    const snap = store.snapshot();
    snap.party[0]!.level = 99;
    store.setFlag('x', 1);
    expect(store.view.party[0]!.level).toBe(1);
    expect(snap.story.flags).not.toHaveProperty('x');
  });

  it('o estado inicial é copiado: mudar o objeto original não afeta o store', () => {
    const { state, store } = setup();
    state.party[0]!.level = 50;
    expect(store.view.party[0]!.level).toBe(1);
  });
});
