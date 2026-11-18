import { describe, expect, it } from 'vitest';
import { chooseAction } from '@/core/battle/ai';
import { loadGameData } from '@/data/loadData';
import { createDuel, duelCommands, PLAYER, RIVAL } from '@/game/battle/duel';

const rng = { next: () => 0.5 };

describe('duelo de Goku contra Yamcha', () => {
  it('oferece o Bastão Mágico e atualiza a disponibilidade das táticas após cada turno', () => {
    const battle = createDuel(loadGameData(), rng);
    const move = () => duelCommands(battle).moves.find((cmd) => cmd.id === 'power-pole-strike');
    const tactic = (id: string) => duelCommands(battle).tactics.find((cmd) => cmd.id === id);
    expect(tactic('charge')?.action).toBeUndefined();
    expect(tactic('item')?.action).toBeUndefined();

    const staff = move()?.action;
    expect(staff).toMatchObject({ type: 'move', actor: PLAYER, target: RIVAL });
    const turn = battle.submitTurn([staff!, chooseAction(battle, RIVAL, rng)]);
    expect(turn.ok && turn.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'move-used', moveId: 'power-pole-strike' }),
      expect.objectContaining({ type: 'ki-changed', reason: 'move-cost' }),
    ]));
    expect(tactic('charge')?.action?.type).toBe('charge');
    const item = tactic('item')?.action;
    expect(item).toMatchObject({ type: 'item', itemId: 'roasted-meat' });

    expect(battle.submitTurn([item!, chooseAction(battle, RIVAL, rng)]).ok).toBe(true);
    expect(tactic('item')?.detail).toContain('1×');
  });

  it('uma nova partida repõe os dois lutadores e o inventário', () => {
    const data = loadGameData();
    const battle = createDuel(data, rng);
    const guard = duelCommands(battle).tactics.find((cmd) => cmd.id === 'defend')!.action!;
    for (let turn = 0; turn < 40 && battle.phase === 'awaiting-actions'; turn++) {
      expect(battle.submitTurn([guard, chooseAction(battle, RIVAL, rng)]).ok).toBe(true);
    }
    expect(battle.outcome()?.winner).toBe('enemy');
    expect(battle.combatantAt(PLAYER)?.hp).toBe(0);

    const replay = createDuel(data, rng);
    expect(replay.turn).toBe(1);
    expect(replay.combatantAt(PLAYER)).toMatchObject({ hp: replay.combatantAt(PLAYER)?.stats.hp });
    expect(replay.combatantAt(RIVAL)).toMatchObject({ hp: replay.combatantAt(RIVAL)?.stats.hp });
    expect(replay.state.sides.player.inventory['roasted-meat']).toBe(2);
  });
});
