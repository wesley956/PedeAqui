# Compras e fornecedores — fluxo operacional

Issue lógica: **[292]**.

A experiência segue a sequência necessidade → pedido → fornecedor → recebimento → estoque. Sugestões de reposição são somente recomendações; nenhum pedido é criado automaticamente.

Pedidos deixam explícitos rascunho, aguardando recebimento, recebimento parcial, recebido e cancelado. Quantidades recebidas são comparadas às pedidas para tornar divergências visíveis. Recebimento e correção continuam nos formulários e serviços server-side existentes, que são responsáveis por atualizar o ledger.

Fornecedores mostram de forma imediata se estão habilitados na unidade, prazo, pedido mínimo e catálogo de insumos. Cadastro mestre e condições da unidade permanecem separados.

No mobile, fluxo, pedidos e catálogos colapsam para uma coluna. Nenhum saldo de estoque é editável por essas telas.
