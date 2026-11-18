import { describe, expect, it } from 'vitest';
import { simulateMatchup } from '@/core/battle/simulate';
import { powerLevel } from '@/core/progression/powerLevel';
import { statsAtLevel } from '@/core/progression/stats';
import { loadGameData } from '@/data/loadData';

/**
 * Salvaguardas de balanceamento com os DADOS REAIS. Não decidem se o jogo é "bom"
 * (isso é design), mas pegam regressões: viés de lado, impasses, lutas longas/curtas demais.
 * Para ver os números completos: `npm run simulate`.
 */
const data = loadGameData();
const RUNS = 3000;

const duel = (a: [string, number], b: [string, number]) =>
  simulateMatchup(
    { player: { members: [{ characterId: a[0], level: a[1] }] }, enemy: { members: [{ characterId: b[0], level: b[1] }] } },
    { data },
    RUNS,
  );

const winRate = (s: ReturnType<typeof duel>) => s.wins.player / s.runs;

describe('equilíbrio do motor (dados reais)', () => {
  it.each([1, 10, 50])('espelho Goku vs Goku no nível %i: nenhum lado é favorecido (45–55%)', (level) => {
    const rate = winRate(duel(['goku-kid', level], ['goku-kid', level]));
    expect(rate).toBeGreaterThan(0.45);
    expect(rate).toBeLessThan(0.55);
  });

  it('mais nível vence quase sempre (e menos nível quase nunca)', () => {
    expect(winRate(duel(['goku-kid', 13], ['goku-kid', 10]))).toBeGreaterThan(0.95);
    expect(winRate(duel(['goku-kid', 7], ['goku-kid', 10]))).toBeLessThan(0.05);
  });

  it('nenhum confronto real termina em impasse e a duração fica num ritmo jogável', () => {
    const ids = data.characters.all().map((c) => c.id);
    for (const level of [1, 10, 50]) {
      for (const a of ids) {
        for (const b of ids) {
          const stats = simulateMatchup(
            { player: { members: [{ characterId: a, level }] }, enemy: { members: [{ characterId: b, level }] } },
            { data },
            300,
          );
          expect(stats.timeouts, `${a} vs ${b} nv${level}`).toBe(0);
          expect(stats.avgTurns, `${a} vs ${b} nv${level}`).toBeGreaterThan(3);
          expect(stats.avgTurns, `${a} vs ${b} nv${level}`).toBeLessThan(25);
        }
      }
    }
  });
});

describe('powerLevel', () => {
  const goku = data.characters.require('goku-kid');

  it('cresce a cada nível', () => {
    for (let level = 2; level <= 100; level++) {
      expect(powerLevel(statsAtLevel(goku, level))).toBeGreaterThan(powerLevel(statsAtLevel(goku, level - 1)));
    }
  });

  it('é coerente com o resultado das lutas: quem tem mais poder de luta vence', () => {
    const a = statsAtLevel(goku, 12);
    const b = statsAtLevel(goku, 10);
    expect(powerLevel(a)).toBeGreaterThan(powerLevel(b));
    expect(winRate(duel(['goku-kid', 12], ['goku-kid', 10]))).toBeGreaterThan(0.5);
  });
});
