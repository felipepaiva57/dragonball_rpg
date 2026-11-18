import type { SaveSlotId } from '@/core/state/SaveService';

export type FlagValue = boolean | number | string;

/**
 * Catálogo de eventos do jogo. Cada fase adiciona os seus
 * (ex.: 'battle:started' na Fase 1). Mantido pequeno de propósito.
 */
export interface GameEvents {
  'flag:changed': { key: string; value: FlagValue; previous: FlagValue | undefined };
  'inventory:changed': { itemId: string; quantity: number };
  'party:changed': { characterId: string };
  'save:written': { slot: SaveSlotId };
  'save:loaded': { slot: SaveSlotId };
}
