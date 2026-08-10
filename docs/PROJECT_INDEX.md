# Cruz — Índice Mestre do Projeto

Este diretório é a fonte oficial de decisões, arquitetura, escopo e backlog do projeto Cruz.

## Objetivo do produto

Construir um SaaS multiempresa/multiunidade para restaurantes e operações de alimentação, centralizando cardápio digital, pedidos, PDV, produção/KDS, impressão, salão, delivery, pagamentos, caixa, clientes/CRM, fidelidade, estoque, compras, financeiro, fiscal, relatórios, marketing e integrações.

## Princípio central

O sistema não será um conjunto de telas isoladas. As entidades de domínio serão compartilhadas e os módulos conversarão por regras de negócio e eventos.

Exemplo:

`order.completed` → estoque → financeiro → CRM → fidelidade → analytics/notificações.

## Documentos

- `BLUEPRINT_MASTER.md` — visão completa do produto, módulos, entidades, fluxos e fases.
- `IMPLEMENTATION_BACKLOG.md` — backlog técnico Fase 0 + Fase 1 e sequência executável.
- `PRINTING_SYSTEM.md` — arquitetura profissional de impressão, filas, estações, roteamento e contingência.
- `ARCHITECTURE_DECISIONS.md` — decisões técnicas e regras que não podem ser quebradas sem ADR explícita.
- `INFRASTRUCTURE.md` — ambientes e limites de infraestrutura, inclusive banco que não deve receber esta fundação.
- `FOUNDATION_STATUS.md` — status da implementação #001–#016 (presente na branch/PR de fundação enquanto não for mesclada).

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

## Estado atual

- Blueprint: definido.
- Fase 0 + Fase 1: definida.
- Impressão: promovida a subsistema estrutural.
- Issues #001–#016: criadas no GitHub.
- Fundação: implementada no draft PR #17, com CI de código verde; validação de banco real permanece pendente.
- Banco: o projeto Supabase existente chamado Cruz pertence a outro sistema de agenda e não deve receber automaticamente esta fundação; ver `INFRASTRUCTURE.md`.
