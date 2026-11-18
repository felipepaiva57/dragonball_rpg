import { describe, expect, it } from 'vitest';
import { Battle } from '@/core/battle/Battle';
import { chooseAction } from '@/core/battle/ai';
import { runBattle } from '@/core/battle/simulate';
import type { BattleAction, BattleEvent, BattleSetup, SideId, SideSetup, SlotRef } from '@/core/battle/types';
import { createSeededRng, type Rng } from '@/shared/random';
import { battleRegistry, constRng, makeBattle, TEST_RULES } from './battleFixtures';

const CHARACTERS = ['hero', 'rival', 'fast', 'weak', 'master', 'sloppy', 'caster'];
const pick = <T,>(items: readonly T[], rng: Rng): T => items[Math.floor(rng.next() * items.length)]!;

function randomSide(rng: Rng, withItems: boolean): SideSetup {
  const size = 1 + Math.floor(rng.next() * 3);
  return {
    members: Array.from({ length: size }, () => {
      const characterId = pick(CHARACTERS, rng);
      const level = 1 + Math.floor(rng.next() * 8);
      // metade dos lutadores começa ferido/sem KI, para exercitar itens, Concentrar e KO
      return rng.next() < 0.5 ? { characterId, level } : { characterId, level, hp: 1 + Math.floor(rng.next() * 60), ki: Math.floor(rng.next() * 20) };
    }),
    activeCount: 1 + Math.floor(rng.next() * 2),
    inventory: withItems ? { meat: 2, elixir: 1, bean: 1, badge: 1 } : {},
  };
}

/** Escolhe uma ação legal qualquer (fuzzer): exercita itens, trocas, transformações... */
const randomLegal = (battle: Battle, ref: SlotRef, rng: Rng, queued: readonly BattleAction[]): BattleAction => {
  const legal = battle.legalActions(ref, queued);
  return legal[Math.floor(rng.next() * legal.length)]!;
};

/** Cada lutador escolhe em sequência, vendo o que os anteriores já escolheram (como a tela fará). */
function chooseAll(battle: Battle, rng: Rng): BattleAction[] {
  const queued: BattleAction[] = [];
  for (const ref of battle.actors()) {
    queued.push(ref.side === 'player' ? randomLegal(battle, ref, rng, queued) : chooseAction(battle, ref, rng));
  }
  return queued;
}

interface Snapshot {
  hp: Map<string, number>;
  ki: Map<string, number>;
  active: Record<SideId, string[]>;
}

function snapshot(battle: Battle): Snapshot {
  const hp = new Map<string, number>();
  const ki = new Map<string, number>();
  const active = { player: [] as string[], enemy: [] as string[] };
  for (const id of ['player', 'enemy'] as const) {
    const side = battle.state.sides[id];
    for (const c of side.roster) {
      hp.set(c.uid, c.hp);
      ki.set(c.uid, c.ki);
    }
    active[id] = side.active.map((i) => side.roster[i]!.uid);
  }
  return { hp, ki, active };
}

/** Reconstrói o estado SÓ a partir dos eventos (é exatamente o que a tela fará na Fase 2). */
function applyEvents(snap: Snapshot, events: readonly BattleEvent[]): void {
  for (const e of events) {
    if (e.type === 'damage' || e.type === 'hp-restored') snap.hp.set(e.target, e.hp);
    if (e.type === 'ki-changed') snap.ki.set(e.target, e.ki);
    if (e.type === 'switch') snap.active[e.side][e.slot] = e.to;
  }
}

function assertInvariants(battle: Battle): void {
  for (const id of ['player', 'enemy'] as const) {
    const side = battle.state.sides[id];
    expect(new Set(side.active).size).toBe(side.active.length); // ninguém em dois slots
    for (const c of side.roster) {
      expect(c.hp).toBeGreaterThanOrEqual(0);
      expect(c.hp).toBeLessThanOrEqual(c.stats.hp);
      expect(c.ki).toBeGreaterThanOrEqual(0);
      expect(c.ki).toBeLessThanOrEqual(c.stats.ki);
      if (c.hp === 0) expect(c.transformationId).toBeNull();
    }
    for (const count of Object.values(side.inventory)) expect(count).toBeGreaterThan(0);
  }
  if (battle.phase === 'finished') {
    const wiped = (['player', 'enemy'] as const).filter((id) => battle.state.sides[id].roster.every((c) => c.hp === 0));
    expect(wiped).toHaveLength(1);
    expect(battle.winner).not.toBe(wiped[0]);
  }
}

