import Phaser from 'phaser';
import { statsAtLevel } from '@/core/progression/stats';
import { GAME_WIDTH } from '../config';
import { getContext, MAIN_SLOT } from '../context';

const STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '8px',
  color: '#f4f4f4',
};

/**
 * Cena de diagnóstico da Fase 0: prova que dados, estado, save e eventos
 * estão ligados de ponta a ponta. Será substituída pela tela de título (Fase 2+).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const ctx = getContext(this);
    const { data, store, saves, events } = ctx;

    this.add.text(GAME_WIDTH / 2, 8, 'DRAGON BALL RPG', { ...STYLE, color: '#ffb000' }).setOrigin(0.5, 0);
    this.add.text(GAME_WIDTH / 2, 20, 'Fase 0 - Fundacao', STYLE).setOrigin(0.5, 0);

    this.add.text(8, 38, `Dados: ${data.characters.size} personagens, ${data.moves.size} golpes, ${data.items.size} itens`, STYLE);
    this.add.text(8, 50, ctx.loadedFromSave ? 'Estado: carregado do save' : 'Estado: jogo novo', STYLE);

    let y = 64;
    for (const member of store.view.party) {
      const def = data.characters.require(member.characterId);
      const max = statsAtLevel(def, member.level);
      this.add.text(8, y, `${def.name}  Nv${member.level}  HP ${member.currentHp}/${max.hp}  KI ${member.currentKi}/${max.ki}`, STYLE);
      y += 12;
    }

    if (ctx.loadError) {
      this.add.text(8, 100, `Save ilegivel (${ctx.loadError.code}).`, { ...STYLE, color: '#ff6060' });
      this.add.text(8, 110, 'Jogo novo em memoria; [S] sobrescreve.', { ...STYLE, color: '#ff6060' });
    } else if (!ctx.storagePersistent) {
      this.add.text(8, 100, 'Aviso: navegador sem localStorage.', { ...STYLE, color: '#ffb000' });
    }

    const status = this.add.text(8, 136, '', { ...STYLE, color: '#80ff80' });
    this.add.text(8, 148, '[S] salvar   [D] apagar save', { ...STYLE, color: '#9a9ab0' });

    const offSaved = events.on('save:written', () => status.setText('Salvo! Recarregue a pagina para testar.'));

    this.input.keyboard?.on('keydown-S', () => {
      const result = saves.save(MAIN_SLOT, store.snapshot());
      if (!result.ok) status.setText(`Erro ao salvar: ${result.error.code}`).setColor('#ff6060');
    });
    this.input.keyboard?.on('keydown-D', () => {
      saves.delete(MAIN_SLOT);
      status.setText('Save apagado.').setColor('#80ff80');
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offSaved);
  }
}
