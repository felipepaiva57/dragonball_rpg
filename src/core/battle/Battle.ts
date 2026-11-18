import type { DataRegistry } from '@/core/data/DataRegistry';
import type { ItemDef, ItemEffect, MoveDef } from '@/core/data/schemas';
import { err, ok, type Result } from '@/shared/Result';
import type { Rng } from '@/shared/random';
import type { DeepReadonly } from '@/shared/types';
import { createCombatant, effectiveStats, isFainted } from './combatant';
import { DEFAULT_RULES, type BattleRules } from './rules';
import {
  SIDE_IDS,
  opponentOf,
  slotKey,
  type BattleAction,
  type BattleEvent,
  type BattleOutcome,
  type BattlePhase,
  type BattleSetup,
  type BattleSide,
  type BattleState,
  type Combatant,
  type SideId,
  type SideSetup,
  type SlotRef,
} from './types';

export interface BattleDeps {
  data: DataRegistry;
  rng: Rng;
  rules?: Partial<BattleRules>;
}

/**
 * Prioridade de resolução dentro do turno (maior age antes); empate → velocidade
 * efetiva; novo empate → sorteio. Trocar e usar item acontecem antes dos golpes,
 * e defender antes dos golpes para a guarda valer no mesmo turno.
 */
const PRIORITY: Record<BattleAction['type'], number> = {
  switch: 4,
  item: 3,
  transform: 2,
  revert: 2,
  defend: 1,
  charge: 0,
  move: 0,
};

/**
 * Motor de combate puro: sem Phaser, sem relógio, sem Math.random (usa o Rng injetado).
 *
 * Ciclo de uso (igual para a tela, para a IA e para as simulações):
 *   1. `actors()` diz quem precisa agir; `legalActions(ref)` lista as opções de cada um;
 *   2. `submitTurn(actions)` resolve o turno inteiro e devolve os eventos;
 *   3. se `phase === 'awaiting-replacement'`, resolver com `replace()`/`autoReplace()`;
 *   4. repetir até `phase === 'finished'`, então `outcome()`.
 */
export class Battle {
  readonly data: DataRegistry;
  private readonly rng: Rng;
  private readonly rules: BattleRules;
  private readonly s: BattleState;

  private constructor(data: DataRegistry, rng: Rng, rules: BattleRules, state: BattleState) {
    this.data = data;
    this.rng = rng;
    this.rules = rules;
    this.s = state;
  }

  static create(setup: BattleSetup, deps: BattleDeps): Battle {
    const sides = {} as Record<SideId, BattleSide>;
    for (const id of SIDE_IDS) sides[id] = buildSide(id, setup[id], deps.data);
    const rules: BattleRules = { ...DEFAULT_RULES, ...deps.rules };
    return new Battle(deps.data, deps.rng, rules, { turn: 1, phase: 'awaiting-actions', winner: null, sides });
  }

  // ------------------------------------------------------------------ consulta

  get state(): DeepReadonly<BattleState> {
    return this.s;
  }
  get phase(): BattlePhase {
    return this.s.phase;
  }
  get turn(): number {
    return this.s.turn;
  }
  get winner(): SideId | null {
    return this.s.winner;
  }

  combatantAt(ref: SlotRef): DeepReadonly<Combatant> | undefined {
    return this.at(ref);
  }

  /** Atributos efetivos (com transformação) de quem está no slot. */
  statsAt(ref: SlotRef) {
    const c = this.at(ref);
    return c ? effectiveStats(this.data, c) : undefined;
  }

  /** Slots que precisam de uma ação neste turno (lutadores em campo e de pé). */
  actors(): SlotRef[] {
    if (this.s.phase !== 'awaiting-actions') return [];
    return this.aliveSlots('player').concat(this.aliveSlots('enemy'));
  }

