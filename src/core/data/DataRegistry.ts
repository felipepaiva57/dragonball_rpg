import type { z } from 'zod';
import {
  CharacterSchema,
  ItemSchema,
  MoveSchema,
  type CharacterDef,
  type ItemDef,
  type MoveDef,
} from './schemas';

/** Um dado bruto e de onde veio (usado para apontar o arquivo nas mensagens de erro). */
export interface RawEntry {
  source: string;
  data: unknown;
}

export interface RawGameData {
  characters: RawEntry[];
  moves: RawEntry[];
  items: RawEntry[];
}

/** Lançado quando os dados do jogo estão inválidos. Carrega TODOS os problemas encontrados. */
export class DataValidationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Dados do jogo inválidos (${issues.length}):\n - ${issues.join('\n - ')}`);
    this.name = 'DataValidationError';
  }
}

/** Coleção somente leitura de definições indexadas por id. */
export class Collection<T extends { id: string }> {
  private readonly byId = new Map<string, T>();

  constructor(
    private readonly kind: string,
    items: readonly T[],
  ) {
    for (const item of items) this.byId.set(item.id, item);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  find(id: string): T | undefined {
    return this.byId.get(id);
  }

  /** Como find, mas lança se não existir. Use quando o id já deveria ter sido validado. */
  require(id: string): T {
    const item = this.byId.get(id);
    if (!item) throw new Error(`${this.kind} "${id}" não existe nos dados do jogo`);
    return item;
  }

  all(): readonly T[] {
    return [...this.byId.values()];
  }

  get size(): number {
    return this.byId.size;
  }
}

/**
 * Ponto único de acesso aos dados de conteúdo, já validados.
 * Nada além de `DataRegistry.build` cria instâncias: se o objeto existe,
 * os dados passaram em schema, unicidade de ids e referências cruzadas.
 */
export class DataRegistry {
  private constructor(
    readonly characters: Collection<CharacterDef>,
    readonly moves: Collection<MoveDef>,
    readonly items: Collection<ItemDef>,
  ) {}

  static build(raw: RawGameData): DataRegistry {
    const issues: string[] = [];

    const characters = parseAll('personagem', CharacterSchema, raw.characters, issues);
    const moves = parseAll('golpe', MoveSchema, raw.moves, issues);
    const items = parseAll('item', ItemSchema, raw.items, issues);

    // Referências cruzadas só fazem sentido sobre dados estruturalmente válidos;
    // senão gerariam erros em cascata enganosos.
    if (issues.length === 0) {
      checkCrossReferences(characters, moves, issues);
    }

    if (issues.length > 0) throw new DataValidationError(issues);

    return new DataRegistry(
      new Collection('personagem', characters),
      new Collection('golpe', moves),
      new Collection('item', items),
    );
  }
}

function parseAll<S extends z.ZodType<{ id: string }>>(
  kind: string,
  schema: S,
  entries: readonly RawEntry[],
  issues: string[],
): z.output<S>[] {
  const parsed: z.output<S>[] = [];
  const seen = new Map<string, string>();

  for (const entry of entries) {
    const result = schema.safeParse(entry.data);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(raiz)';
        issues.push(`${entry.source}: ${path} — ${issue.message}`);
      }
      continue;
    }

    const id = result.data.id;
    const firstSource = seen.get(id);
    if (firstSource !== undefined) {
      issues.push(`${entry.source}: ${kind} com id "${id}" duplicado (já definido em ${firstSource})`);
      continue;
    }
    seen.set(id, entry.source);
    parsed.push(result.data);
  }

  return parsed;
}

function checkCrossReferences(
  characters: readonly CharacterDef[],
  moves: readonly MoveDef[],
  issues: string[],
): void {
  const moveIds = new Set(moves.map((m) => m.id));

  for (const character of characters) {
    for (const { moveId } of character.learnset) {
      if (!moveIds.has(moveId)) {
        issues.push(`personagem "${character.id}": golpe "${moveId}" do learnset não existe`);
      }
    }
    if (!character.learnset.some((entry) => entry.level === 1)) {
      issues.push(`personagem "${character.id}": precisa de ao menos um golpe no nível 1`);
    }
    const seen = new Set<string>();
    for (const { id } of character.transformations) {
      if (seen.has(id)) issues.push(`personagem "${character.id}": transformação "${id}" duplicada`);
      seen.add(id);
    }
  }
}
