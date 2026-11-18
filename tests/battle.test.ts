import { describe, expect, it } from 'vitest';
import { Battle } from '@/core/battle/Battle';
import { pokemonStyleDamage } from '@/core/battle/rules';
import type { BattleAction } from '@/core/battle/types';
import { E0, E1, P0, P1, battleRegistry, constRng, makeBattle, ofType, seqRng, TEST_RULES } from './battleFixtures';

const punch = (actor: typeof P0 | typeof E0 | typeof P1 | typeof E1, target: typeof P0 | typeof E0 | typeof P1 | typeof E1): BattleAction => ({
  type: 'move', actor, moveId: 'punch', target,
});
const blast = (actor: typeof P0 | typeof E0, target: typeof P0 | typeof E0): BattleAction => ({
  type: 'move', actor, moveId: 'blast', target,
});

describe('criação', () => {
  it('monta lados, escolhe quem entra em campo e começa aguardando ações', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5 }, { characterId: 'master', level: 5 }] } });
    expect(b.phase).toBe('awaiting-actions');
    expect(b.turn).toBe(1);
    expect(b.state.sides.player.active).toEqual([0]);
    expect(b.actors()).toEqual([P0, E0]);
    expect(b.combatantAt(P0)).toMatchObject({ uid: 'player:0:hero', hp: 100, ki: 40 });
  });

  it('quem está caído no início não entra em campo; HP/KI são limitados ao máximo', () => {
    const b = makeBattle({
      player: { members: [{ characterId: 'weak', level: 1, hp: 0 }, { characterId: 'hero', level: 5, hp: 999, ki: 999 }] },
    });
    expect(b.state.sides.player.active).toEqual([1]);
    expect(b.combatantAt(P0)).toMatchObject({ characterId: 'hero', hp: 100, ki: 40 });
  });

  it('activeCount maior que os vivos é reduzido', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5 }], activeCount: 3 } });
    expect(b.state.sides.player.active).toEqual([0]);
  });

  it('rejeita lado vazio, lado sem ninguém de pé e ids inexistentes', () => {
    expect(() => makeBattle({ player: { members: [] } })).toThrow(/sem combatentes/);
    expect(() => makeBattle({ player: { members: [{ characterId: 'hero', level: 5, hp: 0 }] } })).toThrow(/de pé/);
    expect(() => makeBattle({ player: { members: [{ characterId: 'ghost', level: 1 }] } })).toThrow(/não existe/);
    expect(() => makeBattle({ player: { members: [{ characterId: 'hero', level: 5 }], inventory: { ghost: 1 } } })).toThrow(/não existe/);
    expect(() => makeBattle({ player: { members: [{ characterId: 'hero', level: 5, knownMoves: ['ghost'] }] } })).toThrow(/não existe/);
  });
});

describe('fórmula de dano padrão', () => {
  it('estilo Pokémon: valores conferidos à mão', () => {
    // nível 1, poder 30, atq 8, def 5 → floor(2.4·30·1.6/50)+2 = 4
    expect(pokemonStyleDamage({ attackerLevel: 1, power: 30, attack: 8, defense: 5 })).toBe(4);
    // nível 10, poder 30, atq 18, def 12 → floor(6·30·1.5/50)+2 = 7
    expect(pokemonStyleDamage({ attackerLevel: 10, power: 30, attack: 18, defense: 12 })).toBe(7);
  });

  it('defesa zero não causa divisão por zero', () => {
    expect(Number.isFinite(pokemonStyleDamage({ attackerLevel: 5, power: 40, attack: 10, defense: 0 }))).toBe(true);
  });
});