  /**
   * Tudo o que o lutador do slot pode fazer agora. É a fonte única para menus da UI, IA e validação.
   *
   * Com mais de um lutador em campo, passe em `queued` as ações que os COLEGAS já escolheram neste
   * turno: itens já reservados e reservas já escalados deixam de aparecer, de modo que escolhas
   * feitas em sequência nunca formem um turno inválido.
   */
  legalActions(ref: SlotRef, queued: readonly BattleAction[] = []): BattleAction[] {
    const actor = this.at(ref);
    if (!actor || isFainted(actor) || this.s.phase !== 'awaiting-actions') return [];

    const others = queued.filter((a) => a.actor.side === ref.side && a.actor.slot !== ref.slot);
    const reservedItems = new Map<string, number>();
    const reservedBench = new Set<number>();
    for (const a of others) {
      if (a.type === 'item') reservedItems.set(a.itemId, (reservedItems.get(a.itemId) ?? 0) + 1);
      if (a.type === 'switch') reservedBench.add(a.toIndex);
    }

    const out: BattleAction[] = [];
    const side = this.s.sides[ref.side];
    const foes = this.aliveSlots(opponentOf(ref.side));

    for (const moveId of actor.knownMoves) {
      const move = this.data.moves.require(moveId);
      if (move.kiCost > actor.ki || foes.length === 0) continue;
      if (move.target === 'all-enemies') {
        out.push({ type: 'move', actor: ref, moveId, target: foes[0]! });
      } else {
        for (const target of foes) out.push({ type: 'move', actor: ref, moveId, target });
      }
    }

    out.push({ type: 'defend', actor: ref });
    if (actor.ki < actor.stats.ki) out.push({ type: 'charge', actor: ref });

    for (const [itemId, count] of Object.entries(side.inventory)) {
      const item = this.data.items.find(itemId);
      if (count - (reservedItems.get(itemId) ?? 0) <= 0 || !item || item.kind !== 'consumable' || !item.effect) continue;
      side.roster.forEach((member, targetIndex) => {
        if (!isFainted(member) && itemHelps(item.effect!, member)) {
          out.push({ type: 'item', actor: ref, itemId, targetIndex });
        }
      });
    }

    side.roster.forEach((member, toIndex) => {
      if (!side.active.includes(toIndex) && !isFainted(member) && !reservedBench.has(toIndex)) {
        out.push({ type: 'switch', actor: ref, toIndex });
      }
    });

    if (actor.transformationId === null) {
      const def = this.data.characters.require(actor.characterId);
      for (const t of def.transformations) {
        if (actor.level >= t.unlockLevel && actor.ki >= t.activationKiCost) {
          out.push({ type: 'transform', actor: ref, transformationId: t.id });
        }
      }
    } else {
      out.push({ type: 'revert', actor: ref });
    }
    return out;
  }

  validate(action: BattleAction): Result<true, string> {
    const actor = this.at(action.actor);
    if (!actor) return err(`slot ${slotKey(action.actor)} vazio`);
    if (isFainted(actor)) return err(`${actor.name} está fora de combate`);
    const key = this.actionKey(action);
    if (this.legalActions(action.actor).some((legal) => this.actionKey(legal) === key)) return ok(true);
    return err(`ação "${action.type}" não permitida para ${actor.name} agora`);
  }

  // ------------------------------------------------------------------ turno

