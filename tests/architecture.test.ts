import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regras de camada do projeto, verificadas automaticamente:
 *   - src/core e src/shared NÃO conhecem Phaser nem src/game;
 *   - src/core NÃO acessa APIs do navegador (window, localStorage, document).
 * Isso garante que a lógica de jogo é testável em Node e a camada visual é substituível.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const imports = (code: string) => [...code.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('fronteiras de arquitetura', () => {
  for (const layer of ['src/core', 'src/shared']) {
    it(`${layer} não importa Phaser nem src/game`, () => {
      for (const file of sourceFiles(layer)) {
        for (const target of imports(readFileSync(file, 'utf8'))) {
          expect(target, `${file} importa "${target}"`).not.toMatch(/^phaser$|^phaser\/|@\/game|\.\.\/game|\/game\//);
        }
      }
    });
  }

  it('src/core não usa window, document nem localStorage', () => {
    for (const file of sourceFiles('src/core')) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\b(window|document|localStorage|sessionStorage)\b/);
    }
  });
});
