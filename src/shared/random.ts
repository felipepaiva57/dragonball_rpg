/**
 * Aleatoriedade injetável. O core nunca chama Math.random direto: recebe um Rng.
 * Em produção usa-se mathRng; em testes e simulações, um Rng com semente,
 * o que torna qualquer batalha reproduzível (mesma semente = mesmo resultado).
 */
export interface Rng {
  /** Número em [0, 1). */
  next(): number;
}

export const mathRng: Rng = { next: () => Math.random() };

/** mulberry32: pequeno, rápido e de qualidade suficiente para jogos. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Escolhe um item com probabilidade proporcional ao peso. Pesos ≤ 0 nunca são escolhidos (exceto se todos forem). */
export function pickWeighted<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  if (items.length === 0) throw new Error('pickWeighted: lista vazia');
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return items[Math.floor(rng.next() * items.length)]!;
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= Math.max(0, weights[i] ?? 0);
    if (roll < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
