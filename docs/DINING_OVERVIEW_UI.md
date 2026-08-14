# Salão — visão de mesas

A rota `/salao` é uma superfície operacional. Ela mostra mesa, estado, consumo em aberto, quantidade de pessoas, tempo da sessão e o estado `settling` como **Conta solicitada**.

O cadastro de mesas foi movido para `/configuracoes/salao`, acessível apenas após `dining.manage`. A action e o serviço originais continuam sendo usados; a mudança é de localização na interface, não de autorização ou regra de negócio.

Responsável pela mesa não é exibido porque `DiningService.listTables()` não possui hoje uma fonte autoritativa para esse dado. Nenhum nome é inferido ou inventado.

IDs internos não entram na informação primária. O `table.id` continua somente no destino da rota, como identificador técnico necessário à navegação.

A visão usa estado de tab existente para sinalizar conta solicitada e mantém os cálculos atuais de saldo e tempo de ocupação.
