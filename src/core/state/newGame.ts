import type { DataRegistry } from '@/core/data/DataRegistry';
import { movesKnownAtLevel, statsAtLevel } from '@/core/progression/stats';
import type { GameState, PartyMember } from './schemas';

/**
 * Ponto de partida de uma campanha. A principal usa MAIN_CAMPAIGN_START;
 * as histórias alternativas do pós-jogo passarão a sua própria configuração.
 */
export interface NewGameConfig {
  campaignId: string;
  party: readonly { characterId: string; level: number }[];
  inventory?: Readonly<Record<string, number>>;
}

export const MAIN_CAMPAIGN_START: NewGameConfig = {
  campaignId: 'main',
  party: [{ characterId: 'goku-kid', level: 1 }],
  inventory: { 'roasted-meat': 3 },
};

export function createPartyMember(
  data: DataRegistry,
  characterId: string,
  level: number,
): PartyMember {
  const character = data.characters.require(characterId);
  const stats = statsAtLevel(character, level);
  return {
    characterId,
    level,
    xp: 0,
    currentHp: stats.hp,
    currentKi: stats.ki,
    knownMoves: movesKnownAtLevel(character, level),
  };
}

export function createNewGameState(
  data: DataRegistry,
  config: NewGameConfig = MAIN_CAMPAIGN_START,
  now: number = Date.now(),
): GameState {
  const inventory: Record<string, number> = {};
  for (const [itemId, quantity] of Object.entries(config.inventory ?? {})) {
    data.items.require(itemId); // falha cedo se a config apontar para item inexistente
    inventory[itemId] = quantity;
  }

  return {
    meta: { createdAt: now, playTimeMs: 0 },
    party: config.party.map((p) => createPartyMember(data, p.characterId, p.level)),
    inventory,
    story: { campaignId: config.campaignId, flags: {} },
  };
}
