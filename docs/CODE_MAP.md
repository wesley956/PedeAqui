# Mapa do código do PedeAqui

Conferido no snapshot `e67f1e99`, em 11/10/2026. Caminhos descrevem o checkout real; alguns documentos antigos ainda mostram a estrutura inicial com `src/services` e `src/domain`, que não existem nesse snapshot.

## Camadas

| Caminho | Responsabilidade |
| --- | --- |
| `src/app` | App Router, layouts, páginas e Route Handlers |
| `src/app/(app)` | Superfícies autenticadas do painel |
| `src/app/m`, `src/app/mesa` | Entradas públicas de cardápio e mesa |
| `src/app/platform` | Plataforma/administração |
| `src/app/api` | APIs, integrações, impressão e jobs internos |
| `src/features` | Interfaces, ações e modelos por funcionalidade |
| `src/server` | Regras, serviços, autorização e persistência |
| `src/server/auth`, `src/server/access` | Contexto de autenticação e autorização |
| `src/server/events`, `src/server/idempotency`, `src/server/audit` | Eventos, prevenção de duplicidade e trilha de auditoria |
| `src/components/ui` | Primitives reutilizáveis de interface |
| `src/lib/supabase` | Clientes browser, SSR, público e admin server-only |
| `src/modules` | Infraestrutura modular |
| `src/proxy.ts` | Interceptação/sessão; não substitui autorização nos serviços |
| `public/brand` | Assets canônicos da marca |

## Pontos de entrada por tarefa

| Fluxo | Onde começar |
| --- | --- |
| PDV e barra de finalização | `src/features/pdv/pos-shell.tsx`, `pdv.module.css`, `payment-draft.ts`, `actions.ts`; regras em `src/server/pdv` |
| Pedidos e estados | `src/features/orders`, `src/server/orders/order-service.ts`, `state-machines.ts` |
| Finalização rápida | `src/server/orders/order-quick-finish-service.ts`, `order-manager-lifecycle-router.ts` |
| Cardápio/carrinho/checkout | `src/features/menu`, `cart`, `checkout` e os domínios correspondentes em `src/server` |
| Cozinha e salão | `src/features/kitchen`, `dining`; `src/server/kitchen`, `dining` |
| Pagamentos e caixa | `src/server/payments`, `cash`; interface em `src/features/payments`, `cash` |
| Impressão | `src/features/printing`, `src/server/printing`, `print-agent/src` |
| Delivery | `src/features/delivery`, `src/server/delivery`, entradas de entregador em `src/app` |
| Catálogo/adicionais | `src/features/catalog`, `src/server/catalog` |
| WhatsApp/integrações | `src/server/integrations`, `conversations`, `src/features/integrations`, `conversations` |
| Planos/plataforma | `src/server/billing`, `platform`, `src/features/platform-*` |
| Estoque/compras/financeiro/fiscal | `src/server/inventory`, `purchases`, `finance`, `fiscal` e interfaces correspondentes |

Os domínios compartilham eventos, mas pedidos não substituem ledger financeiro, saldo de estoque ou documento fiscal. Preserve as fontes de verdade de cada domínio.

## Banco e ferramentas

- `supabase/sql`: sequência SQL canônica com convenções históricas, inspecionada pelo drift checker.
- `supabase/migrations`: migrações versionadas adicionais; não presumir que sozinhas recriam todo o banco.
- `supabase/production-migrations.json` + `production-migrations-tail.json`: snapshot histórico remoto combinado pelo checker.
- `supabase/tests`: verificações SQL; várias usam fixtures e não devem ser executadas indiscriminadamente no banco de uma loja.
- `scripts/check-route-integrity.mjs`, `check-db-drift.mjs`, `production-preflight.mjs`: verificações com comandos em package.json.
- `tests`: Vitest; 409 arquivos no snapshot, quantidade sujeita a mudança.
- `.github/workflows/ci.yml`: gates de integração.
- `.github/workflows/browser-homologation.yml`: trilha de navegador.
- `.github/workflows/isolated-chaos.yml`: trilha isolada de banco/concorrência.
- `github-pages`: site estático de apresentação; não confundir com a aplicação.

## Documentos a consultar conforme a mudança

- UI/marca: `BRAND_IDENTITY.md`, `DESIGN_TOKENS.md`, `STRUCTURAL_TOKENS.md` e documentos do componente.
- Pedidos/PDV: `PDV_STATUS.md`, `ORDER_MANAGER_STATUS.md` e revisões recentes em `reviews/`.
- Impressão: `../print-agent/README.md`, `PRINTING_SYSTEM.md`.
- Segurança/domínios: `ARCHITECTURE_DECISIONS.md`, `adr/`, `security/`, `intelligence/SOURCE_OF_TRUTH_MATRIX.md`.
- Índice histórico e outros módulos: `PROJECT_INDEX.md`.

Nomes de diretório na tabela são relativos à raiz do repositório; nomes de documentos neste último bloco são relativos a `docs/`.
