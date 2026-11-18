import Phaser from 'phaser';
import fighters from '../assets/fighters.png?url';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.spritesheet('fighters', fighters, { frameWidth: 64, frameHeight: 56 });
    this.load.on('loaderror', () => {
      const status = document.querySelector('#loading');
      if (status) status.textContent = 'Falha ao carregar os sprites. Recarregue a página.';
    });
  }

  create(): void {
    if (this.textures.exists('fighters')) this.scene.start('Duel');
  }
}
