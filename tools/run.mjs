// Executa um script TypeScript do projeto (com alias "@/" e import.meta.glob) usando o próprio Vite.
// Uso: node tools/run.mjs tools/simulate.ts
import { createServer } from 'vite';

const target = process.argv[2];
if (!target) {
  console.error('uso: node tools/run.mjs <arquivo.ts>');
  process.exit(1);
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  await server.ssrLoadModule('/' + target.replace(/^\.?\//, ''));
} finally {
  await server.close();
}
