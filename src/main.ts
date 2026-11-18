import Phaser from 'phaser';
import { DataValidationError } from '@/core/data/DataRegistry';
import { computeIntegerZoom, GAME_HEIGHT, GAME_WIDTH } from '@/game/config';
import { createContext, provideContext } from '@/game/context';
import { BootScene } from '@/game/scenes/BootScene';

/** Composition root: monta o contexto (core) e entrega ao Phaser (apresentação). */
function start(): void {
  const ctx = createContext();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#000000',
    pixelArt: true, // sem suavização; também liga roundPixels
    scale: {
      mode: Phaser.Scale.NONE, // o zoom inteiro é calculado por nós
      zoom: computeIntegerZoom(window.innerWidth, window.innerHeight),
    },
    scene: [BootScene],
    // preBoot roda antes de qualquer cena iniciar: o contexto já está disponível em create().
    callbacks: { preBoot: (g) => provideContext(g, ctx) },
  });

  window.addEventListener('resize', () => {
    game.scale.setZoom(computeIntegerZoom(window.innerWidth, window.innerHeight));
  });
}

try {
  start();
} catch (error) {
  // Erro de dados/inicialização: mostra na tela em vez de deixar uma página em branco.
  const message = error instanceof DataValidationError ? error.message : String(error);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#ff8080;padding:16px;white-space:pre-wrap;font:14px monospace';
  pre.textContent = message;
  document.body.replaceChildren(pre);
  throw error;
}
