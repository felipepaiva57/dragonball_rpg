/** Resolução interna: proporção do GBA (a do Pokémon FireRed), tiles de 16×16 → 15×10 tiles na tela. */
export const GAME_WIDTH = 240;
export const GAME_HEIGHT = 160;
export const TILE_SIZE = 16;

/** Maior escala INTEIRA que cabe na janela (pixels nítidos, sem distorção). */
export function computeIntegerZoom(windowWidth: number, windowHeight: number): number {
  return Math.max(1, Math.floor(Math.min(windowWidth / GAME_WIDTH, windowHeight / GAME_HEIGHT)));
}
