import { describe, expect, it } from 'vitest';
import { createSeededRng, pickWeighted } from '@/shared/random';

describe('createSeededRng', () => {
  it('é reproduzível e diferente entre sementes', () => {
    const seq = (seed: number) => {
      const r = createSeededRng(seed);
      return Array.from({ length: 5 }, () => r.next());
    };
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });

  it('só produz valores em [0, 1) com distribuição aproximadamente uniforme', () => {
    const r = createSeededRng(123);
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 4)]!++;
    }
    for (const count of buckets) expect(count / 20000).toBeGreaterThan(0.23);
  });
});

describe('pickWeighted', () => {
  it('respeita os pesos', () => {
    const r = createSeededRng(5);
    let a = 0;
    for (let i = 0; i < 10000; i++) if (pickWeighted(['a', 'b'], [3, 1], r) === 'a') a++;
    expect(a / 10000).toBeGreaterThan(0.72);
    expect(a / 10000).toBeLessThan(0.78);
  });

  it('peso zero nunca é escolhido; todos zero cai em sorteio uniforme; lista vazia lança', () => {
    const r = createSeededRng(9);
    for (let i = 0; i < 500; i++) expect(pickWeighted(['a', 'b'], [0, 1], r)).toBe('b');
    expect(['x', 'y']).toContain(pickWeighted(['x', 'y'], [0, 0], r));
    expect(() => pickWeighted([], [], r)).toThrow();
  });
});