  /**
   * Resolve um turno completo. Exige exatamente uma ação por lutador em campo.
   * Se alguma ação for inválida nada é alterado (validação antes de executar).
   */
  submitTurn(actions: readonly BattleAction[]): Result<BattleEvent[], string> {
    if (this.s.phase !== 'awaiting-actions') return err(`não é possível agir na fase "${this.s.phase}"`);

    const required = new Set(this.actors().map(slotKey));
    const given = new Set<string>();
    const switchTargets = new Set<string>();
    const itemUses = new Map<string, number>();

    for (const action of actions) {
      const key = slotKey(action.actor);
      if (!required.has(key)) return err(`${key} não deve agir neste turno`);
      if (given.has(key)) return err(`${key} enviou mais de uma ação`);
      given.add(key);

      const valid = this.validate(action);
      if (!valid.ok) return valid;

      if (action.type === 'switch') {
        const k = `${action.actor.side}:${action.toIndex}`;
        if (switchTargets.has(k)) return err('dois lutadores não podem trocar pelo mesmo reserva');
        switchTargets.add(k);
      }
      if (action.type === 'item') {
        const k = `${action.actor.side}:${action.itemId}`;
        const used = (itemUses.get(k) ?? 0) + 1;
        itemUses.set(k, used);
        if (used > (this.s.sides[action.actor.side].inventory[action.itemId] ?? 0)) {
          return err(`itens insuficientes: ${action.itemId}`);
        }
      }
    }
    if (given.size !== required.size) return err('faltam ações de lutadores em campo');

    const events: BattleEvent[] = [{ type: 'turn-start', turn: this.s.turn }];

    // Ordena a entrada primeiro para o resultado não depender da ordem em que o chamador enviou.
    const queue = [...actions]
      .sort((a, b) => slotKey(a.actor).localeCompare(slotKey(b.actor)))
      .map((action) => ({
        action,
        priority: PRIORITY[action.type],
        speed: this.statsAt(action.actor)!.speed,
        tiebreak: this.rng.next(),
      }))
      .sort((a, b) => b.priority - a.priority || b.speed - a.speed || b.tiebreak - a.tiebreak);

    for (const { action } of queue) {
      this.execute(action, events);
      if (this.checkVictory(events)) break;
    }

    // Lido pelo getter: checkVictory() pode ter mudado a fase durante o turno.
    if (this.phase !== 'finished') {
      this.endOfRound(events);
      this.s.phase = this.pendingReplacements().length > 0 ? 'awaiting-replacement' : 'awaiting-actions';
    }
    this.s.turn += 1;
    return ok(events);
  }

  // ------------------------------------------------------------------ substituição após KO

  /** Slots com lutador caído que têm reserva viva para entrar. */
  pendingReplacements(): SlotRef[] {
    const out: SlotRef[] = [];
    for (const sideId of SIDE_IDS) {
      const side = this.s.sides[sideId];
      const hasBench = side.roster.some((m, i) => !side.active.includes(i) && !isFainted(m));
      if (!hasBench) continue;
      side.active.forEach((rosterIndex, slot) => {
        if (isFainted(side.roster[rosterIndex]!)) out.push({ side: sideId, slot });
      });
    }
    return out;
  }

  replace(side: SideId, slot: number, toIndex: number): Result<BattleEvent[], string> {
    if (this.s.phase !== 'awaiting-replacement') return err('nenhuma substituição pendente');
    if (!this.pendingReplacements().some((r) => r.side === side && r.slot === slot)) {
      return err(`slot ${slot} de ${side} não precisa de substituto`);
    }
    const s = this.s.sides[side];
    const incoming = s.roster[toIndex];
    if (!incoming || isFainted(incoming) || s.active.includes(toIndex)) return err('substituto inválido');

    const outgoing = s.roster[s.active[slot]!]!;
    s.active[slot] = toIndex;
    const events: BattleEvent[] = [
      { type: 'switch', side, slot, from: outgoing.uid, to: incoming.uid, reason: 'fainted' },
    ];
    if (this.pendingReplacements().length === 0) this.s.phase = 'awaiting-actions';
    return ok(events);
  }

  /** Para lados controlados pela IA: coloca o primeiro reserva vivo em cada slot caído. */
  autoReplace(side: SideId): BattleEvent[] {
    const events: BattleEvent[] = [];
    for (const pending of this.pendingReplacements().filter((r) => r.side === side)) {
      const s = this.s.sides[side];
      const toIndex = s.roster.findIndex((m, i) => !s.active.includes(i) && !isFainted(m));
      if (toIndex < 0) break;
      const result = this.replace(side, pending.slot, toIndex);
      if (result.ok) events.push(...result.value);
    }
    return events;
  }