describe('resolução do turno: dano e ordem', () => {
  it('o mais rápido age primeiro e o dano segue a fórmula', () => {
    const b = makeBattle();
    const result = b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(ofType(result.value, 'move-used').map((e) => e.actor)).toEqual(['player:0:hero', 'enemy:0:rival']);
    expect(ofType(result.value, 'damage').map((e) => [e.target, e.amount, e.hp])).toEqual([
      ['enemy:0:rival', 20, 80],
      ['player:0:hero', 10, 90],
    ]);
    expect(b.turn).toBe(2);
  });

  it('um lutador mais veloz age antes mesmo estando no lado inimigo', () => {
    const b = makeBattle({ enemy: { members: [{ characterId: 'fast', level: 1 }] } });
    const result = b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(ofType(result.ok ? result.value : [], 'move-used').map((e) => e.actor)).toEqual(['enemy:0:fast', 'player:0:hero']);
  });

  it('empate de velocidade é decidido pelo sorteio injetado', () => {
    const order = (rolls: number[]) => {
      const b = makeBattle({ enemy: { members: [{ characterId: 'master', level: 5 }] } }, { rng: seqRng(rolls) });
      const r = b.submitTurn([punch(P0, E0), punch(E0, P0)]);
      return ofType(r.ok ? r.value : [], 'move-used').map((e) => e.actor);
    };
    // sorteios são feitos na ordem enemy#0, player#0; o maior vai primeiro
    expect(order([0.2, 0.8])[0]).toBe('player:0:hero');
    expect(order([0.8, 0.2])[0]).toBe('enemy:0:master');
  });

  it('o resultado não depende da ordem em que as ações foram enviadas', () => {
    const run = (swap: boolean) => {
      const b = makeBattle({ enemy: { members: [{ characterId: 'master', level: 5 }] } }, { rng: seqRng([0.3, 0.7, 0.1]) });
      const actions = [punch(P0, E0), punch(E0, P0)];
      const r = b.submitTurn(swap ? actions.reverse() : actions);
      return r.ok ? r.value : [];
    };
    expect(run(true)).toEqual(run(false));
  });

  it('defender tem prioridade: mesmo mais lento, a guarda vale contra golpes do mesmo turno', () => {
    const b = makeBattle();
    const r = b.submitTurn([punch(P0, E0), { type: 'defend', actor: E0 }]);
    const dmg = ofType(r.ok ? r.value : [], 'damage')[0]!;
    expect(dmg).toMatchObject({ target: 'enemy:0:rival', amount: 10, guarded: true });
  });

  it('a guarda dura só um turno', () => {
    const b = makeBattle();
    b.submitTurn([punch(P0, E0), { type: 'defend', actor: E0 }]);
    const r = b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(ofType(r.ok ? r.value : [], 'damage')[0]).toMatchObject({ amount: 20, guarded: false });
  });

  it('golpe com precisão baixa pode errar', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'sloppy', level: 1 }] } }, { rng: constRng(0.99) });
    const r = b.submitTurn([{ type: 'move', actor: P0, moveId: 'shaky', target: E0 }, { type: 'defend', actor: E0 }]);
    const events = r.ok ? r.value : [];
    expect(ofType(events, 'miss')).toHaveLength(1);
    expect(ofType(events, 'damage')).toHaveLength(0);
    expect(b.combatantAt(E0)!.hp).toBe(100);
  });

  it('dano mínimo é respeitado mesmo se a fórmula der zero', () => {
    const b = makeBattle({}, { rules: { damageFormula: () => 0, minDamage: 1 } });
    const r = b.submitTurn([punch(P0, E0), { type: 'defend', actor: E0 }]);
    expect(ofType(r.ok ? r.value : [], 'damage')[0]!.amount).toBe(1);
  });

  it('a variação aleatória do dano usa o intervalo configurado', () => {
    const rules = { damageVariance: { min: 0.5, max: 1 } };
    const low = makeBattle({}, { rng: constRng(0), rules });
    const r = low.submitTurn([punch(P0, E0), { type: 'defend', actor: E0 }]);
    // base 20 × 0.5 (variação mínima) × 0.5 (guarda) = 5
    expect(ofType(r.ok ? r.value : [], 'damage')[0]!.amount).toBe(5);
  });
});

