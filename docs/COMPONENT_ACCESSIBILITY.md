# PedeAqui — Baseline de acessibilidade dos componentes

> Origem: issue **[268]**. Esta revisão cobre os primitives compartilhados criados em [262]–[267]. A homologação completa de todas as páginas permanece em [315].

## Critérios obrigatórios

Todo componente compartilhado precisa preservar:

- operação por teclado quando houver interação;
- foco visível;
- nome acessível para controles e ações por ícone;
- texto de validação associado ao campo;
- alvo de toque adequado em dispositivos `pointer: coarse`;
- contexto durante loading/disabled;
- suporte a `prefers-reduced-motion` quando houver animação;
- informação de estado que não dependa apenas de cor;
- estrutura semântica nativa sempre que disponível;
- funcionamento em cores forçadas quando borda/cor for relevante.

## Button [262]

- `iconOnly` exige `aria-label` pelo contrato TypeScript.
- `loading` usa `aria-busy` e mantém o rótulo da ação.
- `disabled` continua semanticamente desabilitado.
- `:focus-visible` usa `--focus-ring`.
- em `pointer: coarse`, inclusive botão `sm` e icon-only mantêm alvo mínimo de 48 px.
- spinner respeita redução de movimento.
- o texto sobre laranja/perigo usa `--text-on-brand = --brand-graphite-deep`. A troca foi feita nesta issue porque branco sobre `#FF6B00` não atingia 4.5:1; grafite profundo ultrapassa AA no laranja principal, no hover e no danger.

## Form controls [263]

- label é ligada ao controle por `htmlFor`/`id`.
- ajuda e erro usam `aria-describedby`.
- erro usa `aria-invalid`; mensagem é anunciável.
- switch expõe `role=switch` e foco visível.
- checkbox/radio/switch ficam dentro de labels clicáveis; a área da escolha cresce em touch.
- `loading` preserva o nome do campo e usa `aria-busy`.

## Cards [264]

Cards são contêineres semânticos, não controles interativos por padrão. Ações devem continuar sendo botões/links reais dentro de `CardActions`. O card não pode virar um grande `div onClick` sem alternativa de teclado.

## Feedback e Dialog [265]

- alertas usam `role=status` ou `role=alert` conforme urgência.
- diálogo usa o elemento nativo `dialog` e `showModal()`.
- Escape/cancelamento é tratado sem exigir mouse.
- título e descrição usam IDs únicos gerados por `useId`; múltiplos diálogos não compartilham mais IDs fixos.
- ações de fechar têm nome acessível.
- botão fechar passa a ter pelo menos 48 px em dispositivos touch.
- loading/skeleton respeitam redução de movimento.
- componentes críticos mantêm bordas em `forced-colors`.

## Listagens [266]

- desktop usa `table`, `caption`, `thead`, `th scope=col` e `aria-sort` quando informado.
- mobile mantém a mesma informação em `role=list/listitem`.
- foco dentro de linha/card fica visível.
- estados loading/erro/vazio preservam mensagem textual.
- informação essencial não deve ser removida só para caber em celular.

## Status [267]

- `StatusBadge` sempre mostra texto e símbolo.
- símbolo é decorativo para leitor de tela porque o rótulo já comunica o estado.
- tom semântico complementa, nunca substitui, o texto.
- `forced-colors` mantém a delimitação do badge.

## Contraste validado

O guardrail `tests/component-accessibility.test.ts` calcula contraste WCAG para os pares críticos usados pelos primitives:

- grafite profundo sobre laranja principal;
- grafite profundo sobre laranja hover;
- grafite profundo sobre danger;
- textos success/warning/danger/info sobre suas superfícies tonais.

O baseline exige pelo menos **4.5:1** para esses textos normais.

## Zoom e responsividade

Nenhum primitive deve bloquear zoom do navegador com `user-scalable=no` ou `maximum-scale=1`. Layouts compartilhados usam quebra e largura fluida; a validação página a página em 200%/400% é parte da homologação [315].

## Guardrail

`tests/component-accessibility.test.ts` falha se os contratos centrais acima regredirem. Ele complementa, e não substitui, testes manuais com teclado, leitor de tela, zoom e dispositivos reais.
