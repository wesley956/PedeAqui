# PedeAqui — adendo ao inventário de prontidão em 23/08/2026

Este adendo preserva o baseline congelado de 22/08/2026 e registra superfícies adicionadas posteriormente.

## Institucional e jurídico

- `/empresa` — página institucional pública do PedeAqui.
- `/politica-de-privacidade` — política de privacidade pública.
- `/termos-de-uso` — termos de uso públicos.

## Configurações da unidade

- `/configuracoes/loja` — perfil oficial da unidade para identificação, contato, endereço e metadados públicos autorizados. Mantém RBAC, isolamento por organização/unidade e não cria cadastro paralelo de endereço ou telefone.
- `/configuracoes/fluxo-pedidos` — configuração do fluxo operacional da unidade com modos completo, simplificado ou personalizado. No modo personalizado, entrega e retirada possuem checkpoints visuais independentes; ocultar um checkpoint não remove nem enfraquece as máquinas de estado internas de pedido, pagamento, produção ou fulfillment.

## Painel do Proprietário

- `/platform/unidades/[storeId]/configuracao-operacional` — tela dedicada, exclusiva de `super_admin`, para configurar o comportamento operacional dos módulos já habilitados em uma unidade. Não ativa módulos nem altera contrato comercial.

## Gestão do cardápio

- `/cardapio/sugestoes` — configuração de categorias complementares sugeridas durante a montagem do pedido. É merchandising da unidade, permanece isolada por organização/loja, não ativa módulos e não altera contrato comercial. Para restaurantes, uma única categoria ativa chamada `Bebidas` pode ser sugerida como bootstrap seguro; depois a configuração é persistida e administrada por ID.

## Operação de pedidos

- No fluxo simplificado, o quadro operacional possui `Iniciar`, `Pronto` e `Finalizados`. A coluna `Finalizados` representa a etapa em que o restaurante terminou sua operação e o pedido de delivery já iniciou rota (`out_for_delivery`), exibindo `Aguardando confirmação de entrega` até o entregador confirmar.
- No fluxo personalizado, a unidade escolhe checkpoints visuais predefinidos separadamente para entrega e retirada. `Novo` e `Finalizado` permanecem obrigatórios; etapas intermediárias ocultas são agrupadas visualmente sem burlar as transições internas seguras. A operação de rota continua na Central de Entregas.
- Ao confirmar uma entrega com pagamento pendente, o entregador confirma o recebimento por padrão e o PedeAqui liquida o único pagamento pendente de forma atômica junto com a entrega. Pedidos já pagos não recebem uma segunda baixa.
- Se o cliente não pagar ou houver eventualidade, o entregador pode selecionar `Não recebi / houve problema` e deve registrar uma observação. A entrega fica confirmada, o pagamento permanece pendente e a exceção é gravada no histórico/auditoria para não falsificar o financeiro.
- Quando a entrega é confirmada e o pagamento está liquidado, o backend conclui o pedido automaticamente; o pedido terminal deixa o quadro operacional e permanece consultável no histórico.
- `/pedidos/historico` — histórico separado de pedidos realmente concluídos, cancelados e recusados, sem disputar espaço com pedidos em andamento.
