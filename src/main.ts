import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/game/config';
import { createContext, provideContext } from '@/game/context';
import { BootScene } from '@/game/scenes/BootScene';
import { DuelScene } from '@/game/scenes/DuelScene';
import './style.css';

try {
  const ctx = createContext();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'arena',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#362343',
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE },
    scene: [BootScene, DuelScene],
    callbacks: { preBoot: (game) => provideContext(game, ctx) },
  });
} catch (error) {
  const status = document.querySelector('#loading');
  if (status) status.textContent = error instanceof Error ? error.message : String(error);
  throw error;
}