describe('propriedades do motor (jogador aleatório × IA, 300 sementes)', () => {
  it('invariantes valem em todo turno e o log de eventos reconstrói o estado final', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createSeededRng(seed);
      const setup: BattleSetup = { player: randomSide(rng, true), enemy: randomSide(rng, false) };
      const battle = Battle.create(setup, { data: battleRegistry(), rng, rules: TEST_RULES });
      const snap = snapshot(battle);

      let guard = 0;
      while (battle.phase !== 'finished') {
        if (++guard > 400) throw new Error(`seed ${seed}: luta não terminou`);

        if (battle.phase === 'awaiting-replacement') {
          // o jogador escolhe um substituto qualquer; a IA, o primeiro
          for (const pending of battle.pendingReplacements().filter((p) => p.side === 'player')) {
            const side = battle.state.sides.player;
            const options = side.roster.flatMap((m, i) => (m.hp > 0 && !side.active.includes(i) ? [i] : []));
            const r = battle.replace('player', pending.slot, pick(options, rng));
            expect(r.ok).toBe(true);
            applyEvents(snap, r.ok ? r.value : []);
          }
          applyEvents(snap, battle.autoReplace('enemy'));
          assertInvariants(battle);
          continue;
        }

        const result = battle.submitTurn(chooseAll(battle, rng));
        expect(result.ok, `seed ${seed}: ${result.ok ? '' : result.error}`).toBe(true);
        applyEvents(snap, result.ok ? result.value : []);
        for (const e of result.ok ? result.value : []) seen.add(e.type === 'ki-changed' ? `ki:${e.reason}` : e.type === 'revert' ? `revert:${e.reason}` : e.type);
        assertInvariants(battle);
      }

      // o estado reconstruído só pelos eventos tem que bater com o estado real
      const final = snapshot(battle);
      expect(snap.hp, `seed ${seed}: HP divergiu dos eventos`).toEqual(final.hp);
      expect(snap.ki, `seed ${seed}: KI divergiu dos eventos`).toEqual(final.ki);
      expect(snap.active, `seed ${seed}: slots divergiram dos eventos`).toEqual(final.active);
    }

    // Garante que o fuzzer não passou "no vazio": todos esses caminhos foram realmente percorridos.
    const expected = [
      'damage', 'miss', 'faint', 'battle-end', 'defend', 'switch', 'item-used', 'hp-restored', 'transform',
      'revert:chosen', 'revert:out-of-ki', 'revert:switched', 'revert:fainted',
      'ki:move-cost', 'ki:regen', 'ki:charge', 'ki:drain', 'ki:item', 'ki:transform-cost',
    ];
    expect(expected.filter((type) => !seen.has(type)), 'caminhos nunca exercitados').toEqual([]);
  });

  it('a IA sempre escolhe uma ação que está entre as legais', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createSeededRng(seed);
      const battle = Battle.create({ player: randomSide(rng, true), enemy: randomSide(rng, true) }, { data: battleRegistry(), rng, rules: TEST_RULES });
      for (const ref of battle.actors()) {
        const chosen = chooseAction(battle, ref, rng);
        expect(battle.validate(chosen).ok, `seed ${seed}`).toBe(true);
      }
    }
  });
});

describe('IA: decisões', () => {
  it('transforma-se quando o KI sustenta a forma e não quando falta', () => {
    const rich = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 40 }] } });
    expect(chooseAction(rich, { side: 'player', slot: 0 }, constRng(0)).type).toBe('transform');
    const poor = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 20 }] } }); // 10 + 3×5 = 25 > 20
    expect(chooseAction(poor, { side: 'player', slot: 0 }, constRng(0)).type).not.toBe('transform');
  });

  it('sem golpe possível por falta de KI, concentra', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'caster', level: 1, ki: 5 }] } });
    expect(chooseAction(b, { side: 'player', slot: 0 }, constRng(0)).type).toBe('charge');
  });
});

describe('simulação', () => {
  const setup: BattleSetup = {
    player: { members: [{ characterId: 'hero', level: 5 }, { characterId: 'master', level: 5 }] },
    enemy: { members: [{ characterId: 'rival', level: 5 }, { characterId: 'fast', level: 5 }] },
  };
  const run = (seed: number) => runBattle(setup, { data: battleRegistry(), rng: createSeededRng(seed), rules: TEST_RULES });

  it('é determinística: mesma semente, mesmo log; sementes diferentes, lutas diferentes', () => {
    expect(run(42)).toEqual(run(42));
    const logs = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(run(s).log)));
    expect(logs.size).toBeGreaterThan(1);
  });

  it('sempre termina com um vencedor', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = run(seed);
      expect(r.timedOut).toBe(false);
      expect(r.outcome).not.toBeNull();
    }
  });
});
