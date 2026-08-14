# PedeAqui — Tela principal de Pedidos

> Issue lógica: **[278]**

## Objetivo

A tela de Pedidos deve ajudar a equipe a enxergar rapidamente o que precisa de ação agora, sem misturar histórico com a operação ativa e sem transformar estados independentes em um novo status persistido.

## Organização operacional

Os pedidos ativos são apresentados em buckets de interface:

- **Novos** — aguardando confirmação;
- **Em preparo** — produção em andamento;
- **Prontos** — produção pronta ou fulfillment pronto para continuidade;
- **Atrasados (30+ min)** — pedido ainda ativo há pelo menos 30 minutos;
- **A iniciar** — demais pedidos ativos/confirmados que ainda não estão em preparo/prontos.

Finalizados, cancelados e recusados ficam em **Histórico**, separado da fila ativa.

## “Atrasados” é atenção visual, não estado de negócio

O limite de 30 minutos é uma heurística de apresentação para destacar pedidos antigos na tela. Ele:

- não grava nada no banco;
- não cria enum/state machine;
- não altera `order_status`, `production_status`, `payment_status` ou `fulfillment_status`;
- não representa um SLA contratual;
- não muda quais ações são permitidas.

A fonte de verdade continua sendo os estados independentes já existentes. Se o produto ganhar futuramente uma previsão/SLA autoritativa por loja ou pedido, essa heurística deve ser substituída por esse dado real.

## Card do pedido

Cada card prioriza:

- número do pedido;
- cliente;
- canal de origem;
- modalidade (entrega, retirada, mesa quando `fulfillment_type` informa `dine_in`);
- tempo decorrido;
- total;
- status operacional derivado para leitura rápida;
- estados independentes de pedido, produção e fulfillment;
- ações já existentes e detalhe completo.

A listagem atual de `OrderService.list()` não retorna um identificador/número de mesa. Por isso a interface **não inventa mesa**. O card mostra `Mesa` apenas quando a modalidade autoritativa é `dine_in`; um número de mesa só deve ser exibido quando o backend passar a fornecer essa relação de forma explícita.

## Ações preservadas

As condições anteriores continuam intactas:

- aceitar/recusar;
- iniciar produção;
- marcar pronto;
- marcar pago;
- liberar retirada;
- confirmar retirada do cliente;
- aguardar entregador;
- concluir somente quando `canCompleteFromManager()` permitir.

A [278] não modifica a máquina de estados nem as transições server-side.

## Realtime preservado

O board continua ouvindo `INSERT` e `UPDATE` da tabela `orders` para a unidade atual via Supabase Realtime, executando `router.refresh()` e removendo o canal no cleanup. O alerta sonoro opcional para novo pedido também foi mantido.

## Responsividade

- desktop/tablet: buckets ativos em grid adaptativo;
- celular: uma coluna, sem obrigar o usuário a arrastar um Kanban horizontal de cinco colunas;
- histórico recolhível abaixo da operação ativa;
- busca, botão de som e links usam os componentes/tokens compartilhados do design system.

## Fora de escopo

- detalhe do pedido, tratado em [279];
- novo SLA configurável;
- mudança de state machine;
- mudança de realtime;
- alteração de permissões ou consultas do banco.
