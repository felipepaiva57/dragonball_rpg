import { DataRegistry, type RawGameData } from '@/core/data/DataRegistry';

/** Dados mínimos válidos para testes, independentes do conteúdo real do jogo. */
export function validRaw(): RawGameData {
  return {
    moves: [
      {
        source: 'm/punch.json',
        data: { id: 'punch', name: 'Soco', category: 'physical', power: 30, kiCost: 0, accuracy: 100, target: 'enemy' },
      },
      {
        source: 'm/beam.json',
        data: { id: 'beam', name: 'Raio', category: 'ki', power: 60, kiCost: 5, accuracy: 90, target: 'enemy' },
      },
    ],
    characters: [
      {
        source: 'c/hero.json',
        data: {
          id: 'hero',
          name: 'Herói',
          baseStats: { hp: 20, ki: 10, attack: 5, defense: 5, speed: 5 },
          growth: { hp: 3, ki: 1.5, attack: 1, defense: 1, speed: 1 },
          learnset: [
            { level: 1, moveId: 'punch' },
            { level: 4, moveId: 'beam' },
          ],
        },
      },
    ],
    items: [
      {
        source: 'i/meat.json',
        data: { id: 'meat', name: 'Carne', description: 'Cura.', kind: 'consumable', effect: { type: 'heal-hp', amount: 10 } },
      },
    ],
  };
}

export function validRegistry(): DataRegistry {
  return DataRegistry.build(validRaw());
}