  outcome(): BattleOutcome | null {
    if (this.s.phase !== 'finished' || this.s.winner === null) return null;
    const side = (id: SideId) => ({
      members: this.s.sides[id].roster.map((c) => ({
        uid: c.uid,
        characterId: c.characterId,
        level: c.level,
        hp: c.hp,
        ki: c.ki,
      })),
      inventory: { ...this.s.sides[id].inventory },
    });
    return { winner: this.s.winner, turns: this.s.turn - 1, sides: { player: side('player'), enemy: side('enemy') } };
  }

  // ------------------------------------------------------------------ execução das ações

  private execute(action: BattleAction, ev: BattleEvent[]): void {
    const actor = this.at(action.actor);
    if (!actor || isFainted(actor)) return; // foi derrubado antes de agir neste turno

    switch (action.type) {
      case 'move':
        return this.doMove(action, actor, ev);
      case 'defend':
        actor.guarding = true;
        ev.push({ type: 'defend', actor: actor.uid });
        return;
      case 'charge': {
        const gain = percentOf(actor.stats.ki, this.rules.chargeKiPercent);
        this.changeKi(actor, gain, 'charge', ev);
        return;
      }
      case 'item':
        return this.doItem(action, actor, ev);
      case 'switch':
        return this.doSwitch(action, actor, ev);
      case 'transform': {
        const form = this.data.characters.require(actor.characterId).transformations.find((t) => t.id === action.transformationId);
        if (!form || actor.ki < form.activationKiCost) {
          ev.push({ type: 'action-failed', actor: actor.uid, reason: 'no-ki' });
          return;
        }
        this.changeKi(actor, -form.activationKiCost, 'transform-cost', ev);
        actor.transformationId = form.id;
        ev.push({ type: 'transform', actor: actor.uid, transformationId: form.id });
        return;
      }
      case 'revert':
        this.revert(actor, 'chosen', ev);
        return;
    }
  }

  private doMove(action: Extract<BattleAction, { type: 'move' }>, actor: Combatant, ev: BattleEvent[]): void {
    const move = this.data.moves.require(action.moveId);
    if (actor.ki < move.kiCost) {
      ev.push({ type: 'action-failed', actor: actor.uid, reason: 'no-ki' });
      return;
    }
    const targets = this.resolveTargets(action, move);
    if (targets.length === 0) {
      ev.push({ type: 'action-failed', actor: actor.uid, reason: 'no-target' });
      return;
    }

    if (move.kiCost > 0) this.changeKi(actor, -move.kiCost, 'move-cost', ev);
    ev.push({ type: 'move-used', actor: actor.uid, moveId: move.id });

    for (const target of targets) {
      if (this.rng.next() * 100 >= move.accuracy) {
        ev.push({ type: 'miss', actor: actor.uid, target: target.uid, moveId: move.id });
        continue;
      }
      const guarded = target.guarding;
      const amount = this.computeDamage(actor, target, move, guarded);
      target.hp = Math.max(0, target.hp - amount);
      ev.push({ type: 'damage', actor: actor.uid, target: target.uid, moveId: move.id, amount, hp: target.hp, guarded });
      if (isFainted(target)) {
        target.guarding = false;
        if (target.transformationId !== null) this.revert(target, 'fainted', ev);
        ev.push({ type: 'faint', target: target.uid });
      }
    }
  }

  private computeDamage(attacker: Combatant, defender: Combatant, move: MoveDef, guarded: boolean): number {
    const { min, max } = this.rules.damageVariance;
    const base = this.rules.damageFormula({
      attackerLevel: attacker.level,
      power: move.power,
      attack: effectiveStats(this.data, attacker).attack,
      defense: effectiveStats(this.data, defender).defense,
    });
    const variance = min + (max - min) * this.rng.next();
    const guard = guarded ? this.rules.guardDamageMultiplier : 1;
    return Math.max(this.rules.minDamage, Math.floor(base * variance * guard));
  }