describe('derrota e vitória', () => {
  it('derrubar o último inimigo encerra a luta; quem caiu não age depois', () => {
    const b = makeBattle({ enemy: { members: [{ characterId: 'weak', level: 1 }] } });
    const r = b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    const events = r.ok ? r.value : [];

    expect(ofType(events, 'faint').map((e) => e.target)).toEqual(['enemy:0:weak']);
    expect(ofType(events, 'move-used').map((e) => e.actor)).toEqual(['player:0:hero']);
    expect(ofType(events, 'battle-end')).toEqual([{ type: 'battle-end', winner: 'player' }]);
    expect(b.phase).toBe('finished');
    expect(b.winner).toBe('player');
    expect(b.outcome()).toMatchObject({ winner: 'player', turns: 1 });
  });

  it('depois de encerrada, não aceita mais ações', () => {
    const b = makeBattle({ enemy: { members: [{ characterId: 'weak', level: 1 }] } });
    b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(b.submitTurn([punch(P0, E0)]).ok).toBe(false);
    expect(b.actors()).toEqual([]);
  });

  it('o jogador pode perder', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'weak', level: 1 }] } });
    b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(b.winner).toBe('enemy');
  });

  it('outcome() é nulo enquanto a luta não terminou', () => {
    expect(makeBattle().outcome()).toBeNull();
  });
});

describe('validação de ações', () => {
  it('rejeita turno incompleto, ator repetido e ator inexistente', () => {
    const b = makeBattle();
    expect(b.submitTurn([punch(P0, E0)]).ok).toBe(false);
    expect(b.submitTurn([punch(P0, E0), punch(P0, E0), punch(E0, P0)]).ok).toBe(false);
    expect(b.submitTurn([punch(P0, E0), punch(E0, P0), punch(P1, E0)]).ok).toBe(false);
  });

  it('rejeita golpe desconhecido, golpe que o lutador não tem, alvo do próprio lado e KI insuficiente', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 5 }] } });
    expect(b.validate({ type: 'move', actor: P0, moveId: 'nope', target: E0 }).ok).toBe(false);
    expect(b.validate({ type: 'move', actor: P0, moveId: 'wave', target: E0 }).ok).toBe(false);
    expect(b.validate({ type: 'move', actor: P0, moveId: 'punch', target: P0 }).ok).toBe(false);
    expect(b.validate(blast(P0, E0)).ok).toBe(false);
    expect(b.validate(punch(P0, E0)).ok).toBe(true);
  });

  it('turno inválido não altera nada (atomicidade)', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 5 }] } });
    const before = JSON.stringify(b.state);
    expect(b.submitTurn([blast(P0, E0), punch(E0, P0)]).ok).toBe(false);
    expect(JSON.stringify(b.state)).toBe(before);
  });
});

describe('KI', () => {
  it('golpe de KI cobra o custo e o KI regenera um pouco no fim do turno', () => {
    const b = makeBattle();
    const r = b.submitTurn([blast(P0, E0), punch(E0, P0)]);
    const ki = ofType(r.ok ? r.value : [], 'ki-changed').filter((e) => e.target === 'player:0:hero');
    expect(ki).toEqual([
      { type: 'ki-changed', target: 'player:0:hero', delta: -10, ki: 30, reason: 'move-cost' },
      { type: 'ki-changed', target: 'player:0:hero', delta: 2, ki: 32, reason: 'regen' }, // 5% de 40
    ]);
    expect(b.combatantAt(P0)!.ki).toBe(32);
  });

  it('Concentrar recupera 25% do KI máximo no lugar de atacar', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 10 }] } });
    const r = b.submitTurn([{ type: 'charge', actor: P0 }, punch(E0, P0)]);
    const reasons = ofType(r.ok ? r.value : [], 'ki-changed').map((e) => [e.reason, e.delta]);
    expect(reasons).toEqual([['charge', 10], ['regen', 2]]);
    expect(b.combatantAt(P0)!.ki).toBe(22);
  });

  it('KI nunca passa do máximo e Concentrar some do menu com KI cheio', () => {
    const full = makeBattle();
    expect(full.legalActions(P0).some((a) => a.type === 'charge')).toBe(false);
    const almost = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 39 }] } });
    expect(almost.legalActions(P0).some((a) => a.type === 'charge')).toBe(true);
    almost.submitTurn([{ type: 'charge', actor: P0 }, punch(E0, P0)]);
    expect(almost.combatantAt(P0)!.ki).toBe(40);
  });

  it('sem KI suficiente o golpe some do menu', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 9 }] } });
    const moves = b.legalActions(P0).filter((a) => a.type === 'move').map((a) => (a as { moveId: string }).moveId);
    expect(moves).toEqual(['punch']);
  });
});

