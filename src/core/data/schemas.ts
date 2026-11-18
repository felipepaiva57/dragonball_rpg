import { z } from 'zod';
import { MAX_LEVEL } from '@/core/constants';

/**
 * Schemas dos dados de conteúdo (personagens, golpes, itens).
 * São a fonte única de verdade: os tipos TypeScript são inferidos daqui,
 * então o formato validado em runtime e o formato usado no código nunca divergem.
 *
 * Todos usam strictObject: uma chave digitada errada num JSON vira erro de
 * validação, em vez de ser ignorada silenciosamente.
 */

export const IdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id deve estar em kebab-case (ex.: "goku-kid")');

const StatValue = z.number().int().nonnegative();

export const StatsSchema = z.strictObject({
  hp: z.number().int().positive(),
  ki: StatValue,
  attack: StatValue,
  defense: StatValue,
  speed: StatValue,
});

/** Ganho por nível. Aceita fração (ex.: 1.5 de KI por nível), arredondada no cálculo. */
export const GrowthSchema = z.strictObject({
  hp: z.number().nonnegative(),
  ki: z.number().nonnegative(),
  attack: z.number().nonnegative(),
  defense: z.number().nonnegative(),
  speed: z.number().nonnegative(),
});

export const MoveSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  /** physical: sem custo de KI por convenção; ki: técnica de energia. Ambas causam dano. */
  category: z.enum(['physical', 'ki']),
  power: z.number().int().positive(),
  kiCost: z.number().int().nonnegative(),
  accuracy: z.number().int().min(1).max(100),
  target: z.enum(['enemy', 'all-enemies']),
});

/**
 * Transformação (ex.: Super Saiyajin). Enquanto ativa, multiplica ataque, defesa e velocidade
 * e drena KI a cada turno; quando o KI zera, o lutador volta ao normal.
 */
export const TransformationSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  unlockLevel: z.number().int().min(1).max(MAX_LEVEL),
  multipliers: z.strictObject({
    attack: z.number().positive(),
    defense: z.number().positive(),
    speed: z.number().positive(),
  }),
  /** KI gasto ao se transformar. */
  activationKiCost: StatValue,
  /** KI drenado no fim de cada turno em que está transformado. */
  kiDrainPerTurn: StatValue,
});

export const CharacterSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Atributos no nível 1. */
  baseStats: StatsSchema,
  growth: GrowthSchema,
  /** Golpes aprendidos por nível. Precisa haver ao menos um no nível 1. */
  learnset: z
    .array(
      z.strictObject({
        level: z.number().int().min(1).max(MAX_LEVEL),
        moveId: IdSchema,
      }),
    )
    .min(1),
  transformations: z.array(TransformationSchema).default([]),
});

const ItemEffectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('heal-hp'), amount: z.number().int().positive() }),
  z.strictObject({ type: z.literal('heal-ki'), amount: z.number().int().positive() }),
  z.strictObject({ type: z.literal('full-restore') }),
]);

export const ItemSchema = z
  .strictObject({
    id: IdSchema,
    name: z.string().min(1),
    description: z.string(),
    kind: z.enum(['consumable', 'key']),
    effect: ItemEffectSchema.optional(),
  })
  .refine((item) => item.kind === 'key' || item.effect !== undefined, {
    message: 'itens consumíveis precisam de "effect"',
    path: ['effect'],
  });

export type Stats = z.infer<typeof StatsSchema>;
export type Growth = z.infer<typeof GrowthSchema>;
export type MoveDef = z.infer<typeof MoveSchema>;
export type CharacterDef = z.infer<typeof CharacterSchema>;
export type TransformationDef = z.infer<typeof TransformationSchema>;
export type ItemDef = z.infer<typeof ItemSchema>;
export type ItemEffect = z.infer<typeof ItemEffectSchema>;
