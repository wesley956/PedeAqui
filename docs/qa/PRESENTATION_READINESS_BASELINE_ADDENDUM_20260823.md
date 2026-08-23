# PedeAqui — adendo ao inventário de prontidão em 23/08/2026

Este adendo preserva o baseline congelado de 22/08/2026 e registra superfícies adicionadas posteriormente.

## Painel do Proprietário

- `/platform/unidades/[storeId]/configuracao-operacional` — tela dedicada, exclusiva de `super_admin`, para configurar o comportamento operacional dos módulos já habilitados em uma unidade. Não ativa módulos nem altera contrato comercial.

## Operação de pedidos

- No fluxo simplificado, o quadro operacional possui `Iniciar`, `Pronto` e `Finalizados`. A coluna `Finalizados` representa a etapa em que o restaurante terminou sua operação e o pedido de delivery já iniciou rota (`out_for_delivery`), exibindo `Aguardando confirmação de entrega` até o entregador confirmar.
- Ao confirmar uma entrega com pagamento pendente, o entregador confirma o recebimento por padrão e o PedeAqui liquida o único pagamento pendente de forma atômica junto com a entrega. Pedidos já pagos não recebem uma segunda baixa.
- Se o cliente não pagar ou houver eventualidade, o entregador pode selecionar `Não recebi / houve problema` e deve registrar uma observação. A entrega fica confirmada, o pagamento permanece pendente e a exceção é gravada no histórico/auditoria para não falsificar o financeiro.
- Quando a entrega é confirmada e o pagamento está liquidado, o backend conclui o pedido automaticamente; o pedido terminal deixa o quadro operacional e permanece consultável no histórico.
- `/pedidos/historico` — histórico separado de pedidos realmente concluídos, cancelados e recusados, sem disputar espaço com pedidos em andamento.
