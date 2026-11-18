import { DataRegistry, type RawGameData } from '@/core/data/DataRegistry';

/**
 * ÚNICO arquivo que sabe de onde os dados vêm (arquivos JSON empacotados pelo Vite).
 * Adicionar um personagem/golpe/item = criar um .json na pasta certa; nenhum
 * código muda. Para uma campanha alternativa, bastará outra pasta de dados
 * passada ao mesmo DataRegistry.build.
 */
const files = import.meta.glob('./{characters,moves,items}/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

export function loadRawGameData(): RawGameData {
  const raw: RawGameData = { characters: [], moves: [], items: [] };

  for (const [path, data] of Object.entries(files)) {
    // path no formato "./characters/goku-kid.json"
    const folder = path.split('/')[1];
    if (folder !== 'characters' && folder !== 'moves' && folder !== 'items') continue;
    raw[folder].push({ source: `src/data/${path.slice(2)}`, data });
  }
  return raw;
}

/** Carrega e valida todos os dados. Lança DataValidationError listando todos os problemas. */
export function loadGameData(): DataRegistry {
  return DataRegistry.build(loadRawGameData());
}
