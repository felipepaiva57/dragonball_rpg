import type { Combatant, SideId } from '@/core/battle/types';
import type { DeepReadonly } from '@/shared/types';
import type { DuelCommand } from './duel';

type Stat = 'hp' | 'ki';

export class DuelPanel {
  private readonly title = document.querySelector<HTMLHeadingElement>('#panel-title')!;
  private readonly description = document.querySelector<HTMLParagraphElement>('#panel-description')!;
  private readonly start = document.querySelector<HTMLButtonElement>('#start-duel')!;
  private readonly commands = document.querySelector<HTMLElement>('#commands')!;
  private readonly moves = document.querySelector<HTMLElement>('#moves')!;
  private readonly tactics = document.querySelector<HTMLElement>('#tactics')!;
  private readonly turn = document.querySelector<HTMLElement>('#turn-label')!;
  private readonly log = document.querySelector<HTMLOListElement>('#battle-log')!;
  private readonly hud = {
    player: document.querySelector<HTMLElement>('#player-hud')!,
    enemy: document.querySelector<HTMLElement>('#enemy-hud')!,
  };

  constructor(start: () => void) {
    this.start.onclick = start;
    this.start.disabled = false;
    document.querySelector<HTMLElement>('#loading')!.hidden = true;
    document.querySelector<HTMLElement>('#fighters-hud')!.hidden = false;
    document.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    this.start.onclick = null;
    document.removeEventListener('keydown', this.onKey);
  }

  setFighter(side: SideId, fighter: DeepReadonly<Combatant>): void {
    this.hud[side].querySelector('[data-stat="level"]')!.textContent = `Nv. ${fighter.level}`;
    this.setVital(side, 'hp', fighter.hp, fighter.stats.hp);
    this.setVital(side, 'ki', fighter.ki, fighter.stats.ki);
  }

  setVital(side: SideId, stat: Stat, value: number, max: number): void {
    const panel = this.hud[side];
    const bar = panel.querySelector<HTMLProgressElement>(`#${side}-${stat}`)!;
    bar.max = max;
    bar.value = value;
    bar.classList.toggle('low', stat === 'hp' && value / max <= 0.25);
    panel.querySelector(`[data-stat="${stat}"]`)!.textContent = `${value}/${max}`;
  }

  showTurn(turn: number, menu: { moves: DuelCommand[]; tactics: DuelCommand[] }, select: (cmd: DuelCommand) => void): void {
    const previous = this.commands.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.commandId
      : undefined;

    this.turn.textContent = `Turno ${String(turn).padStart(2, '0')}`;
    this.title.textContent = 'Escolha sua ação';
    this.description.textContent = 'Use os botões ou as teclas 1–6.';
    this.start.hidden = true;
    this.commands.hidden = false;
    this.moves.replaceChildren(...menu.moves.map((cmd, index) => this.makeButton(cmd, index + 1, select)));
    this.tactics.replaceChildren(...menu.tactics.map((cmd, index) => this.makeButton(cmd, menu.moves.length + index + 1, select)));
    if (previous) {
      const buttons = Array.from(this.commands.querySelectorAll('button'));
      buttons.find((button) => button.dataset.commandId === previous)?.focus({ preventScroll: true });
    }
  }

  lock(): void {
    this.title.textContent = 'Turno em andamento';
    this.description.textContent = 'Aguarde a resolução das ações.';
    for (const button of this.commands.querySelectorAll('button')) {
      button.setAttribute('aria-disabled', 'true');
    }
  }

  showResult(winner: SideId, turns: number): void {
    this.turn.textContent = 'Batalha encerrada';
    this.title.textContent = winner === 'player' ? 'Vitória!' : 'Derrota';
    const duration = turns === 1 ? '1 turno' : `${turns} turnos`;
    this.description.textContent = winner === 'player'
      ? `Goku venceu o duelo em ${duration}.`
      : `Yamcha venceu o duelo em ${duration}.`;
    this.commands.hidden = true;
    this.start.textContent = 'Revanche';
    this.start.hidden = false;
    this.title.focus({ preventScroll: true });
  }

  clearLog(): void {
    this.log.replaceChildren();
  }

  write(message: string): void {
    const entry = document.createElement('li');
    entry.textContent = message;
    this.log.append(entry);
    if (this.log.children.length > 4) this.log.firstElementChild?.remove();
  }

  private makeButton(cmd: DuelCommand, key: number, select: (cmd: DuelCommand) => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command';
    button.dataset.commandId = cmd.id;
    button.dataset.key = String(key);
    button.setAttribute('aria-keyshortcuts', String(key));
    button.setAttribute('aria-disabled', String(!cmd.action));

    const shortcut = document.createElement('kbd');
    shortcut.setAttribute('aria-hidden', 'true');
    shortcut.textContent = String(key);
    const label = document.createElement('span');
    label.textContent = cmd.label;
    const detail = document.createElement('span');
    detail.className = 'command-detail';
    detail.textContent = cmd.detail;
    button.append(shortcut, label, detail);
    button.onclick = () => {
      if (button.getAttribute('aria-disabled') === 'false') select(cmd);
    };
    return button;
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (this.commands.hidden || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const button = Array.from(this.commands.querySelectorAll('button')).find((el) => el.dataset.key === event.key);
    button?.click();
  };
}
