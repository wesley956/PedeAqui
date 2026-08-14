# PDV — caminho rápido

A interface do PDV mantém a lógica existente e organiza a operação em três áreas visuais:

1. **Catálogo e pesquisa** — maior área útil, busca fixa no desktop e categorias roláveis.
2. **Seleção atual** — carrinho visível ao lado no desktop e em sequência no tablet/celular.
3. **Ação principal** — total e finalização permanecem destacados no rodapé do painel da venda.

O layout muda para uma coluna abaixo do breakpoint de tablet sem desmontar o componente, portanto carrinho, cliente, benefícios e pagamentos continuam no mesmo estado React durante a responsividade.

Controles passam a usar alturas e tokens estruturais do design system, incluindo 48 px em contexto touch. Nesta etapa não foram alterados `createPdvSaleAction`, validação de modificadores, cálculo de benefícios, montagem de pagamentos nem idempotência da venda.

As funções menos frequentes continuam acessíveis nesta etapa e serão reorganizadas em segundo nível na [282].
