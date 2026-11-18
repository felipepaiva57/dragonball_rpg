import { describe, expect, it } from 'vitest';
import { movesKnownAtLevel, statsAtLevel } from '@/core/progression/stats';
import { validRegistry } from './helpers';

describe('statsAtLevel', () => {
  const hero = validRegistry().characters.require('hero');

  it('nível 1 devolve os atributos base', () => {
    expect(statsAtLevel(hero, 1)).toEqual(hero.baseStats);
  });

  it('aplica o ganho por nível e arredonda para baixo', () => {
    // ki: 10 + 1.5 × 3 = 14.5 → 14
    expect(statsAtLevel(hero, 4)).toEqual({ hp: 29, ki: 14, attack: 8, defense: 8, speed: 8 });
  });

  it('rejeita nível fora do intervalo', () => {
    expect(() => statsAtLevel(hero, 0)).toThrow(RangeError);
    expect(() => statsAtLevel(hero, 101)).toThrow(RangeError);
    expect(() => statsAtLevel(hero, 2.5)).toThrow(RangeError);
  });
});

describe('movesKnownAtLevel', () => {
  const hero = validRegistry().characters.require('hero');
  it('inclui só os golpes liberados até o nível', () => {
    expect(movesKnownAtLevel(hero, 3)).toEqual(['punch']);
    expect(movesKnownAtLevel(hero, 4)).toEqual(['punch', 'beam']);
  });
});
