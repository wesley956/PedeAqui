# Omnichannel release gates (#949)

Este documento é o gate de produção das integrações externas. Merge de código, conexão válida ou chamada HTTP bem-sucedida **não autorizam** ativação em loja real.

## Princípios

1. Todas as capabilities externas começam OFF.
2. Aprovação de produção é por **store + provider + capability**.
3. Aprovar um canário não ativa a capability automaticamente.
4. A primeira ativação real deve envolver uma única capability em uma única unidade explicitamente aprovada.
5. iFood Catalog permanece fora do rollout: cardápio e preços do PedeAqui são independentes do iFood.
6. Qualquer duplicidade de pedido, impressão, cobrança ou contratação de entrega é blocker P0.
7. Provider degradado não pode afetar canal nativo ou outro tenant.
8. Expansão geral é uma decisão separada do canário e nunca é consequência automática de merge.

## Evidência registrada

A trilha usa `integration_audit_log` com `action=rollout_evidence_recorded`. Não versionar nem registrar payload bruto, token, secret, telefone, e-mail, endereço, coordenadas ou dados livres de cliente.

Cada cenário deve registrar somente referências sanitizadas e dados verificáveis:

- data do registro;
- commit/build;
- ambiente;
- provider/capability/store;
- merchant de teste sanitizado;
- external order ID sanitizado quando aplicável;
- internal order ID;
- tipos de eventos recebidos;
- ações executadas;
- print job ID quando aplicável;
- divergence count;
- contadores de duplicidade;
- isolamento do canal nativo;
- isolamento entre tenants;
- referência externa da evidência/homologação.

## Gate para iniciar canário

Todos precisam estar verdes:

- `native_baseline` — PedeAqui nativo com flags externas OFF;
- `core_resilience` — dedupe, out-of-order, retry, crash/restart, tenant isolation e schema evolution;
- `structural_integrity` — #950, incluindo Dona Maria 3 ↔ 4 cards e independência entre módulos/providers/workflow;
- `provider_sandbox` — fluxo real no sandbox/test merchant;
- `official_homologation` — processo oficial do provider concluído quando exigido;
- `security` — secrets, replay/forgery, RBAC, RLS, PII e isolamento;
- zero duplicidade P0;
- zero divergência em cenário marcado como aprovado;
- canal nativo e tenants isolados.

Depois disso ainda é necessária uma ação explícita de super admin com uma referência de aprovação. O serviço registra `production_canary_approved` com `activation_performed=false`.

## iFood Orders — checklist oficial vigente

Referência conferida em 08/09/2026 na documentação oficial de homologação de **Order** e **Events**. Antes de marcar `provider_sandbox` e `official_homologation` como aprovados, a aplicação final precisa demonstrar, conforme o fluxo aplicável:

- conta profissional/CNPJ, Client ID/Secret de teste e loja de teste;
- consumo de eventos por polling ou webhook;
- quando polling for usado, ciclo periódico de aproximadamente 30 segundos e ACK dos eventos recebidos;
- sincronização do estado quando outro sistema altera o pedido;
- processamento dos eventos aplicáveis da plataforma de negociação;
- consulta dos detalhes completos do pedido e importação idempotente;
- confirmação do pedido;
- cancelamento pelo fluxo oficial e motivos válidos/dinâmicos;
- TAKEOUT: `readyToPickup` quando estiver pronto;
- DELIVERY com entrega própria: `dispatch` quando sair para entrega;
- conclusão do pedido no processo de homologação;
- notas de entrega visíveis no ticket para restaurante;
- renovação de token de acordo com expiração e respeito aos rate limits documentados;
- reconciliação do estado retornado pelo iFood com o agregado interno, sem criar status específico de provider.

O assistente de homologação do iFood valida conectividade e, no fluxo publicado, passa por confirmação, cancelamento, dispatch e conclusão. Se o desenho usar webhook com polling como fallback, o cenário combinado precisa ser testado manualmente porque o assistente automatizado valida um método por vez.

Este checklist é específico de **Orders/Events**. Ele não reintroduz sincronização de catálogo no PedeAqui.

## Canário real

Somente após aprovação explícita para uma unidade escolhida:

1. ativar apenas uma capability;
2. preferir Orders antes de logística externa;
3. executar pedidos controlados de baixo risco;
4. validar painel, som, impressão, cozinha, financeiro e lifecycle;
5. provocar/declarar degradação controlada do provider sem afetar nativo;
6. testar reconnect/reconcile;
7. executar rollback de verdade;
8. observar antes de considerar expansão.

O rollback usa `rollbackProductionCapability`: primeiro desliga a capability da unidade, depois revoga as aprovações de canário/expansão e registra auditoria. Histórico e pedidos já importados são preservados.

## Gate para expansão geral

Além de todos os itens do canário, exige:

- `canary_observation` aprovado;
- `rollback_verified` aprovado;
- zero P0 no período;
- isolamento nativo/tenant comprovado durante o piloto;
- nova aprovação explícita de super admin.

A ação registra `general_rollout_approved` e também não ativa capabilities automaticamente.

## iFood Orders — bloqueio externo atual

Sem Client ID/Secret de teste e merchant de sandbox não existe evidência real suficiente para `provider_sandbox` nem `official_homologation`. Mocks e fixtures fabricadas não satisfazem esses gates.

A captura da fixture real deve seguir `docs/IFOOD_SANDBOX_FIXTURE_CAPTURE.md`, sanitizando o pedido antes de versionar qualquer evidência estrutural.

## Critério de parada P0

Interromper rollout imediatamente se ocorrer qualquer um:

- pedido externo duplicado;
- impressão duplicada;
- cobrança duplicada;
- contratação de entrega duplicada;
- provider A afetando provider B;
- provider afetando pedido nativo;
- vazamento entre tenants;
- alteração de workflow/lane/card causada por módulo/provider sem edição explícita.

Nenhum desses casos pode ser tratado apenas como warning.