  /** Se o alvo escolhido já caiu neste turno, redireciona para outro inimigo vivo em campo. */
  private resolveTargets(action: Extract<BattleAction, { type: 'move' }>, move: MoveDef): Combatant[] {
    const foeSide = opponentOf(action.actor.side);
    const alive = this.aliveSlots(foeSide).map((ref) => this.at(ref)!);
    if (move.target === 'all-enemies') return alive;
    const chosen = this.at(action.target);
    if (chosen && !isFainted(chosen) && action.target.side === foeSide) return [chosen];
    return alive.slice(0, 1);
  }

  private doItem(action: Extract<BattleAction, { type: 'item' }>, actor: Combatant, ev: BattleEvent[]): void {
    const side = this.s.sides[action.actor.side];
    const item = this.data.items.require(action.itemId);
    const target = side.roster[action.targetIndex];
    if (!target || isFainted(target)) {
      ev.push({ type: 'action-failed', actor: actor.uid, reason: 'target-fainted' });
      return;
    }
    if (!item.effect || !itemHelps(item.effect, target) || (side.inventory[item.id] ?? 0) <= 0) {
      ev.push({ type: 'action-failed', actor: actor.uid, reason: 'no-effect' });
      return;
    }

    const remaining = (side.inventory[item.id] ?? 0) - 1;
    if (remaining === 0) delete side.inventory[item.id];
    else side.inventory[item.id] = remaining;
    ev.push({ type: 'item-used', actor: actor.uid, itemId: item.id, target: target.uid });

    const effect = item.effect;
    const healsHp = effect.type === 'heal-hp' || effect.type === 'full-restore';
    const healsKi = effect.type === 'heal-ki' || effect.type === 'full-restore';
    if (healsHp) {
      const amount = effect.type === 'heal-hp' ? effect.amount : target.stats.hp;
      const restored = Math.min(amount, target.stats.hp - target.hp);
      if (restored > 0) {
        target.hp += restored;
        ev.push({ type: 'hp-restored', target: target.uid, amount: restored, hp: target.hp });
      }
    }
    if (healsKi) {
      const amount = effect.type === 'heal-ki' ? effect.amount : target.stats.ki;
      this.changeKi(target, amount, 'item', ev);
    }
  }

  private doSwitch(action: Extract<BattleAction, { type: 'switch' }>, actor: Combatant, ev: BattleEvent[]): void {
    const side = this.s.sides[action.actor.side];
    const incoming = side.roster[action.toIndex];
    if (!incoming || isFainted(incoming) || side.active.includes(action.toIndex)) return;
    if (actor.transformationId !== null) this.revert(actor, 'switched', ev);
    actor.guarding = false;
    side.active[action.actor.slot] = action.toIndex;
    ev.push({ type: 'switch', side: action.actor.side, slot: action.actor.slot, from: actor.uid, to: incoming.uid, reason: 'chosen' });
  }

  // ------------------------------------------------------------------ fim de turno

