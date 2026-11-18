import type { Stats } from '@/core/data/schemas';

/**
 * Poder de luta: número único e comparável que resume os atributos
 * ("o scouter"). É DERIVADO, nunca armazenado: assim não pode ficar
 * inconsistente com os atributos.
 *
 * Pesos (PROVISÓRIOS, validados contra simulações em tests/balance.test.ts):
 * ataque pesa mais porque o dano cresce com ele; HP e KI pesam menos
 * porque vivem em escalas maiores.
 */
export function powerLevel(stats: Stats): number {
  return Math.round(stats.hp * 0.5 + stats.ki * 0.5 + stats.attack * 3 + stats.defense * 2 + stats.speed);
}
