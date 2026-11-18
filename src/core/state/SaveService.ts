import { z } from 'zod';
import type { EventBus } from '@/shared/EventBus';
import type { GameEvents } from '@/shared/events';
import { err, ok, type Result } from '@/shared/Result';
import type { Clock } from '@/shared/types';
import { CURRENT_SAVE_VERSION, MIGRATIONS, migrateState, type MigrationMap } from './migrations';
import { GameStateSchema, type GameState } from './schemas';
import type { StorageAdapter } from './StorageAdapter';

export type SaveSlotId = string;

export type SaveErrorCode =
  | 'not-found'
  | 'corrupted' // não é JSON ou não tem o envelope esperado
  | 'invalid' // JSON bem formado, mas o estado não passa no schema
  | 'newer-version' // save feito por uma versão mais nova do jogo
  | 'migration-failed'
  | 'storage-failed';

export interface SaveError {
  code: SaveErrorCode;
  message: string;
}

export interface SlotSummary {
  savedAt: number;
  playTimeMs: number;
  campaignId: string;
}

export type SlotInfo = { slot: SaveSlotId } & Result<SlotSummary, SaveError>;

/** Envelope gravado: a versão fica fora do estado para podermos migrá-lo antes de validar. */
const EnvelopeSchema = z.object({
  version: z.number().int().min(1),
  savedAt: z.number(),
  state: z.unknown(),
});

export interface SaveServiceOptions {
  storage: StorageAdapter;
  events: EventBus<GameEvents>;
  clock?: Clock;
  keyPrefix?: string;
  /** Só para testes de migração. */
  migrations?: MigrationMap;
  currentVersion?: number;
}

export class SaveService {
  private readonly storage: StorageAdapter;
  private readonly events: EventBus<GameEvents>;
  private readonly clock: Clock;
  private readonly prefix: string;
  private readonly migrations: MigrationMap;
  private readonly version: number;

  constructor(options: SaveServiceOptions) {
    this.storage = options.storage;
    this.events = options.events;
    this.clock = options.clock ?? Date.now;
    this.prefix = options.keyPrefix ?? 'dbrpg:save:';
    this.migrations = options.migrations ?? MIGRATIONS;
    this.version = options.currentVersion ?? CURRENT_SAVE_VERSION;
  }

  has(slot: SaveSlotId): boolean {
    return this.storage.getItem(this.key(slot)) !== null;
  }

  save(slot: SaveSlotId, state: GameState): Result<SlotSummary, SaveError> {
    // Nunca grava um estado que o próprio jogo não conseguiria ler de volta.
    const parsed = GameStateSchema.safeParse(state);
    if (!parsed.success) {
      return err({ code: 'invalid', message: formatIssues(parsed.error) });
    }
    return this.write(slot, parsed.data);
  }

  load(slot: SaveSlotId): Result<GameState, SaveError> {
    const text = this.storage.getItem(this.key(slot));
    if (text === null) return err({ code: 'not-found', message: `slot "${slot}" vazio` });

    const decoded = this.decode(text);
    if (!decoded.ok) return decoded;

    this.events.emit('save:loaded', { slot });
    return ok(decoded.value.state);
  }

  delete(slot: SaveSlotId): void {
    this.storage.removeItem(this.key(slot));
  }

  /** Lista os slots existentes. Slots ilegíveis aparecem com o erro, em vez de sumirem. */
  listSlots(): SlotInfo[] {
    return this.storage
      .keys()
      .filter((k) => k.startsWith(this.prefix))
      .sort()
      .map((k): SlotInfo => {
        const slot = k.slice(this.prefix.length);
        const text = this.storage.getItem(k);
        if (text === null) return { slot, ...err({ code: 'not-found', message: 'slot vazio' }) };
        const decoded = this.decode(text);
        if (!decoded.ok) return { slot, ...decoded };
        return { slot, ...ok(summarize(decoded.value.state, decoded.value.savedAt)) };
      });
  }

  /** Texto do save (JSON) para o jogador guardar em arquivo. Só exporta saves válidos. */
  exportSlot(slot: SaveSlotId): Result<string, SaveError> {
    const text = this.storage.getItem(this.key(slot));
    if (text === null) return err({ code: 'not-found', message: `slot "${slot}" vazio` });
    const decoded = this.decode(text);
    if (!decoded.ok) return decoded;
    return ok(text);
  }

  /** Valida (incluindo migração) o texto importado e só então grava no slot. */
  importSlot(slot: SaveSlotId, text: string): Result<GameState, SaveError> {
    const decoded = this.decode(text);
    if (!decoded.ok) return decoded;
    const written = this.write(slot, decoded.value.state);
    if (!written.ok) return written;
    return ok(decoded.value.state);
  }

  // ---- internos ----

  private key(slot: SaveSlotId): string {
    return this.prefix + slot;
  }

  private write(slot: SaveSlotId, state: GameState): Result<SlotSummary, SaveError> {
    const savedAt = this.clock();
    const text = JSON.stringify({ version: this.version, savedAt, state });
    try {
      this.storage.setItem(this.key(slot), text);
    } catch (error) {
      return err({ code: 'storage-failed', message: `não foi possível gravar: ${String(error)}` });
    }
    this.events.emit('save:written', { slot });
    return ok(summarize(state, savedAt));
  }

  /** Texto → estado migrado e validado. Único caminho de leitura (load, list, import, export). */
  private decode(text: string): Result<{ state: GameState; savedAt: number }, SaveError> {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return err({ code: 'corrupted', message: 'o save não é um JSON válido' });
    }

    const envelope = EnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      return err({ code: 'corrupted', message: 'o save não tem o formato esperado' });
    }
    const { version, savedAt, state } = envelope.data;

    if (version > this.version) {
      return err({
        code: 'newer-version',
        message: `save da versão ${version}; este jogo só entende até a ${this.version}`,
      });
    }

    const migrated = migrateState(state, version, this.version, this.migrations);
    if (!migrated.ok) return migrated;

    const parsed = GameStateSchema.safeParse(migrated.value);
    if (!parsed.success) return err({ code: 'invalid', message: formatIssues(parsed.error) });

    return ok({ state: parsed.data, savedAt });
  }
}

function summarize(state: GameState, savedAt: number): SlotSummary {
  return { savedAt, playTimeMs: state.meta.playTimeMs, campaignId: state.story.campaignId };
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.length > 0 ? i.path.join('.') : '(raiz)'}: ${i.message}`)
    .join('; ');
}
