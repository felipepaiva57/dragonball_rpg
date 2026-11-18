/**
 * Regras numéricas do combate num único lugar. Tudo que o balanceamento
 * precisa girar está aqui (e é injetável: simulações podem testar variações
 * sem tocar no motor).
 */

export interface DamageInput {
  attackerLevel: number;
  /** Poder do golpe. */
  power: number;
  /** Ataque efetivo do atacante (já com transformação). */
  attack: number;
  /** Defesa efetiva do defensor (já com transformação). */
  defense: number;
}

/** Dano base, antes de variação aleatória e defesa ativa. */
export type DamageFormula = (input: DamageInput) => number;

/**
 * Fórmula estilo Pokémon: ((2·nível/5 + 2) · poder · ataque/defesa) / 50 + 2.
 * O termo de nível faz o dano acompanhar o crescimento de HP; o "+2" garante
 * dano mínimo útil mesmo com ataque muito abaixo da defesa.
 */
export const pokemonStyleDamage: DamageFormula = ({ attackerLevel, power, attack, defense }) =>
  Math.floor(((2 * attackerLevel) / 5 + 2) * power * (attack / Math.max(1, defense)) / 50) + 2;

export interface BattleRules {
  damageFormula: DamageFormula;
  /** Variação aleatória do dano: multiplicador sorteado em [min, max]. */
  damageVariance: { min: number; max: number };
  /** Multiplicador do dano recebido por quem está defendendo. */
  guardDamageMultiplier: number;
  minDamage: number;
  /** KI recuperado por turno (passivo), como fração do KI máximo; mínimo 1. */
  kiRegenPercent: number;
  /** KI recuperado pela ação Concentrar, como fração do KI máximo; mínimo 1. */
  chargeKiPercent: number;
}

export const DEFAULT_RULES: BattleRules = {
  damageFormula: pokemonStyleDamage,
  damageVariance: { min: 0.85, max: 1 },
  guardDamageMultiplier: 0.5,
  minDamage: 1,
  kiRegenPercent: 0.05,
  chargeKiPercent: 0.25,
};
