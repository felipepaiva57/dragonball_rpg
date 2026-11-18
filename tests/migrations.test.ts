import { describe, expect, it } from 'vitest';
import { CURRENT_SAVE_VERSION, MIGRATIONS, migrateState } from '@/core/state/migrations';

describe('migrações reais', () => {
  it('existe uma migração para cada versão anterior à atual (cadeia completa)', () => {
    for (let v = 1; v < CURRENT_SAVE_VERSION; v++) {
      expect(MIGRATIONS[v], `falta a migração v${v} → v${v + 1}`).toBeTypeOf('function');
    }
  });

  it('não há migrações "do futuro" sobrando', () => {
    for (const key of Object.keys(MIGRATIONS)) {
      expect(Number(key)).toBeLessThan(CURRENT_SAVE_VERSION);
    }
  });
});

describe('migrateState', () => {
  it('sem diferença de versão, devolve o estado intacto', () => {
    const state = { a: 1 };
    expect(migrateState(state, 2, 2, {})).toEqual({ ok: true, value: state });
  });

  it('encadeia as migrações na ordem', () => {
    const result = migrateState({ log: '' }, 1, 3, {
      1: (s) => ({ log: (s as { log: string }).log + 'a' }),
      2: (s) => ({ log: (s as { log: string }).log + 'b' }),
    });
    expect(result).toEqual({ ok: true, value: { log: 'ab' } });
  });
});