describe('itens', () => {
  const withItems = (inventory: Record<string, number>, hp = 50, ki = 40) =>
    makeBattle({ player: { members: [{ characterId: 'hero', level: 5, hp, ki }], inventory } });

  it('cura HP, consome o item e age antes dos golpes do turno', () => {
    const b = withItems({ meat: 1 });
    const r = b.submitTurn([{ type: 'item', actor: P0, itemId: 'meat', targetIndex: 0 }, punch(E0, P0)]);
    const events = r.ok ? r.value : [];
    expect(ofType(events, 'hp-restored')).toEqual([{ type: 'hp-restored', target: 'player:0:hero', amount: 30, hp: 80 }]);
    expect(b.combatantAt(P0)!.hp).toBe(70); // 80 − 10 do golpe inimigo
    expect(b.state.sides.player.inventory).toEqual({}); // item zerado some do inventário
  });

  it('cura é limitada ao que falta', () => {
    const b = withItems({ meat: 1 }, 90);
    const r = b.submitTurn([{ type: 'item', actor: P0, itemId: 'meat', targetIndex: 0 }, { type: 'defend', actor: E0 }]);
    expect(ofType(r.ok ? r.value : [], 'hp-restored')[0]!.amount).toBe(10);
  });

  it('item de KI e restauração total', () => {
    const elixir = withItems({ elixir: 1 }, 100, 5);
    elixir.submitTurn([{ type: 'item', actor: P0, itemId: 'elixir', targetIndex: 0 }, { type: 'defend', actor: E0 }]);
    expect(elixir.combatantAt(P0)!.ki).toBe(22); // 5 + 15 + 2 de regen

    const bean = withItems({ bean: 1 }, 50, 5);
    const r = bean.submitTurn([{ type: 'item', actor: P0, itemId: 'bean', targetIndex: 0 }, { type: 'defend', actor: E0 }]);
    const events = r.ok ? r.value : [];
    expect(ofType(events, 'hp-restored')[0]!.amount).toBe(50);
    expect(bean.combatantAt(P0)).toMatchObject({ hp: 100, ki: 40 });
  });

  it('item só aparece no menu se ajudar o alvo; item-chave e item inexistente nunca', () => {
    const full = withItems({ meat: 1, badge: 1 }, 100);
    expect(full.legalActions(P0).some((a) => a.type === 'item')).toBe(false);

    const hurt = withItems({ meat: 1, badge: 1 }, 50);
    const items = hurt.legalActions(P0).filter((a) => a.type === 'item');
    expect(items).toEqual([{ type: 'item', actor: P0, itemId: 'meat', targetIndex: 0 }]);
    expect(hurt.validate({ type: 'item', actor: P0, itemId: 'meat', targetIndex: 7 }).ok).toBe(false);
  });

  it('pode curar quem está na reserva, mas não quem está caído', () => {
    const b = makeBattle({
      player: {
        members: [
          { characterId: 'hero', level: 5 },
          { characterId: 'master', level: 5, hp: 20 },
          { characterId: 'weak', level: 1, hp: 0 },
        ],
        inventory: { meat: 1 },
      },
    });
    const targets = b.legalActions(P0).flatMap((a) => (a.type === 'item' ? [a.targetIndex] : []));
    expect(targets).toEqual([1]);
  });

  it('dois lutadores não podem gastar mais unidades do que existem', () => {
    const b = makeBattle({
      player: {
        members: [{ characterId: 'hero', level: 5, hp: 50 }, { characterId: 'master', level: 5, hp: 50 }],
        activeCount: 2,
        inventory: { meat: 1 },
      },
    });
    const r = b.submitTurn([
      { type: 'item', actor: P0, itemId: 'meat', targetIndex: 0 },
      { type: 'item', actor: P1, itemId: 'meat', targetIndex: 1 },
      punch(E0, P0),
    ]);
    expect(r.ok).toBe(false);
  });
});

