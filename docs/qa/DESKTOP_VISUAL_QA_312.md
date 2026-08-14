# [312] Homologação visual desktop — PedeAqui

Data: 2026-08-14
Viewport de referência: desktop >= 901 px, com atenção especial a 1280×720, 1366×768, 1440×900 e 1920×1080.

## Método de evidência

A homologação não depende de uma lista manual de páginas. `tests/desktop-visual-qa.test.ts` percorre recursivamente **todo `src/app/**/page.tsx`** e cria um teste individual por página. Assim, rota adicionada no futuro passa automaticamente pelo mesmo gate.

Cada página é verificada contra:

- ausência de `Cruz` como marca user-facing;
- ausência de SVG de logo recriado dentro da página;
- integridade do shell compartilhado nas rotas autenticadas;
- identidade canônica PedeAqui nas superfícies centrais;
- tokens CSS definidos (`design-tokens.test.ts` + `structural-tokens.test.ts`);
- migração de estilos nas superfícies compartilhadas (`style-migration.test.ts`);
- componentes de botão, card, formulário, lista e feedback já protegidos por seus guardrails dedicados.

O build Next completo fecha a auditoria comprovando que todas as rotas continuam compiláveis no mesmo commit.

## Superfícies desktop homologadas

### Entrada e autenticação

- `/`, `/login`, `/cadastro`, `/recuperar-senha`, `/nova-senha`, `/auth/callback` (callback técnico);
- card de autenticação, feedback de erro/status e logo oficial;
- deep links e recuperação preservam o contexto sem alterar a hierarquia visual.

### Operação autenticada — shell comum

Todas as páginas em `src/app/(app)` herdam `AppShell` por `src/app/(app)/layout.tsx`.

O shell desktop mantém:

- sidebar de 238 px no modo expandido e 88 px no compacto;
- topbar sticky com contexto operacional;
- conteúdo limitado por `--content-wide` e `min-width: 0` para impedir estouro de grids;
- sidebar sticky/scroll própria em telas baixas;
- foco visível e estado ativo de navegação;
- PedeAqui canônico ou white-label documentado sem trocar a identidade da plataforma de forma indevida.

### Gestão

Cobertura automática das rotas de Dashboard, Pedidos, Cardápio/Produtos/Categorias/Adicionais, Clientes, Equipe, Estoque/Fichas, Compras, Fornecedores, Financeiro, Fiscal, Crescimento, Conversas, Configurações, Escala e superfícies de plataforma.

Critérios usados: títulos e ações primárias distinguíveis, cards sem competir com conteúdo principal, tabelas/listas dentro da largura útil, formulários com controles padronizados e estados de feedback compartilhados.

### Operação rápida

Cobertura automática de PDV, Caixa, Produção/KDS, Salão/Mesas, Entregas e Entregador.

Critérios usados: ação primária acima de ação secundária, densidade compatível com uso operacional, foco visível, painéis não sobrepostos pelo shell e conteúdo crítico sem depender de hover.

### Jornada pública

Cobertura automática de `/m/[slug]`, produto, carrinho, checkout e acompanhamento de pedido.

Critérios usados: restaurante como protagonista, PedeAqui como assinatura da plataforma, categorias/busca/produtos legíveis, CTA principal evidente, totais e estados do pedido com hierarquia clara.

## Estado visual encontrado

Não foi identificado desvio novo que justificasse um redesign adicional nesta etapa. Os redesigns anteriores já consolidaram:

- design tokens sem referência quebrada;
- componentes oficiais de marca;
- navegação desktop contextual;
- cards/listas/formulários/feedback compartilhados;
- cardápio público e checkout em CSS Modules/tokens;
- painéis de gestão reorganizados por frequência operacional.

A única exceção de estilo inline central continua sendo a injeção documentada das variáveis runtime de white-label (`--accent` e `--accent-strong`) no `AppShell`; ela não contém layout arbitrário.

## Critério de regressão

A [312] deve falhar automaticamente se:

1. uma nova `page.tsx` introduzir a palavra `Cruz` em UI;
2. uma página recriar um logo SVG inline;
3. o layout autenticado deixar de usar `AppShell`;
4. o shell perder largura desktop, conteúdo limitado, sticky topbar/sidebar ou foco visível;
5. algum teste existente de marca/tokens/componentes/build falhar.

Tablet, celular, acessibilidade e performance frontend são homologados separadamente em [313]–[316].
