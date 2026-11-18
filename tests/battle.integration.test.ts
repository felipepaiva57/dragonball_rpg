import { describe, expect, it } from 'vitest';
import { Battle } from '@/core/battle/Battle';
import { chooseAction } from '@/core/battle/ai';
import { applyOutcomeToStore, playerSideFromStore, seedFromPartyMember } from '@/core/battle/bridge';
import { GameStore } from '@/core/state/GameStore';
import { createNewGameState } from '@/core/state/newGame';
import { SaveService } from '@/core/state/SaveService';
import { MemoryStorageAdapter } from '@/core/state/StorageAdapter';
import { loadGameData } from '@/data/loadData';
import { EventBus } from '@/shared/EventBus';
import type { GameEvents } from '@/shared/events';
import { createSeededRng } from '@/shared/random';

describe('integração: estado do jogo ↔ combate (dados reais)', () => {
  function setup() {
    const data = loadGameData();
    const events = new EventBus<GameEvents>();
    const store = new GameStore(createNewGameState(data), events);
    return { data, events, store };
  }

  it('seedFromPartyMember e playerSideFromStore copiam HP, KI, golpes e inventário', () => {
    const { store } = setup();
    store.updatePartyVitals('goku-kid', { currentHp: 12, currentKi: 4 });

    const side = playerSideFromStore(store, 1);
    expect(side.members[0]).toEqual({ characterId: 'goku-kid', level: 1, hp: 12, ki: 4, knownMoves: ['punch', 'kick'] });
    expect(side.inventory).toEqual({ 'roasted-meat': 3 });
    expect(seedFromPartyMember(store.view.party[0] as never).hp).toBe(12);
  });

  it('luta inteira: usa item, a vida real é afetada só no fim, e o resultado sobrevive a save/load', () => {
    const { data, events, store } = setup();
    store.updatePartyVitals('goku-kid', { currentHp: 12, currentKi: 10 });

    const rng = createSeededRng(2024);
    const battle = Battle.create(
      { player: playerSideFromStore(store), enemy: { members: [{ characterId: 'yamcha', level: 1 }] } },
      { data, rng },
    );
    const P0 = { side: 'player', slot: 0 } as const;
    const E0 = { side: 'enemy', slot: 0 } as const;

    // Turno 1: o jogador come a carne; o inimigo age pela IA.
    const eat = { type: 'item', actor: P0, itemId: 'roasted-meat', targetIndex: 0 } as const;
    expect(battle.validate(eat).ok).toBe(true);
    expect(battle.submitTurn([eat, chooseAction(battle, E0, rng)]).ok).toBe(true);

    // O estado do jogo NÃO muda durante a luta.
    expect(store.view.party[0]!.currentHp).toBe(12);
    expect(store.getItemCount('roasted-meat')).toBe(3);

    // Resto da luta com IA nos dois lados.
    while (battle.phase !== 'finished') {
      if (battle.phase === 'awaiting-replacement') {
        battle.autoReplace('player');
        battle.autoReplace('enemy');
        continue;
      }
      expect(battle.submitTurn(battle.actors().map((ref) => chooseAction(battle, ref, rng))).ok).toBe(true);
    }

    const outcome = battle.outcome()!;
    applyOutcomeToStore(store, outcome);

    const goku = outcome.sides.player.members[0]!;
    expect(store.view.party[0]).toMatchObject({ currentHp: goku.hp, currentKi: goku.ki });
    expect(store.getItemCount('roasted-meat')).toBe(2); // a carne foi consumida

    // Salvar → "fechar o jogo" → carregar: o resultado da batalha persiste.
    const storage = new MemoryStorageAdapter();
    const saves = new SaveService({ storage, events });
    expect(saves.save('slot-1', store.snapshot()).ok).toBe(true);
    const loaded = new SaveService({ storage, events: new EventBus<GameEvents>() }).load('slot-1');
    expect(loaded).toEqual({ ok: true, value: store.snapshot() });
  });

  it('applyOutcomeToStore não toca em itens que não foram usados', () => {
    const { data, store } = setup();
    const rng = createSeededRng(1);
    const battle = Battle.create(
      { player: playerSideFromStore(store), enemy: { members: [{ characterId: 'yamcha', level: 1 }] } },
      { data, rng },
    );
    while (battle.phase !== 'finished') {
      if (battle.phase === 'awaiting-replacement') {
        battle.autoReplace('player');
        battle.autoReplace('enemy');
        continue;
      }
      battle.submitTurn(battle.actors().map((ref) => chooseAction(battle, ref, rng)));
    }
    applyOutcomeToStore(store, battle.outcome()!);
    expect(store.getItemCount('roasted-meat')).toBe(3);
  });
});
