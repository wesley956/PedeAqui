# [313] Homologação de layouts em tablet

Data: 2026-08-14
Faixas de referência: portrait 600–900 px e landscape 901–1180 px, incluindo dispositivos touch.

## Decisão de shell

- **Portrait até 900 px:** usa o shell de uma coluna e navegação inferior já existente. O conteúdo recebe padding seguro e reserva `safe-area-inset-bottom` para a barra fixa.
- **Landscape 901–1180 px:** mantém a navegação lateral, porém força a apresentação compacta de 88 px, escondendo rótulos longos e exibindo os marcadores. Isso recupera aproximadamente 150 px de largura útil sem desmontar a árvore React.
- A compactação de landscape é **somente CSS**; portanto mudança de orientação não recria o estado dos formulários/PDV por causa de uma troca programática de layout.
- Em `pointer: coarse`, controles frequentes recebem `--control-height-lg`.

## Fluxos prioritários

### PDV

- Landscape reduz a coluna do carrinho para 330–380 px abaixo de 1100 px.
- Abaixo de 820 px, catálogo e carrinho viram uma coluna; toolbar/cart deixam de ser sticky para evitar painéis concorrentes no viewport reduzido.
- O bloco final continua sticky acima da navegação móvel.
- Busca, categorias, produtos, quantidade, pagamento e ações usam alvos touch grandes com `pointer: coarse`.
- Dialog de adicionais possui altura máxima e rolagem própria; em celular vira bottom sheet, sem afetar o contrato de tablet.

### Salão

- Grade usa `repeat(auto-fill,minmax(220px,1fr))`, adaptando a quantidade de mesas por linha sem largura fixa de viewport.
- Painéis em duas colunas quebram para uma coluna abaixo de 980 px.
- Ações e campos recebem altura touch em coarse pointer.
- Nenhuma mesa depende de hover: foco e toque abrem o mesmo link.

### Produção / KDS

- Cards usam grade responsiva com mínimo de 340 px e tipografia `clamp` legível à distância.
- O módulo já possui contrato específico de `pointer: coarse` com controles em `--control-height-lg`.
- Atualização realtime/refresh continua independente da orientação.

### Caixa

- A operação diária permanece em layout responsivo e usa o contrato `pointer: coarse` para ações financeiras.
- Abrir turno, suprimento, sangria e fechamento não dependem de hover.

### Gestão em balcão

- Em portrait, o AppShell não consome largura com sidebar.
- Em landscape, sidebar compacta evita esmagar tabelas/formulários.
- O conteúdo continua limitado por `--content-wide`, com `min-width:0` e paddings sem valores fixos de viewport.

## Teclado virtual e rolagem

A aplicação não fixa a altura do conteúdo principal. Formulários permanecem no fluxo normal e os painéis que usam `max-height` também definem `overflow:auto`. Isso permite redução do visual viewport causada pelo teclado sem esconder permanentemente o CTA. O PDV abandona sticky concorrente a partir de 820 px.

## Gate automatizado

`tests/tablet-layout-qa.test.ts` protege:

- breakpoint landscape 901–1180 e sidebar de 88 px;
- troca para navegação inferior até 900 px com safe-area;
- alvos touch do shell;
- breakpoints 1100/820 e painel final do PDV;
- breakpoints e touch do Salão;
- layout/touch do KDS e Caixa.

A [314] trata especificamente da faixa de celular; acessibilidade é fechada na [315].
