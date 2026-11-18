import type Phaser from 'phaser';
import { DataRegistry } from '@/core/data/DataRegistry';
import { GameStore } from '@/core/state/GameStore';
import { createNewGameState } from '@/core/state/newGame';
import { SaveService, type SaveError } from '@/core/state/SaveService';
import { loadGameData } from '@/data/loadData';
import { EventBus } from '@/shared/EventBus';
import type { GameEvents } from '@/shared/events';
import { createBrowserStorage } from './services/browserStorage';

export const MAIN_SLOT = 'slot-1';
const CONTEXT_KEY = 'ctx';

/**
 * Tudo o que as cenas precisam do core, num único objeto montado uma vez
 * (composition root). As cenas recebem o contexto; não criam serviços.
 */
export interface GameContext {
  events: EventBus<GameEvents>;
  data: DataRegistry;
  store: GameStore;
  saves: SaveService;
  storagePersistent: boolean;
  /** Preenchido quando existia um save no slot, mas ele não pôde ser lido. */
  loadError: SaveError | null;
  /** true se o estado veio de um save; false se é um jogo novo. */
  loadedFromSave: boolean;
}

export function createContext(): GameContext {
  const events = new EventBus<GameEvents>();
  const data = loadGameData(); // lança DataValidationError se o conteúdo estiver inválido
  const storage = createBrowserStorage();
  const saves = new SaveService({ storage: storage.adapter, events });

  const loaded = saves.load(MAIN_SLOT);
  // Um save ilegível NÃO é sobrescrito automaticamente: o jogo só grava quando o jogador pede.
  const loadError = !loaded.ok && loaded.error.code !== 'not-found' ? loaded.error : null;
  const state = loaded.ok ? loaded.value : createNewGameState(data);

  return {
    events,
    data,
    store: new GameStore(state, events),
    saves,
    storagePersistent: storage.persistent,
    loadError,
    loadedFromSave: loaded.ok,
  };
}

export function provideContext(game: Phaser.Game, ctx: GameContext): void {
  game.registry.set(CONTEXT_KEY, ctx);
}

export function getContext(scene: Phaser.Scene): GameContext {
  const ctx = scene.registry.get(CONTEXT_KEY) as GameContext | undefined;
  if (!ctx) throw new Error('GameContext não foi registrado (veja main.ts)');
  return ctx;
}
