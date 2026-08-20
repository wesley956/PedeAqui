# Baseline modular do PedeAqui — [352]

Data do levantamento: 2026-08-19. Este documento congela o comportamento **anterior** à ativação da arquitetura modular. Ele é uma referência de regressão; não autoriza mudanças de fluxo por si só.

## 1. Regra de compatibilidade

Para unidades existentes, a primeira adoção da arquitetura modular deve satisfazer:

`comportamento atual = comportamento imediatamente após a migração`.

A configuração modular acrescenta uma camada de disponibilidade da unidade. Ela não substitui RBAC, plano, contexto operacional, state machines nem isolamento por `organization_id/store_id`.

## 2. Camadas de acesso já existentes

O acesso atual é formado por:

1. `organization_members`: vínculo do usuário com a organização e papel organizacional.
2. `user_store_roles`: papéis adicionais por unidade.
3. `roles` + `role_permissions` + `permissions`: RBAC autoritativo.
4. `AccessContext`: usuário, organização, unidade ativa e papel organizacional.
5. `SYSTEM_ROLE_CONTEXTS`: converte papéis em contexto operacional.
6. `CONTEXT_MODULE_PRIORITY`: classifica itens como `primary`, `secondary` ou `hidden`.
7. `NavigationAccessService`: cruza contexto operacional com permissões efetivas.
8. `authorize()` / `private.has_permission`: autorização server-side de ações/serviços.

**Contrato preservado:** módulo habilitado nunca significa permissão concedida.

## 3. Navegação atual por papel/contexto

A prioridade abaixo vem do modelo de navegação atual e continua sujeita às permissões reais do usuário.

| Papel | Contexto | Primários | Secundários relevantes |
|---|---|---|---|
| owner | management | Dashboard, Pedidos, Caixa, Financeiro | Estoque, Cardápio, Clientes, Crescimento, Fiscal, Compras, Equipe, Conversas, Salão, PDV, Produção, Entregas, Fornecedores, Escala, Configurações |
| manager | manager | Pedidos, Salão, Produção, Entregas | Dashboard, Caixa, PDV, Conversas, Estoque, Equipe, Clientes, Cardápio, Financeiro, Compras, Escala, Configurações |
| cashier | cashier | PDV, Caixa, Pedidos | Clientes, Conversas, Salão, Dashboard |
| attendant | service | Conversas, Pedidos, Clientes | PDV, Entregas, Cardápio, Dashboard, Salão |
| waiter | floor | Salão, Pedidos | Clientes, Cardápio, PDV |
| kitchen | kitchen | Produção | Pedidos |
| driver | delivery | Meu roteiro | Entregas, Pedidos |
| financial | administrative | Cardápio, Estoque, Compras, Fornecedores, Fiscal, Configurações | Financeiro, Equipe, Escala, Clientes, Dashboard, Crescimento |

### Gap pré-existente identificado

O modelo de navegação declara `team -> /equipe`, porém o inventário atual de `src/app/(app)` não possui uma página top-level `/equipe`. Este é um gap já existente e **não será mascarado pela arquitetura modular**; deve ser tratado em trabalho próprio ou no ciclo de equipe correspondente.

## 4. Matriz das superfícies autenticadas atuais

| Rota/superfície | Capacidade | Módulo | Permissões de navegação | Perfil semântico atual | Dependências/observações |
|---|---|---|---|---|---|
| `/dashboard` | resumo | dashboard | `dashboard.view` | genérico | shell/contexto |
| `/pedidos`, `/pedidos/[id]` | pedidos | orders | `orders.view` | compartilhável | núcleo operacional, realtime em fluxos associados |
| `/cardapio/*` | catálogo | catalog | `products.view` | label restaurante | categorias, produtos e adicionais; reutilizável como Catálogo |
| `/pdv` | venda direta | pdv | `orders.create` | compartilhável | depende de Pedidos + Catálogo |
| `/caixa` | caixa | cash | `cash.view` ou `cash.open` | compartilhável | sessão aberta é blocker de desligamento |
| `/salao`, `/salao/[tableId]` | mesas/comandas | dining | `dining.view` ou `orders.view` | **restaurante-específico** | `tabs`, mesas, waiter/table_qr |
| `/producao` | fulfillment | production | `orders.view` | apresentação restaurante | board pode ser reutilizado; vocabulário precisa abstração |
| `/entregas` | logística | deliveries | `delivery.view` ou `orders.view` | compartilhável | depende de Pedidos |
| `/entregador` | execução logística | driver | `delivery.view` ou `orders.view` | compartilhável | depende de Entregas |
| `/clientes`, `/clientes/[id]` | CRM | customers | `customers.view` | compartilhável | núcleo reutilizável |
| `/conversas` | atendimento | conversations | `conversations.view` | compartilhável | WhatsApp/Realtime quando configurados |
| `/estoque` | estoque | inventory | `inventory.view` | compartilhável | saldo/movimentos |
| `/estoque/fichas` | fichas/receitas | inventory | `inventory.view`/recipes | **restaurante-específico** | não deve virar requisito de gás/genérico |
| `/fornecedores` | fornecedores | suppliers | `suppliers.view` | compartilhável | suprimentos |
| `/compras` | compras | purchases | `purchases.view` | compartilhável | usa Estoque + Fornecedores |
| `/financeiro` | financeiro | finance | `finance.view` ou `reports.view` | compartilhável | domínio financeiro autoritativo preservado |
| `/fiscal` | fiscal | fiscal | `fiscal.view` | compartilhável | integração fiscal; não alterar regras legais por perfil |
| `/crescimento` | fidelidade/campanhas | growth | `growth.view` | compartilhável | usa clientes/pedidos como fonte de dados |
| `/escala` | escala | scale | `scale.view` | compartilhável | administração de equipe |
| `/configuracoes` | configuração base | settings | permissões administrativas existentes | genérico | núcleo não desativável |
| `/configuracoes/cardapio` | config. catálogo | catalog/settings | produtos/configuração | restaurante no texto | cross-link entre shell e módulo |
| `/configuracoes/caixa` | config. caixa | cash/settings | caixa | compartilhável | cross-link |
| `/configuracoes/conversas` | config. conversas | conversations/settings | integrações/conversas | compartilhável | cross-link |
| `/configuracoes/entrega` | config. entrega | deliveries/settings | entrega | compartilhável | cross-link |
| `/configuracoes/entregadores` | config. entregadores | driver/settings | entrega | compartilhável | cross-link |
| `/configuracoes/salao` | config. salão | dining/settings | salão | **restaurante-específico** | cross-link |
| `/configuracoes/horarios` | horários | settings | administrativa | compartilhável | infraestrutura operacional da unidade |
| `/configuracoes/pagamentos` | pagamentos | settings/core | pagamentos | compartilhável | pagamento é capacidade do core, não toggle destrutivo |
| `/configuracoes/impressoes` | impressão | settings | printing | compartilhável | integração; futura exposição modular pode ser refinada |
| `/acesso-negado` | segurança | shell/core | — | genérico | não é módulo comercial |

