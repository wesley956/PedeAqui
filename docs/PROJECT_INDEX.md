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
- `FOUNDATION_STATUS.md` — status da implementação #001–#016 na branch/PR de fundação.
- `CATALOG_STATUS.md` — status do catálogo #017–#024 na branch/PR de catálogo.
- `MENU_STATUS.md` — status #025–#032 na branch/PR de cardápio e clientes.

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
- Impressão: subsistema estrutural.
- Fundação #001–#016: implementada no draft PR #17; schema aplicado no Supabase oficial.
- Catálogo #017–#024: implementado no draft PR #26; CI verde e schema aplicado no Supabase oficial.
- Cardápio/Clientes #025–#032: implementado no draft PR #35; CI verde e migrations aplicadas.
- Cardápio público disponível em arquitetura via `/m/:slug` e produto via `/m/:slug/produto/:id`.
- Supabase `zsbsczjhiujnhdznrzck`: dedicado ao PedeAqui; Security Advisor com zero alertas após as migrations atuais.
- Arte original da logo PedeAqui localizada na File Library; binário ainda não exportável pelo conector atual. Tokens e identidade oficial registrados em `BRAND_IDENTITY.md`.
- Próximo bloco lógico: #033–#035 — endereços e configuração inicial de entrega; depois #036–#040 — carrinho e PricingService.