describe('escolhas em sequência com vários lutadores', () => {
  const duo = () =>
    makeBattle({
      player: {
        members: [
          { characterId: 'hero', level: 5, hp: 50 },
          { characterId: 'master', level: 5, hp: 50 },
          { characterId: 'rival', level: 5 },
          { characterId: 'fast', level: 5 },
        ],
        activeCount: 2,
        inventory: { meat: 1 },
      },
    });
  const meat0: BattleAction = { type: 'item', actor: P0, itemId: 'meat', targetIndex: 0 };
  const swap2: BattleAction = { type: 'switch', actor: P0, toIndex: 2 };

  it('item já reservado por um colega some do menu do outro', () => {
    const b = duo();
    expect(b.legalActions(P1).some((a) => a.type === 'item')).toBe(true);
    expect(b.legalActions(P1, [meat0]).some((a) => a.type === 'item')).toBe(false);
  });

  it('reserva já escalada por um colega some do menu do outro', () => {
    const b = duo();
    const options = (queued: BattleAction[]) => b.legalActions(P1, queued).flatMap((a) => (a.type === 'switch' ? [a.toIndex] : []));
    expect(options([])).toEqual([2, 3]);
    expect(options([swap2])).toEqual([3]);
  });

  it('as próprias ações do ator não contam como reserva dos colegas dele mesmo', () => {
    const b = duo();
    expect(b.legalActions(P0, [meat0]).some((a) => a.type === 'item')).toBe(true);
  });
});

describe('trocar de lutador', () => {
  const twoMen = () => makeBattle({ player: { members: [{ characterId: 'hero', level: 5 }, { characterId: 'master', level: 5 }] } });

  it('a troca acontece antes dos golpes: o inimigo acerta quem entrou', () => {
    const b = twoMen();
    const r = b.submitTurn([{ type: 'switch', actor: P0, toIndex: 1 }, punch(E0, P0)]);
    const events = r.ok ? r.value : [];
    expect(ofType(events, 'switch')[0]).toMatchObject({ from: 'player:0:hero', to: 'player:1:master', reason: 'chosen' });
    expect(ofType(events, 'damage')[0]).toMatchObject({ target: 'player:1:master', amount: 10 });
    expect(b.state.sides.player.active).toEqual([1]);
  });

  it('não dá para trocar por quem já está em campo, por caído ou por índice inválido', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5 }, { characterId: 'weak', level: 1, hp: 0 }] } });
    expect(b.validate({ type: 'switch', actor: P0, toIndex: 0 }).ok).toBe(false);
    expect(b.validate({ type: 'switch', actor: P0, toIndex: 1 }).ok).toBe(false);
    expect(b.validate({ type: 'switch', actor: P0, toIndex: 5 }).ok).toBe(false);
  });

  it('sair de campo desfaz a transformação', () => {
    const b = twoMen();
    b.submitTurn([{ type: 'transform', actor: P0, transformationId: 'rage' }, punch(E0, P0)]);
    expect(b.combatantAt(P0)!.transformationId).toBe('rage');
    const r = b.submitTurn([{ type: 'switch', actor: P0, toIndex: 1 }, punch(E0, P0)]);
    expect(ofType(r.ok ? r.value : [], 'revert')).toEqual([{ type: 'revert', actor: 'player:0:hero', reason: 'switched' }]);
    expect(b.state.sides.player.roster[0]!.transformationId).toBeNull();
  });
});

