import { Battle } from '@/core/battle/Battle';
import type { BattleAction, SlotRef } from '@/core/battle/types';
import type { DataRegistry } from '@/core/data/DataRegistry';
import { mathRng, type Rng } from '@/shared/random';

export const PLAYER: SlotRef = { side: 'player', slot: 0 };
export const RIVAL: SlotRef = { side: 'enemy', slot: 0 };

export function createDuel(data: DataRegistry, rng: Rng = mathRng): Battle {
  return Battle.create({
    player: { members: [{ characterId: 'goku-kid', level: 3 }], inventory: { 'roasted-meat': 2 } },
    enemy: { members: [{ characterId: 'yamcha', level: 3 }] },
  }, { data, rng });
}

export interface DuelCommand {
  id: string;
  label: string;
  detail: string;
  action: BattleAction | undefined;
}

export function duelCommands(battle: Battle): { moves: DuelCommand[]; tactics: DuelCommand[] } {
  const actions = battle.legalActions(PLAYER);
  const fighter = battle.state.sides.player.roster[0]!;
  const moves = fighter.knownMoves.map((id) => {
    const move = battle.data.moves.require(id);
    const action = actions.find((option) => option.type === 'move' && option.moveId === id);
    return {
      id,
      label: move.name,
      detail: action ? `${move.kiCost} KI · ${move.accuracy}%` : `Requer ${move.kiCost} KI`,
      action,
    };
  });

  const meat = battle.state.sides.player.inventory['roasted-meat'] ?? 0;
  const item = battle.data.items.require('roasted-meat');
  const healing = item.effect?.type === 'heal-hp' ? `+${item.effect.amount} HP` : 'Cura';
  return {
    moves,
    tactics: [
      { id: 'defend', label: 'Defender', detail: 'Reduz o dano', action: actions.find((a) => a.type === 'defend') },
      {
        id: 'charge',
        label: 'Concentrar',
        detail: fighter.ki === fighter.stats.ki ? 'KI cheio' : 'Recupera KI',
        action: actions.find((a) => a.type === 'charge'),
      },
      {
        id: 'item',
        label: item.name,
        detail: meat > 0 && fighter.hp === fighter.stats.hp ? `${meat}× · HP cheio` : `${meat}× · ${healing}`,
        action: actions.find((a) => a.type === 'item' && a.itemId === item.id),
      },
    ],
  };
}
