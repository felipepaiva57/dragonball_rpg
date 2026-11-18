import type { GameStore } from '@/core/state/GameStore';
import type { PartyMember } from '@/core/state/schemas';
import type { BattleOutcome, CombatantSeed, SideSetup } from './types';

/**
 * Ponte entre o estado persistente (GameStore) e o motor de combate.
 * O motor trabalha numa CÓPIA (HP, KI, inventário); só quando a batalha termina
 * o resultado volta ao estado do jogo.
 */

export function seedFromPartyMember(member: PartyMember): CombatantSeed {
  return {
    characterId: member.characterId,
    level: member.level,
    hp: member.currentHp,
    ki: member.currentKi,
    knownMoves: member.knownMoves,
  };
}

/** Lado do jogador montado a partir do estado salvo. */
export function playerSideFromStore(store: GameStore, activeCount = 1): SideSetup {
  const state = store.snapshot();
  return {
    members: state.party.map(seedFromPartyMember),
    activeCount,
    inventory: state.inventory,
  };
}

/** Grava no estado do jogo o HP/KI finais da equipe e os itens consumidos. */
export function applyOutcomeToStore(store: GameStore, outcome: BattleOutcome): void {
  const player = outcome.sides.player;

  for (const member of player.members) {
    store.updatePartyVitals(member.characterId, { currentHp: member.hp, currentKi: member.ki });
  }

  // O que sumiu do inventário do motor foi consumido na luta.
  const before = store.snapshot().inventory;
  for (const [itemId, had] of Object.entries(before)) {
    const used = had - (player.inventory[itemId] ?? 0);
    if (used > 0) store.removeItem(itemId, used);
  }
}