## 5. Superfícies públicas e de entrada relevantes

| Rota | Papel no sistema | Relação modular futura |
|---|---|---|
| `/login`, `/cadastro`, `/nova-senha`, `/auth/*`, `/convite/*` | autenticação/acesso | core, nunca condicionado a módulo da unidade |
| `/onboarding` | criação inicial | hoje empresa+unidade; será evoluído por [358] |
| `/m/[slug]` | vitrine/cardápio público | Catálogo + configuração pública |
| `/m/[slug]/produto/[id]` | produto público | Catálogo |
| `/m/[slug]/carrinho` | carrinho | Catálogo/Pedidos |
| `/m/[slug]/checkout` | checkout | Pedidos, pagamentos, fulfillment |
| `/m/[slug]/pedido/[id]` | acompanhamento | Pedidos/fulfillment |
| `/m/[slug]/pedido/[id]/acesso` | token/acesso ao acompanhamento | segurança do core |
| `/mesa/[code]/*` | jornada de mesa/QR | dining; restaurante-específica |
| `/platform/*` | Painel do Proprietário | plataforma, fora dos módulos da unidade; pode diagnosticar módulos depois |

APIs, webhooks e jobs não devem ser desligados apenas porque uma página some. Cada worker/webhook precisa de contrato explícito quando [357]–[369] integrarem a nova resolução.

## 6. Assunções de restaurante catalogadas

| Assunção | Tipo | Decisão |
|---|---|---|
| “Cardápio” | label/apresentação | chave interna continua `catalog`; perfil Gás usa “Catálogo” |
| “Produção”, contexto `kitchen` | apresentação + operação | auditar fulfillment antes de mudar state machine; Gás pode usar “Separação” |
| Salão | domínio específico | módulo `dining`, suportado inicialmente apenas por `restaurant` |
| Mesas/comandas/tabs | domínio específico | permanecem em `dining` |
| canais `waiter` e `table_qr` | regra de domínio | permanecem restaurante-específicos |
| fulfillment `table` | regra de domínio | não generalizar para Gás |
| fichas/receitas | domínio específico | continuam sob Estoque, sem virar requisito genérico |
| adicionais/modificadores | parcialmente gastronômico | Catálogo base é compartilhável; UI específica será revista no perfil |

## 7. Efeitos colaterais e dados que nunca são apagados por toggle

Os módulos apontam para domínios persistentes como Pedidos, Caixa, Salão, Entregas, Estoque, Compras, Financeiro, Fiscal, Conversas e Crescimento. A desativação modular **não executa DELETE, não corrige ledger e não força transições de state machine**.

Blockers confirmados no schema atual:
- `cash`: `cash_sessions.status = 'open'`;
- `dining`: `tabs.status in ('open','settling')`;
- `deliveries`/`driver`: entrega sem `delivered_at` e sem `canceled_at`.

Outros blockers só devem ser adicionados com evidência do domínio real.

## 8. Planos/entitlements existentes

O PedeAqui já possui `features`, `plan_features`, assinaturas, contadores de uso e `organization_entitlement_internal`, consumidos por `EntitlementService`. A arquitetura modular **não cria um segundo entitlement engine**.

No catálogo modular v1, `entitlementFeatureKey` é uma ponte opcional. Onde não há mapeamento comercial aprovado, permanece `null`, isto é: o novo toggle não inventa limitação de plano. O mapeamento completo pertence a [366].

## 9. Baseline de rollout

A migration [354] faz backfill de todas as chaves atuais como `enabled=true` para unidades existentes e marca perfil `restaurant`. A nova resolução não é conectada à navegação neste lote. Isso mantém o baseline intacto até [357] e o rollout controlado de [367].
