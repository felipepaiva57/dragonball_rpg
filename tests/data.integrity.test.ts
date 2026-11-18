import { describe, expect, it } from 'vitest';
import { loadGameData } from '@/data/loadData';
import { MAIN_CAMPAIGN_START } from '@/core/state/newGame';

/**
 * Valida os dados REAIS do jogo (src/data). Roda em `npm test` e,
 * isoladamente, em `npm run validate:data`. Se alguém quebrar um JSON,
 * o CI/teste aponta arquivo e campo.
 */
describe('dados reais do jogo', () => {
  it('carregam e passam em schema, unicidade e referências cruzadas', () => {
    const data = loadGameData();
    expect(data.characters.size).toBeGreaterThan(0);
    expect(data.moves.size).toBeGreaterThan(0);
    expect(data.items.size).toBeGreaterThan(0);
  });

  it('a configuração inicial da campanha principal aponta para dados existentes', () => {
    const data = loadGameData();
    for (const member of MAIN_CAMPAIGN_START.party) data.characters.require(member.characterId);
    for (const itemId of Object.keys(MAIN_CAMPAIGN_START.inventory ?? {})) data.items.require(itemId);
  });
});