describe('substituição após derrota', () => {
  const setup = () =>
    makeBattle({ player: { members: [{ characterId: 'weak', level: 1 }, { characterId: 'hero', level: 5 }] } });

  it('a luta pausa até o jogador escolher o substituto', () => {
    const b = setup();
    const r = b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(ofType(r.ok ? r.value : [], 'faint').map((e) => e.target)).toEqual(['player:0:weak']);

    expect(b.phase).toBe('awaiting-replacement');
    expect(b.pendingReplacements()).toEqual([P0]);
    expect(b.actors()).toEqual([]);
    expect(b.submitTurn([]).ok).toBe(false);

    expect(b.replace('player', 0, 0).ok).toBe(false); // o caído não pode voltar
    expect(b.replace('enemy', 0, 0).ok).toBe(false); // lado errado
    const ok = b.replace('player', 0, 1);
    expect(ok.ok && ok.value[0]).toMatchObject({ type: 'switch', reason: 'fainted', to: 'player:1:hero' });
    expect(b.phase).toBe('awaiting-actions');
    expect(b.combatantAt(P0)!.characterId).toBe('hero');
  });

  it('autoReplace resolve sozinho (lado controlado pela IA) e ignora lados sem pendência', () => {
    const b = setup();
    b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(b.autoReplace('enemy')).toEqual([]);
    expect(b.phase).toBe('awaiting-replacement');
    expect(b.autoReplace('player')).toHaveLength(1);
    expect(b.phase).toBe('awaiting-actions');
  });

  it('sem reserva, não há substituição: a luta simplesmente acaba', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'weak', level: 1 }] } });
    b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    expect(b.pendingReplacements()).toEqual([]);
    expect(b.phase).toBe('finished');
  });
});

describe('transformações', () => {
  it('custa KI, multiplica atributos e drena KI a cada turno', () => {
    const b = makeBattle();
    const r = b.submitTurn([{ type: 'transform', actor: P0, transformationId: 'rage' }, punch(E0, P0)]);
    const events = r.ok ? r.value : [];

    expect(ofType(events, 'transform')).toEqual([{ type: 'transform', actor: 'player:0:hero', transformationId: 'rage' }]);
    // defesa 10 × 1,5 = 15 → 40·10/15/4 = 6
    expect(ofType(events, 'damage')[0]!.amount).toBe(6);
    // 40 − 10 (custo) + 2 (regen) − 5 (dreno)
    expect(b.combatantAt(P0)!.ki).toBe(27);
    expect(b.statsAt(P0)).toMatchObject({ attack: 40, defense: 15, speed: 15, hp: 100, ki: 40 });

    const next = b.submitTurn([punch(P0, E0), punch(E0, P0)]);
    // ataque 20 × 2 = 40 → 40·40/10/4 = 40 de dano
    expect(ofType(next.ok ? next.value : [], 'damage')[0]!.amount).toBe(40);
  });

  it('volta ao normal sozinho quando o KI acaba', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 11 }] } });
    const r = b.submitTurn([{ type: 'transform', actor: P0, transformationId: 'rage' }, punch(E0, P0)]);
    const events = r.ok ? r.value : [];
    // 11 − 10 = 1, +2 de regen = 3, dreno de 5 limitado ao que há (3) → 0
    expect(ofType(events, 'ki-changed').filter((e) => e.reason === 'drain')[0]).toMatchObject({ delta: -3, ki: 0 });
    expect(ofType(events, 'revert')).toEqual([{ type: 'revert', actor: 'player:0:hero', reason: 'out-of-ki' }]);
    expect(b.combatantAt(P0)!.transformationId).toBeNull();
  });

  it('pode ser desfeita por escolha', () => {
    const b = makeBattle();
    b.submitTurn([{ type: 'transform', actor: P0, transformationId: 'rage' }, punch(E0, P0)]);
    expect(b.legalActions(P0).some((a) => a.type === 'transform')).toBe(false);
    const r = b.submitTurn([{ type: 'revert', actor: P0 }, punch(E0, P0)]);
    expect(ofType(r.ok ? r.value : [], 'revert')[0]).toMatchObject({ reason: 'chosen' });
    expect(b.combatantAt(P0)!.transformationId).toBeNull();
  });

  it('exige nível mínimo e KI para ativar', () => {
    const lowLevel = makeBattle({ player: { members: [{ characterId: 'hero', level: 4 }] } });
    expect(lowLevel.validate({ type: 'transform', actor: P0, transformationId: 'rage' }).ok).toBe(false);
    const lowKi = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, ki: 9 }] } });
    expect(lowKi.validate({ type: 'transform', actor: P0, transformationId: 'rage' }).ok).toBe(false);
    expect(makeBattle().validate({ type: 'transform', actor: P0, transformationId: 'rage' }).ok).toBe(true);
    expect(makeBattle().validate({ type: 'transform', actor: P0, transformationId: 'ghost' }).ok).toBe(false);
  });

  it('ser derrotado desfaz a transformação', () => {
    const b = makeBattle({ player: { members: [{ characterId: 'hero', level: 5, hp: 5 }] } });
    const r = b.submitTurn([{ type: 'transform', actor: P0, transformationId: 'rage' }, punch(E0, P0)]);
    const types = (r.ok ? r.value : []).map((e) => e.type).filter((t) => ['damage', 'revert', 'faint', 'battle-end'].includes(t));
    expect(types).toEqual(['damage', 'revert', 'faint', 'battle-end']);
  });
});

