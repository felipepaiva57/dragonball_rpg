import { simulateMatchup } from '@/core/battle/simulate';
import { powerLevel } from '@/core/progression/powerLevel';
import { statsAtLevel } from '@/core/progression/stats';
import { loadGameData } from '@/data/loadData';

/**
 * Relatório de balanceamento: roda muitas lutas com a IA e mostra taxa de vitória
 * e duração. Uso: npm run simulate
 */
const data = loadGameData();
const RUNS = 10000;

function row(label: string, player: [string, number], enemy: [string, number]) {
  const [pId, pLevel] = player;
  const [eId, eLevel] = enemy;
  const stats = simulateMatchup(
    {
      player: { members: [{ characterId: pId, level: pLevel }] },
      enemy: { members: [{ characterId: eId, level: eLevel }] },
    },
    { data },
    RUNS,
  );
  return {
    luta: label,
    'PL jogador': powerLevel(statsAtLevel(data.characters.require(pId), pLevel)),
    'PL inimigo': powerLevel(statsAtLevel(data.characters.require(eId), eLevel)),
    'vitória jogador': `${((stats.wins.player / RUNS) * 100).toFixed(1)}%`,
    'turnos (média)': stats.avgTurns.toFixed(1),
    impasses: stats.timeouts,
  };
}

const G = 'goku-kid';
const Y = 'yamcha';

console.log(`\n${RUNS} lutas por linha, IA nos dois lados (margem de erro das taxas de vitória: ±${(98 / Math.sqrt(RUNS)).toFixed(1)} pontos).\n`);
console.log('A) Espelho real (Goku vs Goku): deve ficar perto de 50%, senão o motor favorece um lado.');
console.table([
  row('espelho nv1', [G, 1], [G, 1]),
  row('espelho nv10', [G, 10], [G, 10]),
  row('espelho nv50', [G, 50], [G, 50]),
]);
console.log('B) Diferença de nível (Goku vs Goku): mais nível deve vencer quase sempre.');
console.table([
  row('+1 nível (nv10)', [G, 11], [G, 10]),
  row('+3 níveis (nv10)', [G, 13], [G, 10]),
  row('-3 níveis (nv10)', [G, 7], [G, 10]),
]);
console.log('C) Goku vs Yamcha: reflete os DADOS (Goku tem o Bastão Mágico, Yamcha não tem golpe de KI).');
console.table([
  row('goku nv1 vs yamcha nv1', [G, 1], [Y, 1]),
  row('goku nv10 vs yamcha nv10', [G, 10], [Y, 10]),
]);
