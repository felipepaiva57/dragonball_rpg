import { createSeededRng, type Rng } from '@/shared/random';
import { Battle, type BattleDeps } from './Battle';
import { chooseAction } from './ai';
import type { BattleEvent, BattleOutcome, BattleSetup, SideId } from './types';

export interface RunResult {
  outcome: BattleOutcome | null;
  turns: number;
  /** true se estourou maxTurns (indício de impasse de balanceamento). */
  timedOut: boolean;
  log: BattleEvent[];
}

/** Joga uma batalha inteira com a IA nos dois lados. */
export function runBattle(setup: BattleSetup, deps: BattleDeps, maxTurns = 200): RunResult {
  const battle = Battle.create(setup, deps);
  const log: BattleEvent[] = [];

  while (battle.phase !== 'finished' && battle.turn <= maxTurns) {
    if (battle.phase === 'awaiting-replacement') {
      log.push(...battle.autoReplace('player'), ...battle.autoReplace('enemy'));
      continue;
    }
    const actions = battle.actors().map((ref) => chooseAction(battle, ref, deps.rng));
    const result = battle.submitTurn(actions);
    if (!result.ok) throw new Error(`a IA gerou uma ação inválida: ${result.error}`);
    log.push(...result.value);
  }

  return { outcome: battle.outcome(), turns: battle.turn - 1, timedOut: battle.phase !== 'finished', log };
}

export interface MatchupStats {
  runs: number;
  wins: Record<SideId, number>;
  timeouts: number;
  avgTurns: number;
}

/** Repete a mesma luta com sementes diferentes (seed, seed+1, ...) e agrega o resultado. */
export function simulateMatchup(
  setup: BattleSetup,
  deps: Omit<BattleDeps, 'rng'>,
  runs: number,
  seed = 1,
): MatchupStats {
  const wins: Record<SideId, number> = { player: 0, enemy: 0 };
  let timeouts = 0;
  let totalTurns = 0;

  for (let i = 0; i < runs; i++) {
    const rng: Rng = createSeededRng(seed + i);
    const result = runBattle(setup, { ...deps, rng });
    totalTurns += result.turns;
    if (result.timedOut || !result.outcome) timeouts++;
    else wins[result.outcome.winner]++;
  }
  return { runs, wins, timeouts, avgTurns: totalTurns / runs };
}
