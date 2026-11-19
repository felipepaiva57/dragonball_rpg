import Phaser from 'phaser';
import type { Battle } from '@/core/battle/Battle';
import { chooseAction } from '@/core/battle/ai';
import type { BattleEvent, SideId } from '@/core/battle/types';
import { mathRng } from '@/shared/random';
import { drawDesert } from '../battle/desert';
import { createDuel, duelCommands, PLAYER, RIVAL, type DuelCommand } from '../battle/duel';
import { DuelPanel } from '../battle/DuelPanel';
import { FighterSprite } from '../battle/FighterSprite';
import { getContext } from '../context';

const SIDES = [PLAYER, RIVAL];

export class DuelScene extends Phaser.Scene {
  private battle!: Battle;
  private panel!: DuelPanel;
  private sprites!: Record<SideId, FighterSprite>;
  private playing = false;

  constructor() {
    super('Duel');
  }

  create(): void {
    drawDesert(this);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sprites = {
      player: new FighterSprite(this, 64, 133, 'goku-kid', 1, reducedMotion),
      enemy: new FighterSprite(this, 177, 120, 'yamcha', -1, reducedMotion),
    };
    this.battle = createDuel(getContext(this).data);
    this.panel = new DuelPanel(() => this.startDuel());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.panel.destroy());
    this.syncHud();
    this.panel.write('O duelo começa quando você estiver pronto.');
  }

  private startDuel(): void {
    this.battle = createDuel(getContext(this).data);
    for (const fighter of Object.values(this.sprites)) fighter.reset();
    this.syncHud();
    this.panel.clearLog();
    this.panel.write('Yamcha entrou em combate.');
    this.showTurn();
    document.querySelector<HTMLButtonElement>('#moves button')?.focus({ preventScroll: true });
  }

  private showTurn(): void {
    this.sprites.player.pose('idle');
    this.sprites.enemy.pose('idle');
    this.panel.showTurn(this.battle.turn, duelCommands(this.battle), (cmd) => { void this.submit(cmd); });
  }

  private async submit(cmd: DuelCommand): Promise<void> {
    if (this.playing || !cmd.action || this.battle.phase !== 'awaiting-actions') return;
    this.playing = true;
    this.panel.lock();
    try {
      const result = this.battle.submitTurn([cmd.action, chooseAction(this.battle, RIVAL, mathRng)]);
      if (result.ok) {
        for (const event of result.value) await this.playEvent(event);
      } else {
        this.panel.write(result.error);
      }
    } finally {
      this.playing = false;
      this.syncHud();
      const outcome = this.battle.outcome();
      if (outcome) this.panel.showResult(outcome.winner, outcome.turns);
      else this.showTurn();
    }
  }

  private syncHud(): void {
    for (const slot of SIDES) {
      const fighter = this.battle.combatantAt(slot);
      if (fighter) this.panel.setFighter(slot.side, fighter);
    }
  }

  private fighter(uid: string) {
    for (const slot of SIDES) {
      const combatant = this.battle.combatantAt(slot);
      if (combatant?.uid === uid) {
        return {
          side: slot.side,
          name: slot.side === 'player' ? 'Goku' : combatant.name,
          stats: combatant.stats,
          sprite: this.sprites[slot.side],
        };
      }
    }
    throw new Error(`Lutador do duelo não encontrado: ${uid}`);
  }

  private async playEvent(event: BattleEvent): Promise<void> {
    switch (event.type) {
      case 'move-used': {
        const actor = this.fighter(event.actor);
        const move = this.battle.data.moves.require(event.moveId);
        this.panel.write(`${actor.name} usou ${move.name}.`);
        await actor.sprite.strike(move.id);
        break;
      }
      case 'miss':
        this.panel.write(`${this.fighter(event.actor).name} errou o golpe.`);
        break;
      case 'damage': {
        const target = this.fighter(event.target);
        this.panel.setVital(target.side, 'hp', event.hp, target.stats.hp);
        this.panel.write(`${target.name} perdeu ${event.amount} HP${event.guarded ? ' (defendeu)' : ''}.`);
        await target.sprite.hit(event.guarded);
        break;
      }
      case 'defend': {
        const actor = this.fighter(event.actor);
        actor.sprite.pose('defend');
        this.panel.write(`${actor.name} assumiu a guarda.`);
        await actor.sprite.pulse(0xaac3ef);
        break;
      }
      case 'ki-changed': {
        const target = this.fighter(event.target);
        this.panel.setVital(target.side, 'ki', event.ki, target.stats.ki);
        if (event.reason === 'charge') {
          this.panel.write(`${target.name} concentrou e recuperou ${event.delta} KI.`);
          await target.sprite.charge();
        }
        break;
      }
      case 'item-used': {
        const item = this.battle.data.items.require(event.itemId);
        const actor = this.fighter(event.actor);
        this.panel.write(`${actor.name} usou ${item.name}.`);
        await actor.sprite.useItem();
        break;
      }
      case 'hp-restored': {
        const target = this.fighter(event.target);
        this.panel.setVital(target.side, 'hp', event.hp, target.stats.hp);
        this.panel.write(`${target.name} recuperou ${event.amount} HP.`);
        await target.sprite.pulse(0x9ee6a4);
        break;
      }
      case 'faint': {
        const target = this.fighter(event.target);
        this.panel.write(`${target.name} ficou fora de combate.`);
        await target.sprite.faint();
        break;
      }
      case 'action-failed':
        this.panel.write(`${this.fighter(event.actor).name} não conseguiu agir.`);
        break;
    }
  }
}
