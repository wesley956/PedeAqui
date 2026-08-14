# PedeAqui — Matriz de navegação contextual

> Issue lógica: **[271]** · Baseada em `docs/OPERATIONAL_CONTEXTS.md` e no RBAC já existente.

## Regra de segurança

**Visibilidade de menu não autoriza nada.** A navegação contextual é somente ergonomia. Rotas e ações continuam protegidas por `authorize(...)`, RLS/RPCs e pelo serviço específico da plataforma.

## Papéis de sistema existentes

O bootstrap atual cria os papéis: `owner`, `manager`, `cashier`, `attendant`, `waiter`, `kitchen`, `driver` e `financial`. A matriz os traduz para os contextos de [270]:

| Role key | Contexto UX |
|---|---|
| `owner` | management |
| `manager` | manager |
| `cashier` | cashier |
| `attendant` | service |
| `waiter` | floor |
| `kitchen` | kitchen |
| `driver` | delivery |
| `financial` | administrative |

Papéis customizados continuam suportados pelo RBAC. Quando a aplicação não possuir uma correspondência nominal de contexto, a navegação pode usar permissões concedidas para filtrar módulos, sem concluir que isso representa autorização nova.

## Prioridades

Cada contexto marca um módulo como:
- `primary`: faz parte do núcleo diário;
- `secondary`: útil, mas não dominante;
- `hidden`: não deve competir na navegação daquele contexto.

A fonte executável é `src/components/layout/navigation-model.ts`.

## Permissões relacionadas

A matriz usa somente chaves já existentes em `src/server/access/permissions.ts`. Exemplos:

| Módulo | Permissão de visibilidade relacionada |
|---|---|
| Dashboard | `dashboard.view` |
| Pedidos | `orders.view` |
| Conversas | `conversations.view` |
| Salão | `dining.view` ou `orders.view` para compatibilidade com papéis legados |
| Cardápio | `products.view` |
| PDV | `orders.create` |
| Caixa | `cash.view` ou `cash.open` |
| Financeiro | `finance.view` ou `reports.view` |
| Fiscal | `fiscal.view` |
| Produção | `orders.view` |
| Entregas | `delivery.view` ou `orders.view` para compatibilidade com papéis legados |
| Meu roteiro | `delivery.view` ou `orders.view` |
| Estoque | `inventory.view` |
| Fornecedores | `suppliers.view` |
| Compras | `purchases.view` |
| Clientes | `customers.view` |
| Crescimento | `growth.view` |
| Escala | `scale.view` |
| Equipe | `team.view` |
| Configurações | qualquer permissão administrativa listada no modelo |
| Plataforma | autorização própria de `PlatformAdminService`; não usa permissão de tenant |

Alguns papéis do bootstrap original antecedem permissões mais novas (por exemplo `dining.view` e `delivery.view`). Por isso a navegação aceita a permissão legada `orders.view` como sinal de **superfície possível**, mas a rota continua responsável por sua autorização real.

## Multi-role

`contextsForRoleKeys()` aceita mais de um papel e remove duplicados. `priorityForModule()` combina contextos de forma determinística escolhendo a maior prioridade: `primary > secondary > hidden`.

Isso significa que acumular dois contextos expande a navegação para tarefas relevantes dos dois, mas **não adiciona permissões**. `contextualNavigation()` ainda exige que o módulo seja compatível com alguma permissão efetivamente concedida.

## Plataforma

`/platform` é uma exceção explícita. O console possui autorização própria (`PlatformAdminService`) e não deve aparecer porque um usuário tem `organization.manage`. A função recebe `platformAuthorized` separadamente.

## Próximas issues

- [272] usa grupos e prioridades para o menu desktop.
- [273] usa `primary` para a bottom navigation e envia `secondary` para `Mais`.
- [274] não depende da matriz para inventar indicadores; só usa dados autoritativos.
- [275] define a rota inicial determinística por contexto.
