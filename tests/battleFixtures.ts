import { Battle } from '@/core/battle/Battle';
import type { BattleRules } from '@/core/battle/rules';
import type { BattleEvent, BattleSetup, SideSetup } from '@/core/battle/types';
import { DataRegistry, type RawEntry } from '@/core/data/DataRegistry';
import type { Rng } from '@/shared/random';

/**
 * Dados e regras de TESTE para o combate: números redondos, para que cada
 * resultado possa ser conferido à mão. Independentes dos dados reais do jogo.
 *
 * Fórmula de teste: dano = floor(poder × ataque / defesa / 4), sem variação.
 *   hero  (atq 20) socando (40) rival (def 10) → 20
 *   rival (atq 10) socando (40) hero  (def 10) → 10
 */
export const TEST_RULES: Partial<BattleRules> = {
  damageFormula: ({ power, attack, defense }) => Math.floor((power * attack) / Math.max(1, defense) / 4),
  damageVariance: { min: 1, max: 1 },
};

const entry = (source: string, data: unknown): RawEntry => ({ source, data });

const move = (id: string, p: Record<string, unknown>) =>
  entry(`moves/${id}`, { id, name: id, category: 'physical', power: 40, kiCost: 0, accuracy: 100, target: 'enemy', ...p });

const character = (id: string, s: { hp: number; ki: number; atk: number; def: number; spd: number }, moves: string[], extra: Record<string, unknown> = {}) =>
  entry(`characters/${id}`, {
    id,
    name: id,
    baseStats: { hp: s.hp, ki: s.ki, attack: s.atk, defense: s.def, speed: s.spd },
    growth: { hp: 0, ki: 0, attack: 0, defense: 0, speed: 0 },
    learnset: moves.map((moveId) => ({ level: 1, moveId })),
    ...extra,
  });

export function battleRegistry(): DataRegistry {
  return DataRegistry.build({
    moves: [
      move('punch', {}),
      move('blast', { category: 'ki', power: 80, kiCost: 10 }),
      move('wave', { category: 'ki', power: 50, kiCost: 8, target: 'all-enemies' }),
      move('shaky', { accuracy: 50 }),
    ],
    characters: [
      character('hero', { hp: 100, ki: 40, atk: 20, def: 10, spd: 10 }, ['punch', 'blast'], {
        transformations: [
          {
            id: 'rage',
            name: 'Fúria',
            unlockLevel: 5,
            multipliers: { attack: 2, defense: 1.5, speed: 1.5 },
            activationKiCost: 10,
            kiDrainPerTurn: 5,
          },
        ],
      }),
      character('rival', { hp: 100, ki: 40, atk: 10, def: 10, spd: 5 }, ['punch']),
      character('fast', { hp: 50, ki: 20, atk: 10, def: 10, spd: 30 }, ['punch']),
      character('weak', { hp: 5, ki: 10, atk: 1, def: 1, spd: 1 }, ['punch']),
      character('master', { hp: 100, ki: 40, atk: 20, def: 10, spd: 10 }, ['wave', 'punch']),
      character('sloppy', { hp: 100, ki: 10, atk: 20, def: 10, spd: 10 }, ['shaky']),
      character('caster', { hp: 100, ki: 40, atk: 20, def: 10, spd: 10 }, ['blast']),
    ],
    items: [
      entry('items/meat', { id: 'meat', name: 'Carne', description: '', kind: 'consumable', effect: { type: 'heal-hp', amount: 30 } }),
      entry('items/elixir', { id: 'elixir', name: 'Elixir', description: '', kind: 'consumable', effect: { type: 'heal-ki', amount: 15 } }),
      entry('items/bean', { id: 'bean', name: 'Semente', description: '', kind: 'consumable', effect: { type: 'full-restore' } }),
      entry('items/badge', { id: 'badge', name: 'Insígnia', description: '', kind: 'key' }),
    ],
  });
}

/** Rng que sempre devolve o mesmo valor (0 → todo golpe acerta; empates de velocidade viram estáveis). */
export const constRng = (value: number): Rng => ({ next: () => value });

/** Rng que percorre uma lista de valores em ciclo. */
export function seqRng(values: number[]): Rng {
  let i = 0;
  return { next: () => values[i++ % values.length]! };
}

export function makeBattle(
  sides: { player?: SideSetup; enemy?: SideSetup } = {},
  options: { rng?: Rng; rules?: Partial<BattleRules> } = {},
): Battle {
  const setup: BattleSetup = {
    player: sides.player ?? { members: [{ characterId: 'hero', level: 5 }] },
    enemy: sides.enemy ?? { members: [{ characterId: 'rival', level: 5 }] },
  };
  return Battle.create(setup, {
    data: battleRegistry(),
    rng: options.rng ?? constRng(0),
    rules: { ...TEST_RULES, ...options.rules },
  });
}

export const P0 = { side: 'player', slot: 0 } as const;
export const P1 = { side: 'player', slot: 1 } as const;
export const E0 = { side: 'enemy', slot: 0 } as const;
export const E1 = { side: 'enemy', slot: 1 } as const;

export const ofType = <T extends BattleEvent['type']>(events: BattleEvent[], type: T) =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
