import type { DataRegistry } from '@/core/data/DataRegistry';
import type { Stats } from '@/core/data/schemas';
import { movesKnownAtLevel, statsAtLevel } from '@/core/progression/stats';
import type { Combatant, CombatantSeed } from './types';

export function createCombatant(data: DataRegistry, seed: CombatantSeed, uid: string): Combatant {
  const def = data.characters.require(seed.characterId);
  const stats = statsAtLevel(def, seed.level);
  const knownMoves = [...(seed.knownMoves ?? movesKnownAtLevel(def, seed.level))];
  for (const moveId of knownMoves) data.moves.require(moveId); // falha cedo com id inválido

  return {
    uid,
    characterId: def.id,
    name: def.name,
    level: seed.level,
    stats,
    hp: clamp(seed.hp ?? stats.hp, 0, stats.hp),
    ki: clamp(seed.ki ?? stats.ki, 0, stats.ki),
    knownMoves,
    transformationId: null,
    guarding: false,
  };
}

export const isFainted = (c: Pick<Combatant, 'hp'>): boolean => c.hp <= 0;

/** Atributos em combate: base do nível × multiplicadores da transformação ativa (HP e KI máximos não mudam). */
export function effectiveStats(data: DataRegistry, c: Combatant): Stats {
  if (c.transformationId === null) return c.stats;
  const form = data.characters.require(c.characterId).transformations.find((t) => t.id === c.transformationId);
  if (!form) return c.stats;
  const m = form.multipliers;
  return {
    ...c.stats,
    attack: Math.floor(c.stats.attack * m.attack),
    defense: Math.floor(c.stats.defense * m.defense),
    speed: Math.floor(c.stats.speed * m.speed),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}
