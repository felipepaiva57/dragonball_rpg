import { err, ok, type Result } from '@/shared/Result';

/**
 * Versão do formato de save. Regras:
 *  1. Mudou o formato de forma incompatível? Suba CURRENT_SAVE_VERSION.
 *  2. Adicione em `migrations` a função da versão antiga → nova (chave = versão de origem).
 *  3. Nunca edite uma migração já publicada: jogadores com saves antigos dependem dela.
 *
 * O teste "migrations.test.ts" falha se faltar alguma migração na cadeia.
 */
export const CURRENT_SAVE_VERSION = 1;

/** Migra o estado da versão N para N+1. Recebe e devolve dados ainda não validados. */
export type Migration = (state: unknown) => unknown;
export type MigrationMap = Readonly<Record<number, Migration>>;

/**
 * Migrações reais do jogo. Vazio: a v1 é a primeira versão.
 * Exemplo futuro (Fase 3, posição no mapa):
 *   1: (s) => ({ ...(s as object), world: { mapId: 'start', x: 0, y: 0, facing: 'down' } }),
 */
export const MIGRATIONS: MigrationMap = {};

export type MigrationError = { code: 'migration-failed'; message: string };

export function migrateState(
  state: unknown,
  fromVersion: number,
  toVersion: number,
  migrations: MigrationMap,
): Result<unknown, MigrationError> {
  let current = state;
  for (let version = fromVersion; version < toVersion; version++) {
    const migrate = migrations[version];
    if (!migrate) {
      return err({
        code: 'migration-failed',
        message: `não há migração da versão ${version} para ${version + 1}`,
      });
    }
    try {
      current = migrate(current);
    } catch (error) {
      return err({
        code: 'migration-failed',
        message: `falha migrando v${version}→v${version + 1}: ${String(error)}`,
      });
    }
  }
  return ok(current);
}
