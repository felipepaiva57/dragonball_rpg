import { describe, expect, it } from 'vitest';
import { DataRegistry, DataValidationError } from '@/core/data/DataRegistry';
import { validRaw } from './helpers';

function buildIssues(mutate: (raw: ReturnType<typeof validRaw>) => void): readonly string[] {
  const raw = validRaw();
  mutate(raw);
  try {
    DataRegistry.build(raw);
  } catch (error) {
    if (error instanceof DataValidationError) return error.issues;
    throw error;
  }
  throw new Error('esperava DataValidationError');
}

describe('DataRegistry', () => {
  it('constrói com dados válidos e permite consulta por id', () => {
    const reg = DataRegistry.build(validRaw());
    expect(reg.characters.require('hero').name).toBe('Herói');
    expect(reg.moves.size).toBe(2);
    expect(reg.items.has('meat')).toBe(true);
    expect(reg.items.find('nope')).toBeUndefined();
  });

  it('require() lança para id inexistente', () => {
    const reg = DataRegistry.build(validRaw());
    expect(() => reg.moves.require('nope')).toThrow(/não existe/);
  });

  it('aponta o arquivo e o campo de cada erro de schema', () => {
    const issues = buildIssues((raw) => {
      (raw.moves[0]!.data as Record<string, unknown>).accuracy = 150;
    });
    expect(issues.some((i) => i.startsWith('m/punch.json: accuracy'))).toBe(true);
  });

  it('rejeita chaves desconhecidas (typos em JSON)', () => {
    const issues = buildIssues((raw) => {
      (raw.moves[0]!.data as Record<string, unknown>).powr = 10;
    });
    expect(issues.some((i) => i.includes('m/punch.json'))).toBe(true);
  });

  it('rejeita id fora de kebab-case', () => {
    const issues = buildIssues((raw) => {
      (raw.items[0]!.data as Record<string, unknown>).id = 'Carne Assada';
    });
    expect(issues.some((i) => i.includes('kebab-case'))).toBe(true);
  });

  it('exige effect em item consumível', () => {
    const issues = buildIssues((raw) => {
      delete (raw.items[0]!.data as Record<string, unknown>).effect;
    });
    expect(issues.some((i) => i.includes('effect'))).toBe(true);
  });

  it('detecta ids duplicados e informa o primeiro arquivo', () => {
    const issues = buildIssues((raw) => {
      raw.moves.push({ source: 'm/punch-copy.json', data: { ...(raw.moves[0]!.data as object) } });
    });
    expect(issues.some((i) => i.includes('duplicado') && i.includes('m/punch.json'))).toBe(true);
  });

  it('detecta golpe do learnset inexistente', () => {
    const issues = buildIssues((raw) => {
      const learnset = (raw.characters[0]!.data as { learnset: { level: number; moveId: string }[] }).learnset;
      learnset.push({ level: 9, moveId: 'ghost-move' });
    });
    expect(issues.some((i) => i.includes('ghost-move'))).toBe(true);
  });

  it('exige ao menos um golpe no nível 1', () => {
    const issues = buildIssues((raw) => {
      const learnset = (raw.characters[0]!.data as { learnset: { level: number; moveId: string }[] }).learnset;
      learnset[0]!.level = 2;
    });
    expect(issues.some((i) => i.includes('nível 1'))).toBe(true);
  });

  it('transformações são opcionais (padrão: nenhuma) e validadas quando existem', () => {
    expect(DataRegistry.build(validRaw()).characters.require('hero').transformations).toEqual([]);

    const form = { id: 'rage', name: 'Fúria', unlockLevel: 5, multipliers: { attack: 2, defense: 1.5, speed: 1 }, activationKiCost: 10, kiDrainPerTurn: 5 };
    const raw = validRaw();
    (raw.characters[0]!.data as Record<string, unknown>).transformations = [form];
    expect(DataRegistry.build(raw).characters.require('hero').transformations).toHaveLength(1);

    const bad = buildIssues((r) => {
      (r.characters[0]!.data as Record<string, unknown>).transformations = [{ ...form, multipliers: { attack: 0, defense: 1, speed: 1 } }];
    });
    expect(bad.some((i) => i.includes('multipliers.attack'))).toBe(true);
  });

  it('detecta transformação duplicada no mesmo personagem', () => {
    const form = { id: 'rage', name: 'Fúria', unlockLevel: 5, multipliers: { attack: 2, defense: 1, speed: 1 }, activationKiCost: 0, kiDrainPerTurn: 0 };
    const issues = buildIssues((r) => {
      (r.characters[0]!.data as Record<string, unknown>).transformations = [form, form];
    });
    expect(issues.some((i) => i.includes('duplicada'))).toBe(true);
  });

  it('golpes: categoria "support", alvos sem efeito definido e poder 0 são rejeitados por enquanto', () => {
    for (const patch of [{ category: 'support' }, { target: 'self' }, { power: 0 }]) {
      const issues = buildIssues((r) => Object.assign(r.moves[0]!.data as object, patch));
      expect(issues.length, JSON.stringify(patch)).toBeGreaterThan(0);
    }
  });

  it('reporta todos os problemas de uma vez, não só o primeiro', () => {
    const issues = buildIssues((raw) => {
      (raw.moves[0]!.data as Record<string, unknown>).accuracy = 0;
      (raw.items[0]!.data as Record<string, unknown>).name = '';
    });
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});
