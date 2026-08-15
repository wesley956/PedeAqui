# Painel do Proprietário — fundação [337]

## Objetivo

`/platform` é a central exclusiva de proprietário e suporte do PedeAqui. Ela não reutiliza o painel operacional do restaurante e não altera o contexto de tenant da aplicação comum.

## Acesso

- o gate continua sendo `platform_admin_check_internal`;
- `support` possui leitura e diagnóstico;
- `super_admin` pode executar ações administrativas controladas;
- ações de assinatura, plano e catálogo continuam passando por `PlatformAdminService` e não fazem escrita arbitrária a partir do browser;
- credenciais de service role e secrets não são enviados aos componentes client.

## Visão operacional segura

`PlatformOwnerOverviewService` resolve o gate de plataforma antes de criar o cliente administrativo. A leitura global usa somente campos necessários para suporte:

- unidades: identificação, organização, nome, slug, status, cidade/UF e indicador de principal;
- pedidos: somente `store_id`, `order_status` e `created_at` para a amostra de atividade, além de contagens server-side;
- integrações: contagem de entregas outbound encerradas em falha.

O serviço não seleciona nome, telefone, e-mail ou endereço do cliente, snapshots de itens, observações, token público ou dados financeiros detalhados do pedido.

## Dashboard

A fundação contém:

- unidades ativas e total de unidades;
- pedidos criados nas últimas 24 horas e pedidos em andamento;
- clientes com assinatura ativa e clientes em teste;
- alertas consolidados de assinatura, cobrança e integração;
- busca conjunta por empresa e unidade;
- resumo de atividade recente;
- catálogo de integrações;
- assinaturas e planos;
- incidentes e saúde;
- áreas-base de suporte e configuração.

O total global de pedidos de 24 horas e as contagens de unidades são consultas exatas. A distribuição de estados e a atividade por unidade são uma amostra limitada aos 200 pedidos mais recentes das últimas 24 horas para manter o dashboard leve; ela não é apresentada como total financeiro ou operacional por unidade.

## Auditoria de intervenção

Mudanças manuais de assinatura aceitam `reason` e `protocol`; quando a UI ainda não informa um motivo específico, a Server Action registra um motivo padrão de alteração manual. O metadata enviado ao fluxo de assinatura inclui também o `actor_user_id`.

## Evolução

A estrutura foi criada para receber páginas especializadas de empresa/unidade, integrações, incidentes, suporte e configuração sem mover lógica privilegiada para o cliente e sem misturar o painel do restaurante com o painel da plataforma.
