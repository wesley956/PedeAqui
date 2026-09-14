# INT-06 — Adapter canônico de Pedido / Workflow / Produção

Status de rollout: **shadow / read-only**.

Feature identifier: `intelligence_canonical_order_workflow`.

## Objetivo

A Intelligence lê e interpreta pedidos sem criar uma segunda verdade operacional. O adapter expõe os contratos conceituais `order.status`, `order.summary`, `order.tracking`, `order.workflow` e `production.status`, sempre projetando dados já definidos pelos serviços canônicos do PedeAqui.

## Fontes canônicas

- `OrderService.get`: leitura operacional autorizada do pedido e dos quatro domínios oficiais de estado.
- `state-machines.ts`: única definição de estados e transições. A Intelligence não mantém tabela de transições própria.
- `OrderWorkflowSettingsService.get`: modo `standard | simplified | custom` e configuração customizada por loja.
- `order-workflow-visibility.ts`: tradução oficial do snapshot de estados para etapa bruta/visível e coerência com notificações.
- `OrderPresentationService.getManagerRow`: apresentação operacional e metadados externos já saneados.
- `PublicOrderService.getTracking`: projeção pública **read-only**, protegida pelo token já existente. Diferentemente de `PublicOrderService.get`, não chama `OrderPixService.ensureForOrder` e não pode criar/atualizar cobrança.
- `KitchenService.projection`: snapshot oficial de produção enquanto o pedido está no KDS.
- `AuthorityResolver` (INT-04/#1055): pedidos externos exigem authority snapshot resolvido; a Intelligence não converte autoridade do provider em autoridade local.
- `disclosure-policy.ts`: projeções operacionais respeitam audiência e RBAC.

## Ferramentas de leitura

| Contrato | Adapter | Audiência |
| --- | --- | --- |
| `order.status` | `status()` | customer (token), agent, merchant, system autorizado |
| `order.summary` | `summary()` | customer (token), agent, merchant, system autorizado |
| `order.tracking` | `tracking()` | customer, obrigatoriamente por `storeSlug + accessToken` |
| `order.workflow` | `workflow()` | agent, merchant e system autorizado |
| `production.status` | `productionStatus()` | customer (token), agent, merchant, system autorizado |

A projeção customer não retorna endereço, telefone, nome do cliente, histórico interno, IDs de impressão ou metadata operacional. Agent/merchant passam pela política de disclosure e pelos readers que já exigem `ORDERS_VIEW`.

## Workflow

O adapter não possui state machine própria. `rawWorkflowStage`, `visibleWorkflowStage` e `visibleWorkflowStages` vêm diretamente de `order-workflow-visibility.ts`.

Assim:

- `standard`, `simplified` e `custom` permanecem com a semântica atual;
- delivery e pickup usam as sequências atuais;
- estágios removidos no custom são dobrados pela função canônica, sem a Intelligence inventar etapa intermediária;
- `quickFinish` é apenas refletido quando o modo é `custom`; nenhuma ação de finalização é executada neste lote;
- notificações continuam usando o mesmo módulo de visibilidade, evitando divergência entre texto enviado e etapa mostrada.

## Produção / KDS

`production.status` compara o status do pedido com `KitchenService.projection` quando existe projeção ativa. Divergência gera `OrderProjectionMismatchError` no shadow em vez de mascarar o problema. Pedidos finalizados/cancelados podem naturalmente não existir mais no KDS; nesse caso o status canônico do pedido é mantido com `inKitchen=false`.

Não há chamada a start/finish/bump/print nem alteração de estação, roteamento ou cópias de impressão.

## Pedidos externos

A apresentação externa continua vindo de `OrderPresentationService`, que usa `sanitizeExternalOrderPresentation`. Para qualquer pedido externo, o adapter exige um `AuthoritySnapshot` compatível com organização, loja, pedido e provider, e exige `view_order` autorizado.

Nenhum estado de iFood/99Food é convertido em uma etapa interna nova. Payment owner, logistics owner e sync status continuam pertencendo aos contratos de integração/authority existentes.

## Isolamento

Toda leitura é conferida contra `IntelligenceContext.organizationId`, `storeId` e, quando definido, `activeReferences.orderId`. Qualquer divergência falha fechado com `OrderWorkflowScopeError`.

O rastreamento customer valida adicionalmente que a loja resolvida pelo slug/token pertence ao mesmo contexto. O token público não é substituído por reconhecimento de navegador, WhatsApp ou qualquer heurística da Intelligence.

## Invariantes protegidos neste lote

- zero migration e zero RPC novos;
- zero mutação de pedido/workflow/produção;
- checkout intacto;
- WhatsApp/Inbox/coexistência (#1050) intactos;
- impressão/KDS sem alteração de comportamento ou número de cópias;
- pagamento/financeiro intactos;
- logística/entregas intactas;
- lifecycle de iFood/99 intacto;
- catálogo e preços PedeAqui continuam independentes de marketplaces.

## Rollback

O rollout é shadow. O rollback funcional consiste em desabilitar `intelligence_canonical_order_workflow`; como o lote não substitui mutações existentes nem adiciona schema, não há rollback de banco ou reconciliação operacional.