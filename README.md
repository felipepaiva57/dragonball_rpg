# Dragon Ball RPG (web)

RPG 2D de turnos para navegador, pixel art, inspirado em Pokémon FireRed e nos RPGs clássicos.
Fã-game sem fins comerciais, com arte própria. Dragon Ball pertence a Toei, Shueisha e Bandai Namco.

**Stack:** TypeScript · Vite · Phaser 4 · Zod · Vitest

## Comandos

| Comando | O que faz |
|---|---|
| `npm install` | instala dependências |
| `npm run dev` | servidor de desenvolvimento (abra a URL exibida) |
| `npm test` | roda todos os testes |
| `npm run validate:data` | valida só os JSON de conteúdo (`src/data`) |
| `npm run simulate` | relatório de balanceamento: milhares de lutas com IA nos dois lados |
| `npm run typecheck` | checa tipos |
| `npm run build` | typecheck + build de produção em `dist/` |

## Arquitetura em camadas

```
src/
├─ shared/   utilitários sem dependência de jogo: EventBus, Result, tipos, catálogo de eventos
├─ core/     LÓGICA PURA (sem Phaser, sem navegador): dados, estado, save, progressão, [combate, história]
├─ data/     CONTEÚDO em JSON (personagens, golpes, itens) + loadData.ts (único que sabe de onde vêm)
├─ game/     apresentação (Phaser): cenas, UI, efeitos + context.ts (composition root)
└─ main.ts   liga tudo
```

**Regras (verificadas por `tests/architecture.test.ts`):**
1. `core` e `shared` nunca importam Phaser nem `game`.
2. `core` nunca usa `window`, `document` ou `localStorage`. O navegador entra por adaptadores injetados (ex.: `StorageAdapter`).
3. A comunicação core → interface é por eventos (`EventBus`); a interface muda o estado chamando métodos do `GameStore`.

## Como estender

**Novo personagem / golpe / item:** crie um `.json` em `src/data/<categoria>/` (id em kebab-case). Rode `npm run validate:data`:
os erros apontam arquivo e campo. Typos em chaves são erro (schemas estritos); ids duplicados e referências inexistentes também.

**Mudar o formato do save:** suba `CURRENT_SAVE_VERSION` e adicione a migração em `src/core/state/migrations.ts`
(nunca edite uma migração já publicada). `tests/migrations.test.ts` falha se faltar algum elo da cadeia.

**Novo evento do jogo:** adicione ao `GameEvents` em `src/shared/events.ts`.

**Balancear:** os números do combate vivem em `src/core/battle/rules.ts` (`BattleRules`: fórmula de dano, variação,
guarda, regeneração e Concentrar de KI). Troque a fórmula passando outra `DamageFormula`; nada mais muda.
Rode `npm run simulate` para ver o efeito e `npm test` para checar as salvaguardas (`tests/balance.test.ts`).

## Motor de combate (`src/core/battle`)

Puro (sem Phaser, sem `Math.random`): recebe um `Rng` injetado, então toda luta é reproduzível com uma semente.

```ts
const battle = Battle.create(setup, { data, rng });          // setup: lados, nível, itens, quantos em campo
while (battle.phase !== 'finished') {
  if (battle.phase === 'awaiting-replacement') { /* replace() pelo jogador, autoReplace() pela IA */ continue; }
  const actions = /* uma ação por lutador em campo, escolhida entre battle.legalActions(ref, queued) */;
  const result = battle.submitTurn(actions);                  // Result<BattleEvent[], string>
}
const outcome = battle.outcome();                             // vencedor, HP/KI finais, itens restantes
```

- **`legalActions(ref, queued)`** é a fonte única do que cada lutador pode fazer: alimenta o menu da UI, a IA e a validação.
  Em lutas com vários lutadores em campo, passe em `queued` o que os colegas já escolheram (itens e reservas já usados somem).
- **`submitTurn`** valida tudo antes de executar (turno inválido não altera nada) e devolve **eventos**. A tela da Fase 2
  só "toca" esses eventos; nunca recalcula regra. `tests/battle.properties.test.ts` garante que o log reconstrói o estado.
- **Ordem do turno:** trocar > item > transformar/desfazer > defender > golpe/concentrar; depois velocidade efetiva; empate por sorteio.
- **KI:** golpes de KI custam KI; regenera um pouco por turno; a ação Concentrar recupera mais; transformações drenam KI
  por turno e se desfazem sozinhas quando ele acaba.
- **Ponte com o estado do jogo:** `bridge.ts` monta o lado do jogador a partir do `GameStore` e, ao fim da luta,
  grava HP/KI e itens consumidos de volta. Durante a luta o estado do jogo não é tocado.

## Estado do roadmap

- [x] **Fase 0 — Fundação**
- [x] **Fase 1 — Núcleo de combate** (sem gráficos)
- [ ] Fase 2 — Tela de batalha
- [ ] Fase 3 — Exploração
- [ ] Fase 4 — Progressão
- [ ] Fase 5 — Motor de história
- [ ] Fase 6 — Vertical slice (saga Pilaf)
- [ ] Fase 7 — Demais sagas · Fase 8 — Pós-jogo

## Pendências conhecidas (intencionais)

- Valores de atributos, golpes e a curva de nível (`statsAtLevel`) são **placeholders**: o motor está validado, mas os números
  do conteúdo real serão calibrados com a história (Fases 4 e 6). Não há personagem com transformação nos dados reais ainda.
- Golpes de suporte (cura, buffs) e alvos `self`/`ally` foram **retirados do schema** até haver efeitos definidos; voltam com a necessidade.
- Sem acerto crítico, fuga de batalha nem status (veneno, etc.): não foram pedidos. Entram só se o design pedir.
- A IA é básica de propósito (move-se por poder × precisão, concentra com KI baixo, transforma-se quando sustenta). Não usa itens nem trocas.
- Textos estão em português direto nos JSON; internacionalização só se virar requisito.
- `BootScene` é uma tela de diagnóstico; fonte pixel e UI estilo FireRed chegam na Fase 2.
