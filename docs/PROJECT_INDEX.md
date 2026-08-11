# PedeAqui — Índice Mestre do Projeto

Este diretório é a fonte oficial de decisões, arquitetura, escopo e backlog do produto **PedeAqui**. O repositório técnico continua se chamando `cruz`.

## Objetivo do produto

Construir um SaaS multiempresa/multiunidade para restaurantes e operações de alimentação, centralizando cardápio digital, pedidos, PDV, produção/KDS, impressão, salão, delivery, pagamentos, caixa, clientes/CRM, fidelidade, estoque, compras, financeiro, fiscal, relatórios, marketing e integrações.

## Princípio central

O sistema não será um conjunto de telas isoladas. As entidades de domínio serão compartilhadas e os módulos conversarão por regras de negócio e eventos.

Exemplo:

`order.completed` → estoque → financeiro → CRM → fidelidade → analytics/notificações.

## Identidade oficial

- Nome: **PedeAqui**
- Tagline: **Seu pedido começa aqui.**
- Paleta-base: laranja + grafite
- Especificação: `BRAND_IDENTITY.md`

## Documentos

- `BLUEPRINT_MASTER.md` — visão completa do produto, módulos, entidades, fluxos e fases.
- `IMPLEMENTATION_BACKLOG.md` — backlog técnico Fase 0 + Fase 1 e sequência executável.
- `PRINTING_SYSTEM.md` — arquitetura profissional de impressão, filas, estações, roteamento e contingência.
- `ARCHITECTURE_DECISIONS.md` — decisões técnicas e regras que não podem ser quebradas sem ADR explícita.
- `INFRASTRUCTURE.md` — backend oficial e histórico de reset do Supabase.
- `BRAND_IDENTITY.md` — nome, cores, tagline e regras de identidade.
- `FOUNDATION_STATUS.md` — status #001–#016.
- `CATALOG_STATUS.md` — status #017–#024.
- `MENU_STATUS.md` — status #025–#032.
- `DELIVERY_STATUS.md` — status #033–#035.
- `CART_STATUS.md` — status #036–#040.
- `CHECKOUT_STATUS.md` — status #041–#046.
- `ORDER_ENGINE_STATUS.md` — status #047–#057.
- `PRINTING_STATUS.md` — status #058–#082.
- `ORDER_MANAGER_STATUS.md` — status #083–#091.
- `KITCHEN_STATUS.md` — status #092–#095.

## Ordem macro

1. Fundação
2. Catálogo
3. Cardápio público
4. Cliente e entrega
5. Carrinho e pricing
6. Checkout
7. Motor de pedidos
8. Central de impressão
9. Gestor de pedidos
10. Produção
11. Pagamentos
12. PDV
13. Clientes/dashboard
14. Qualidade e hardening
15. Salão
16. CRM/marketing
17. WhatsApp/IA
18. Estoque/compras/financeiro
19. Fiscal e integrações
20. Escala/white-label

## Regra de consulta

Antes de criar um novo módulo, responder:

1. Que entidade existente ele utiliza?
2. Que eventos ele consome?
3. Que eventos ele produz?
4. Quais permissões precisa?
5. Quais dados pertencem à organização e à unidade?
6. Quais ações precisam de auditoria?

## Estado atual — 10/08/2026

- Blueprint: definido.
- Identidade: PedeAqui, laranja + grafite.
- Fundação #001–#016: consolidada no `main`.
- Catálogo #017–#024: consolidado no `main`; schema aplicado no Supabase oficial.
- Cardápio/Clientes #025–#032: consolidado no `main`; migrations aplicadas.
- Endereços/Entrega #033–#035: consolidado no `main`; migrations aplicadas.
- Carrinho/Pricing #036–#040: consolidado no `main`; migrations aplicadas.
- Checkout #041–#046: consolidado no `main`; migrations aplicadas.
- Motor de Pedidos #047–#057: consolidado no `main`; migrations aplicadas.
- Central Profissional de Impressão #058–#082: consolidada no `main`; CI verde e migrations aplicadas.
- Gestor de Pedidos #083–#091: consolidado no `main` pelo PR #102; CI final run #52 verde e workflow operacional aplicado no Supabase.
- Produção/KDS #092–#095: em implementação na branch `agent/kds-092-095`; issues GitHub #103–#106.
- `/pedidos` é o Kanban operacional realtime derivado dos quatro ciclos independentes — não existe mega-status persistido para as colunas.
- `/pedidos/[id]` integra itens, cliente/endereço, quatro estados, histórico, fulfillment e vias da Central Profissional de Impressão com reimpressão auditada.
- `/producao` projeta pedidos confirmados e itens por `production_stations`/`product_production_stations`, com filtro por estação, tempo decorrido e destaque de atraso.
- O KDS não cria estado paralelo. `production_status` continua global ao pedido; por segurança, o bloco #092–#095 não simula conclusão independente por estação.
- Limiares iniciais do KDS: atenção aos 12 min e atraso aos 20 min, derivados no cliente a partir de `confirmed_at`/`created_at`, sem escrita periódica no banco.
- Supabase `zsbsczjhiujnhdznrzck`: nenhuma nova tabela/RPC/policy foi necessária para o KDS; ele reutiliza RLS/RBAC e Realtime já existentes.
- Banco oficial ainda sem organização/usuário/pedido real; testes ponta a ponta e hardware permanecem para o primeiro ambiente operacional real.
- Próximo bloco lógico após o KDS: #096–#101 — Pagamentos.
