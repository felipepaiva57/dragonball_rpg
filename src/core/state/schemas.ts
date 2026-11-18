import { z } from 'zod';
import { MAX_LEVEL } from '@/core/constants';
import { IdSchema } from '@/core/data/schemas';

/**
 * Formato do estado salvo (versão atual). Qualquer mudança incompatível
 * exige subir CURRENT_SAVE_VERSION e escrever uma migração (ver migrations.ts).
 */

export const PartyMemberSchema = z.strictObject({
  characterId: IdSchema,
  level: z.number().int().min(1).max(MAX_LEVEL),
  xp: z.number().int().nonnegative(),
  currentHp: z.number().int().nonnegative(),
  currentKi: z.number().int().nonnegative(),
  knownMoves: z.array(IdSchema),
});

export const FlagValueSchema = z.union([z.boolean(), z.number(), z.string()]);

export const GameStateSchema = z.strictObject({
  meta: z.strictObject({
    createdAt: z.number().int().nonnegative(),
    playTimeMs: z.number().int().nonnegative(),
  }),
  party: z.array(PartyMemberSchema),
  /** itemId → quantidade (sempre ≥ 1; item zerado é removido). */
  inventory: z.record(IdSchema, z.number().int().positive()),
  story: z.strictObject({
    /** 'main' é a campanha original; as alternativas terão ids próprios. */
    campaignId: IdSchema,
    flags: z.record(z.string(), FlagValueSchema),
  }),
});

export type PartyMember = z.infer<typeof PartyMemberSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