  private endOfRound(ev: BattleEvent[]): void {
    for (const sideId of SIDE_IDS) {
      const side = this.s.sides[sideId];
      for (const c of side.roster) c.guarding = false;

      for (const rosterIndex of side.active) {
        const c = side.roster[rosterIndex]!;
        if (isFainted(c)) continue;

        this.changeKi(c, percentOf(c.stats.ki, this.rules.kiRegenPercent), 'regen', ev);

        if (c.transformationId !== null) {
          const form = this.data.characters.require(c.characterId).transformations.find((t) => t.id === c.transformationId);
          if (form && form.kiDrainPerTurn > 0) {
            this.changeKi(c, -form.kiDrainPerTurn, 'drain', ev);
            if (c.ki === 0) this.revert(c, 'out-of-ki', ev);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ auxiliares

  /** Altera o KI respeitando [0, máximo]; só emite evento se algo mudou. */
  private changeKi(c: Combatant, delta: number, reason: Extract<BattleEvent, { type: 'ki-changed' }>['reason'], ev: BattleEvent[]): void {
    const next = Math.min(c.stats.ki, Math.max(0, c.ki + delta));
    const applied = next - c.ki;
    if (applied === 0) return;
    c.ki = next;
    ev.push({ type: 'ki-changed', target: c.uid, delta: applied, ki: c.ki, reason });
  }

  private revert(c: Combatant, reason: Extract<BattleEvent, { type: 'revert' }>['reason'], ev: BattleEvent[]): void {
    if (c.transformationId === null) return;
    c.transformationId = null;
    ev.push({ type: 'revert', actor: c.uid, reason });
  }

  private checkVictory(ev: BattleEvent[]): boolean {
    if (this.s.phase === 'finished') return true;
    for (const sideId of SIDE_IDS) {
      if (this.s.sides[sideId].roster.every(isFainted)) {
        this.s.phase = 'finished';
        this.s.winner = opponentOf(sideId);
        ev.push({ type: 'battle-end', winner: this.s.winner });
        return true;
      }
    }
    return false;
  }

  private at(ref: SlotRef): Combatant | undefined {
    const side = this.s.sides[ref.side];
    const index = side.active[ref.slot];
    return index === undefined ? undefined : side.roster[index];
  }

  private aliveSlots(sideId: SideId): SlotRef[] {
    const out: SlotRef[] = [];
    this.s.sides[sideId].active.forEach((_, slot) => {
      const c = this.at({ side: sideId, slot });
      if (c && !isFainted(c)) out.push({ side: sideId, slot });
    });
    return out;
  }

  /** Identidade de uma ação para comparar com as legais (golpes em área ignoram o alvo). */
  private actionKey(a: BattleAction): string {
    const who = slotKey(a.actor);
    switch (a.type) {
      case 'move': {
        const area = this.data.moves.find(a.moveId)?.target === 'all-enemies';
        return `move|${who}|${a.moveId}|${area ? '*' : slotKey(a.target)}`;
      }
      case 'item':
        return `item|${who}|${a.itemId}|${a.targetIndex}`;
      case 'switch':
        return `switch|${who}|${a.toIndex}`;
      case 'transform':
        return `transform|${who}|${a.transformationId}`;
      default:
        return `${a.type}|${who}`;
    }
  }
}

function buildSide(id: SideId, setup: SideSetup, data: DataRegistry): BattleSide {
  if (setup.members.length === 0) throw new Error(`lado "${id}" sem combatentes`);
  const roster = setup.members.map((seed, i) => createCombatant(data, seed, `${id}:${i}:${seed.characterId}`));
  const alive = roster.flatMap((c, i) => (isFainted(c) ? [] : [i]));
  if (alive.length === 0) throw new Error(`lado "${id}" sem nenhum combatente de pé`);

  const inventory: Record<string, number> = {};
  for (const [itemId, qty] of Object.entries(setup.inventory ?? {})) {
    data.items.require(itemId);
    if (qty > 0) inventory[itemId] = qty;
  }
  const count = Math.min(Math.max(1, setup.activeCount ?? 1), alive.length);
  return { id, roster, active: alive.slice(0, count), inventory };
}

const percentOf = (max: number, fraction: number): number => Math.max(1, Math.floor(max * fraction));

function itemHelps(effect: ItemEffect, c: Pick<Combatant, 'hp' | 'ki' | 'stats'>): boolean {
  const missingHp = c.stats.hp - c.hp;
  const missingKi = c.stats.ki - c.ki;
  switch (effect.type) {
    case 'heal-hp':
      return missingHp > 0;
    case 'heal-ki':
      return missingKi > 0;
    case 'full-restore':
      return missingHp > 0 || missingKi > 0;
  }
}

export type { ItemDef };
