import { MAX_LEVEL } from '@/core/constants';
import type { CharacterDef, Stats } from '@/core/data/schemas';

/**
 * Atributos de um personagem num dado nível.
 *
 * PROVISÓRIO: crescimento linear (base + ganho × (nível − 1)). Existe agora
 * porque o novo jogo precisa de HP/KI máximos; a curva definitiva será
 * decidida na Fase 1, com simulações de balanceamento.
 */
export function statsAtLevel(character: CharacterDef, level: number): Stats {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`nível inválido: ${level} (esperado inteiro entre 1 e ${MAX_LEVEL})`);
  }
  const steps = level - 1;
  const { baseStats: base, growth } = character;
  return {
    hp: Math.floor(base.hp + growth.hp * steps),
    ki: Math.floor(base.ki + growth.ki * steps),
    attack: Math.floor(base.attack + growth.attack * steps),
    defense: Math.floor(base.defense + growth.defense * steps),
    speed: Math.floor(base.speed + growth.speed * steps),
  };
}

/** Golpes que o personagem já conhece naquele nível, na ordem do learnset. */
export function movesKnownAtLevel(character: CharacterDef, level: number): string[] {
  return character.learnset.filter((entry) => entry.level <= level).map((entry) => entry.moveId);
}