describe('vários lutadores em campo (N×M)', () => {
  it('golpe em área atinge todos os inimigos em campo', () => {
    const b = makeBattle({
      player: { members: [{ characterId: 'master', level: 5 }] },
      enemy: { members: [{ characterId: 'rival', level: 5 }, { characterId: 'rival', level: 5 }], activeCount: 2 },
    });
    expect(b.actors()).toHaveLength(3);
    const r = b.submitTurn([
      { type: 'move', actor: P0, moveId: 'wave', target: E0 },
      punch(E0, P0),
      punch(E1, P0),
    ]);
    const events = r.ok ? r.value : [];
    expect(ofType(events, 'damage').filter((e) => e.moveId === 'wave').map((e) => [e.target, e.amount])).toEqual([
      ['enemy:0:rival', 25],
      ['enemy:1:rival', 25],
    ]);
    expect(b.combatantAt(P0)!.ki).toBe(34); // 40 − 8 (custo) + 2 (regen de 5%)
  });

  it('se o alvo já caiu neste turno, o golpe é redirecionado a outro inimigo vivo', () => {
    const b = makeBattle({
      player: { members: [{ characterId: 'hero', level: 5 }, { characterId: 'master', level: 5 }], activeCount: 2 },
      enemy: { members: [{ characterId: 'weak', level: 1 }, { characterId: 'rival', level: 5 }], activeCount: 2 },
    });
    const r = b.submitTurn([punch(P0, E0), punch(P1, E0), punch(E0, P0), punch(E1, P0)]);
    const damage = ofType(r.ok ? r.value : [], 'damage').filter((e) => e.actor.startsWith('player'));
    expect(damage.map((e) => e.target)).toEqual(['enemy:0:weak', 'enemy:1:rival']);
  });

  it('lutador caído sem reserva deixa de agir nos turnos seguintes', () => {
    const b = makeBattle({
      player: { members: [{ characterId: 'hero', level: 5 }] },
      enemy: { members: [{ characterId: 'weak', level: 1 }, { characterId: 'rival', level: 5 }], activeCount: 2 },
    });
    b.submitTurn([punch(P0, E0), punch(E0, P0), punch(E1, P0)]);
    expect(b.phase).toBe('awaiting-actions');
    expect(b.actors()).toEqual([P0, E1]);
  });
});
