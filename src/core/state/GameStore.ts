import type { EventBus } from '@/shared/EventBus';
import type { FlagValue, GameEvents } from '@/shared/events';
import type { DeepReadonly } from '@/shared/types';
import type { GameState, PartyMember } from './schemas';

/**
 * Dono do estado vivo da partida. Todas as mudanças passam por aqui,
 * para que cada uma emita o evento correspondente e o resto do jogo
 * (interface, história) possa reagir sem acoplamento.
 *
 * Os métodos de mutação crescem conforme as fases pedem (XP na Fase 4,
 * posição no mapa na Fase 3...). Hoje: flags, inventário e equipe.
 */
export class GameStore {
  private state: GameState;

  constructor(
    initial: GameState,
    private readonly events: EventBus<GameEvents>,
  ) {
    this.state = clone(initial);
  }

  /** Visão somente leitura do estado vivo (não copia; não guarde a referência entre frames). */
  get view(): DeepReadonly<GameState> {
    return this.state;
  }

  /** Cópia profunda e independente, própria para salvar. */
  snapshot(): GameState {
    return clone(this.state);
  }

  // ---- flags de história ----

  getFlag(key: string): FlagValue | undefined {
    return this.state.story.flags[key];
  }

  setFlag(key: string, value: FlagValue): void {
    const previous = this.state.story.flags[key];
    if (previous === value) return;
    this.state.story.flags[key] = value;
    this.events.emit('flag:changed', { key, value, previous });
  }

  // ---- inventário ----

  getItemCount(itemId: string): number {
    return this.state.inventory[itemId] ?? 0;
  }

  addItem(itemId: string, quantity = 1): void {
    assertPositiveInt(quantity);
    const total = this.getItemCount(itemId) + quantity;
    this.state.inventory[itemId] = total;
    this.events.emit('inventory:changed', { itemId, quantity: total });
  }

  /** Remove se houver quantidade suficiente. Devolve false (sem alterar nada) caso contrário. */
  removeItem(itemId: string, quantity = 1): boolean {
    assertPositiveInt(quantity);
    const current = this.getItemCount(itemId);
    if (current < quantity) return false;
    const remaining = current - quantity;
    if (remaining === 0) delete this.state.inventory[itemId];
    else this.state.inventory[itemId] = remaining;
    this.events.emit('inventory:changed', { itemId, quantity: remaining });
    return true;
  }

  // ---- equipe ----

  addPartyMember(member: PartyMember): void {
    if (this.state.party.some((m) => m.characterId === member.characterId)) {
      throw new Error(`"${member.characterId}" já está na equipe`);
    }
    this.state.party.push(clone(member));
    this.events.emit('party:changed', { characterId: member.characterId });
  }

  /** Atualiza HP/KI atuais de um membro (ex.: ao fim de uma batalha). */
  updatePartyVitals(characterId: string, vitals: { currentHp: number; currentKi: number }): void {
    const member = this.state.party.find((m) => m.characterId === characterId);
    if (!member) throw new Error(`"${characterId}" não está na equipe`);
    for (const value of [vitals.currentHp, vitals.currentKi]) {
      if (!Number.isInteger(value) || value < 0) throw new RangeError(`valor inválido: ${value}`);
    }
    member.currentHp = vitals.currentHp;
    member.currentKi = vitals.currentKi;
    this.events.emit('party:changed', { characterId });
  }

  // ---- tempo de jogo ----

  addPlayTime(ms: number): void {
    if (ms > 0) this.state.meta.playTimeMs += Math.floor(ms);
  }
}

function assertPositiveInt(n: number): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`quantidade deve ser inteiro positivo (recebido: ${n})`);
  }
}

/** O estado é só JSON (garantido pelo schema), então JSON basta para copiar. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
