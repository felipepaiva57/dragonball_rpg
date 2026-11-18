import type { Stats } from '@/core/data/schemas';

/**
 * Tipos do motor de combate. Três ideias organizam tudo:
 *  - ESTADO (BattleState): o que existe agora na luta;
 *  - AÇÃO (BattleAction): o que um lutador decide fazer no turno;
 *  - EVENTO (BattleEvent): o que ACONTECEU ao resolver. A tela (Fase 2) apenas
 *    "toca" a lista de eventos como animação; ela nunca recalcula regras.
 */

export type SideId = 'player' | 'enemy';
export const SIDE_IDS: readonly SideId[] = ['player', 'enemy'];
export const opponentOf = (side: SideId): SideId => (side === 'player' ? 'enemy' : 'player');

/** Posição de campo: lado + índice do slot ativo (0 = primeiro lutador em campo). */
export interface SlotRef {
  side: SideId;
  slot: number;
}
export const slotKey = (ref: SlotRef): string => `${ref.side}#${ref.slot}`;

export interface Combatant {
  /** Único na batalha ("player:0:goku-kid"); permite dois inimigos do mesmo personagem. */
  uid: string;
  characterId: string;
  name: string;
  level: number;
  /** Atributos do nível, SEM transformação. Use effectiveStats() para o valor em combate. */
  stats: Stats;
  hp: number;
  ki: number;
  knownMoves: string[];
  transformationId: string | null;
  /** Defendendo neste turno (limpa no fim do turno). */
  guarding: boolean;
}

export interface BattleSide {
  id: SideId;
  /** Todos os lutadores do lado (em campo + reserva). */
  roster: Combatant[];
  /** active[slot] = índice no roster do lutador em campo naquele slot. */
  active: number[];
  inventory: Record<string, number>;
}

export type BattlePhase = 'awaiting-actions' | 'awaiting-replacement' | 'finished';

export interface BattleState {
  /** Turno atual (1, 2, ...). Depois de terminar, é o número do próximo turno que não ocorrerá. */
  turn: number;
  phase: BattlePhase;
  winner: SideId | null;
  sides: Record<SideId, BattleSide>;
}

// ---------- montagem ----------

export interface CombatantSeed {
  characterId: string;
  level: number;
  /** Se omitido: HP/KI máximos. */
  hp?: number;
  ki?: number;
  /** Se omitido: golpes do learnset até o nível. */
  knownMoves?: readonly string[];
}

export interface SideSetup {
  members: readonly CombatantSeed[];
  /** Quantos lutadores em campo ao mesmo tempo (padrão 1; 2+ para lutas em grupo). */
  activeCount?: number;
  inventory?: Readonly<Record<string, number>>;
}

export type BattleSetup = Record<SideId, SideSetup>;

// ---------- ações ----------

export type BattleAction =
  | { type: 'move'; actor: SlotRef; moveId: string; target: SlotRef }
  | { type: 'defend'; actor: SlotRef }
  /** "Concentrar": gasta o turno para recuperar KI. */
  | { type: 'charge'; actor: SlotRef }
  | { type: 'item'; actor: SlotRef; itemId: string; targetIndex: number }
  | { type: 'switch'; actor: SlotRef; toIndex: number }
  | { type: 'transform'; actor: SlotRef; transformationId: string }
  | { type: 'revert'; actor: SlotRef };

// ---------- eventos ----------

export type KiChangeReason = 'move-cost' | 'transform-cost' | 'regen' | 'charge' | 'drain' | 'item';
export type RevertReason = 'chosen' | 'out-of-ki' | 'fainted' | 'switched';
export type FailReason = 'no-ki' | 'no-target' | 'no-effect' | 'target-fainted';

export type BattleEvent =
  | { type: 'turn-start'; turn: number }
  | { type: 'defend'; actor: string }
  | { type: 'move-used'; actor: string; moveId: string }
  | { type: 'miss'; actor: string; target: string; moveId: string }
  | { type: 'damage'; actor: string; target: string; moveId: string; amount: number; hp: number; guarded: boolean }
  | { type: 'faint'; target: string }
  | { type: 'ki-changed'; target: string; delta: number; ki: number; reason: KiChangeReason }
  | { type: 'hp-restored'; target: string; amount: number; hp: number }
  | { type: 'item-used'; actor: string; itemId: string; target: string }
  | { type: 'switch'; side: SideId; slot: number; from: string; to: string; reason: 'chosen' | 'fainted' }
  | { type: 'transform'; actor: string; transformationId: string }
  | { type: 'revert'; actor: string; reason: RevertReason }
  | { type: 'action-failed'; actor: string; reason: FailReason }
  | { type: 'battle-end'; winner: SideId };

// ---------- resultado ----------

export interface OutcomeMember {
  uid: string;
  characterId: string;
  level: number;
  hp: number;
  ki: number;
}

export interface BattleOutcome {
  winner: SideId;
  /** Turnos efetivamente jogados. */
  turns: number;
  sides: Record<SideId, { members: OutcomeMember[]; inventory: Record<string, number> }>;
}
