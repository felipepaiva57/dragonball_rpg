import { pickWeighted, type Rng } from '@/shared/random';
import type { Battle } from './Battle';
import type { BattleAction, SlotRef } from './types';

type MoveAction = Extract<BattleAction, { type: 'move' }>;

/**
 * IA básica, usada por inimigos e pelas simulações de balanceamento.
 * Escolhe SEMPRE dentre `legalActions`, então nunca produz uma ação inválida.
 * Heurística (deliberadamente simples):
 *  1. transforma-se se o KI sustenta a forma por alguns turnos;
 *  2. sem golpe disponível (KI baixo), concentra ou defende;
 *  3. com KI baixo, às vezes concentra;
 *  4. senão sorteia um golpe, favorecendo poder × precisão.
 */
export function chooseAction(battle: Battle, ref: SlotRef, rng: Rng): BattleAction {
  const legal = battle.legalActions(ref);
  const actor = battle.combatantAt(ref);
  if (!actor || legal.length === 0) throw new Error(`sem ações legais para ${ref.side}#${ref.slot}`);

  const charge = legal.find((a) => a.type === 'charge');
  const defend = legal.find((a) => a.type === 'defend')!;

  const transform = legal.find((a) => a.type === 'transform');
  if (transform?.type === 'transform') {
    const form = battle.data.characters.require(actor.characterId).transformations.find((t) => t.id === transform.transformationId);
    if (form && actor.ki >= form.activationKiCost + 3 * form.kiDrainPerTurn) return transform;
  }

  const moves = legal.filter((a): a is MoveAction => a.type === 'move');
  if (moves.length === 0) return charge ?? defend;

  if (charge && actor.ki < actor.stats.ki * 0.3 && rng.next() < 0.5) return charge;

  const weights = moves.map((a) => {
    const move = battle.data.moves.require(a.moveId);
    return move.power * (move.accuracy / 100);
  });
  return pickWeighted(moves, weights, rng);
}
