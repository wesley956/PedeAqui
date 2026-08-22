# PedeAqui — baseline de prontidão comercial em 22/08/2026

Este documento registra as evidências das issues `PA-DIAG-001`–`PA-DIAG-005`
(GitHub #540–#544). Ele complementa o baseline histórico [323] sem substituí-lo.

## 1. Identificação congelada no início do ciclo

| Item | Estado verificado |
| --- | --- |
| Repositório | `wesley956/PedeAqui` |
| Branch de trabalho | `codex/presentation-readiness-20260822` |
| `origin/main` inicial | `9240fd885daa27983562bed7aa8a4c0774e09e0b` |
| Domínio público canônico | `https://www.pedeaqui.pp.ua` |
| Redirecionamento | `https://pedeaqui.pp.ua` redireciona para `www` |
| URL antiga Vercel | `pedeaqui-cruzjade080-4490s-projects.vercel.app` exige Vercel SSO; não usar na apresentação |
| Supabase | projeto `zsbsczjhiujnhdznrzck`, `ACTIVE_HEALTHY`, `sa-east-1`, PostgreSQL 17 |
| Banco | 116 migrations de produção; prontidão do cardápio público aplicada em 22/08/2026 |
| Aplicação | Next.js 16.2.12, React 19.2.8, Node >= 22 |

O conector Vercel disponível lista o time, mas não enxerga projetos. O domínio público e
`/api/health` respondem normalmente pela internet; logs, configuração e deployment ID
continuam bloqueados até a conta Vercel que possui o projeto ser conectada.

## 2. Sinais live sem dados pessoais

Consulta somente de leitura em 22/08/2026:

- 8 organizações e 8 unidades ativas;
- 1 unidade marcada como demonstração;
- 1 platform admin ativo;
- 3 planos e 7 features técnicas;
- 0 assinaturas comerciais cadastradas;
- 168 configurações de módulos (21 por unidade);
- 23 produtos e 4 pedidos no ambiente;
- RLS habilitado em todas as tabelas públicas listadas pelo conector.

O health check público confirmou a presença das quatro configurações de runtime esperadas
sem expor seus valores. O Security Advisor não apontou tabela pública com RLS desligado;
há avisos informativos para tabelas intencionalmente fechadas sem policy e o aviso
administrativo conhecido de proteção de senhas vazadas. O Performance Advisor mantém
pendências de índices que pertencem ao lote de desempenho.

## 3. Baseline de qualidade local

| Gate | Resultado |
| --- | --- |
| Testes | 150 arquivos, 897 testes aprovados |
| E2E contextual | 1 arquivo, 7 testes aprovados |
| TypeScript | aprovado, zero erro |
| ESLint | zero erro e 4 warnings |
| Build Next.js | aprovado, 66 superfícies reportadas pelo build |
| Rotas no código | 74 pages + 13 route handlers |
| Server Actions | 35 arquivos de actions |
| Serviços de servidor | 152 arquivos em `src/server` |
| Drift local | 116 migrations alinhadas ao snapshot de produção |
| Preflight estático | Server Actions 16 MiB; imagens limitadas a 4 MiB na aplicação e 5 MiB no bucket |

Warnings atuais: três usos de `<img>` fora do pipeline `next/image` e uma variável não
utilizada em `recipe-form.tsx`. Não bloqueiam o build, mas entram no diagnóstico visual e
de desempenho.

## 4. Inventário completo das superfícies

### Entrada, autenticação e páginas públicas

`/`, `/login`, `/cadastro`, `/recuperar-senha`, `/nova-senha`, `/convite`, `/onboarding`,
`/privacidade`, `/acesso-entregador`, `/primeiro-acesso-entregador`, `/auth/callback`.

### Painel autenticado do estabelecimento

`/acesso-negado`, `/recurso-indisponivel`, `/dashboard`, `/pedidos`, `/pedidos/[id]`,
`/cardapio/categorias`, `/cardapio/produtos`, `/cardapio/produtos/novo`, `/cardapio/produtos/[id]`,
`/cardapio/adicionais`, `/pdv`, `/caixa`, `/salao`, `/salao/[tableId]`, `/producao`,
`/entregas`, `/entregador`, `/clientes`, `/clientes/[id]`, `/conversas`, `/estoque`,
`/estoque/fichas`, `/fornecedores`, `/compras`, `/financeiro`, `/fiscal`, `/crescimento`,
`/escala`, `/vasilhames`, `/equipe`, `/configuracoes`, `/configuracoes/cardapio`,
`/configuracoes/caixa`, `/configuracoes/conversas`, `/configuracoes/entrega`,
`/configuracoes/entregadores`, `/configuracoes/horarios`, `/configuracoes/impressoes`,
`/configuracoes/modulos`, `/configuracoes/pagamentos`, `/configuracoes/salao`.

O gap inicial de `team` foi encerrado no lote PA-DIAG-011–015 com a criação de `/equipe`.

### Cardápio, checkout e acompanhamento públicos

`/m/[slug]`, `/m/[slug]/produto/[id]`, `/m/[slug]/carrinho`, `/m/[slug]/checkout`,
`/m/[slug]/pedido/[id]`, `/m/[slug]/pedido/[id]/acesso`, `/mesa/[code]`.

### Painel do Proprietário

`/platform`, `/platform/demo`, `/platform/novo-restaurante`, `/platform/assinaturas`,
`/platform/alertas`, `/platform/incidentes`, `/platform/integracoes`,
`/platform/integridade`, `/platform/operacao`, `/platform/operacao/pedidos/[orderId]`,
`/platform/suporte`, `/platform/suporte/modo`, `/platform/restaurantes/[storeId]`,
`/platform/unidades/[storeId]`,
`/platform/empresas/[organizationId]/unidades/[storeId]`,
`/platform/unidades/[storeId]/whatsapp`,
`/platform/unidades/[storeId]/whatsapp/notificacoes`.

### APIs, webhooks e agentes

`/api/health`, `/api/internal/order-notifications`, `/api/print-agent/ack`,
`/api/print-agent/claim`, `/api/print-agent/config`, `/api/print-agent/fail`,
`/api/print-agent/heartbeat`, `/api/webhooks/billing/[providerKey]`,
`/api/webhooks/fiscal/[integrationId]`,
`/api/webhooks/payments/mercado-pago/[storeId]`, `/api/webhooks/whatsapp`.

## 5. Catálogo modular e classificação inicial

| Módulo | Tipo | Dependências | Estado inicial de prontidão |
| --- | --- | --- | --- |
| `dashboard` | core | — | implementado e testado |
| `orders` | core | — | implementado e testado |
| `conversations` | opcional | — | implementado; canal WhatsApp real precisa homologação |
| `dining` | segmentado | `orders`, `catalog` | implementado para restaurante |
| `catalog` | core | — | implementado; limite de foto corrigido para o transporte da Vercel |
| `pdv` | opcional | `orders`, `catalog` | implementado e testado |
| `cash` | opcional | `orders` | implementado e testado |
| `finance` | opcional | — | financeiro do restaurante implementado |
| `fiscal` | opcional | `orders` | contrato implementado; provider real não homologado |
| `production` | opcional | `orders` | implementado e testado |
| `deliveries` | opcional | `orders` | implementado e testado |
| `driver` | opcional | `deliveries` | implementado, incluindo telefone + PIN |
| `inventory` | opcional | — | implementado; sem massa operacional live |
| `gas_containers` | segmentado | `orders`, `catalog` | implementado, desligado nas 8 unidades |
| `suppliers` | opcional | — | implementado; sem massa operacional live |
| `purchases` | opcional | `inventory`, `suppliers` | implementado; sem massa operacional live |
| `customers` | core | — | implementado e testado |
| `growth` | opcional | `customers`, `orders` | implementado; sem campanhas live |
| `scale` | opcional | — | implementado e testado |
| `team` | opcional | — | CRUD seguro implementado; aceite externo de convite ainda requer homologação |
| `settings` | core | — | implementado e testado |

Camadas obrigatórias de disponibilidade: perfil do negócio, flag da unidade, dependências,
entitlement do plano e RBAC. Uma camada nunca concede acesso no lugar de outra.

## 6. Papéis e permissões

| Papel | Contexto | Permissões distintas no banco |
| --- | --- | ---: |
| `owner` | gestão | 71 |
| `manager` | gerência | 70 |
| `attendant` | atendimento | 18 |
| `cashier` | caixa | 13 |
| `financial` | administrativo | 13 |
| `waiter` | salão | 7 |
| `kitchen` | produção | 3 |
| `driver` | entrega | 3 |

O Painel do Proprietário usa gate separado (`support` ou `super_admin`). O acesso global
não é derivado dos papéis de uma unidade, e ações comerciais/mutações cross-tenant exigem
`super_admin` no servidor.

## 7. Classificação funcional consolidada

- **Aprovado estaticamente:** build, tipos, testes, rotas, RBAC, módulos e baseline local.
- **Aprovado live:** domínio canônico, health, Supabase e cardápio público da demo.
- **Parcial:** catálogo com upload real, WhatsApp real, impressão física e desempenho live.
- **Estrutura pronta, sem operação:** billing SaaS possui tabelas/tela/state machine, mas zero assinatura.
- **Fornecedor pendente:** PIX online e fiscal não possuem configuração live comprovada.
- **Gap funcional encerrado:** `/equipe` implementa convite, leitura, suspensão e cancelamento auditado.
- **Bloqueio de observabilidade:** conta Vercel conectada não possui acesso ao projeto publicado.

## 8. Dados isolados

A política e a massa segura estão em `PRESENTATION_TEST_DATA_20260822.md`. Nenhuma
credencial, token, telefone ou informação pessoal foi adicionada ao repositório.
