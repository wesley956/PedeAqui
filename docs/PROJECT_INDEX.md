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
- Fundação #001–#016: implementada no draft PR #17; schema aplicado no Supabase oficial.
- Catálogo #017–#024: implementado no draft PR #26; CI verde e schema aplicado.
- Cardápio/Clientes #025–#032: implementado no draft PR #35; CI verde e migrations aplicadas.
- Endereços/Entrega #033–#035: implementado no draft PR #39; CI verde e migrations aplicadas.
- Carrinho/Pricing #036–#040: implementado no draft PR #47; CI verde e migrations aplicadas.
- Checkout #041–#046: implementado no draft PR #54; CI verde e migrations aplicadas.
- Motor de Pedidos #047–#057: implementado no draft PR #66; CI verde no run #27 e migrations aplicadas.
- Central Profissional de Impressão #058–#082: implementada na branch `agent/printing-058-082`; schema/fila/roteamento/Print Agent aplicados no Supabase oficial e validação de CI pendente neste head.
- Impressão usa `production_stations`, `printers`, `station_printers`, `product_production_stations`, `print_agents` e `print_jobs` com RLS e integridade multiempresa.
- `order.confirmed` gera jobs por trigger na mesma transação da confirmação; roteamento de produção é por produto→estação e expedição/balcão usam o pedido completo.
- A fila usa claim concorrente com lease e `SKIP LOCKED`, retry com backoff, fallback, cópias, idempotência lógica e jobs falhos persistentes.
- Reimpressão sempre cria novo job marcado, exige motivo e grava auditoria/evento transacionalmente.
- Print Agent possui credencial própria com apenas o hash armazenado no banco; `service_role` nunca vai para o computador da loja.
- MVP do agente usa Node.js, spool local e ESC/POS TCP para 58/80 mm; USB/Bluetooth/spool de sistema ficam atrás do mesmo contrato.
- A entrega física é tratada como at-least-once; exatamente-uma-vez é garantido apenas para a intenção/job lógico, pois impressoras comuns não participam da transação do banco.
- Supabase `zsbsczjhiujnhdznrzck`: Security Advisor com zero alertas após as migrations de impressão.
- Banco oficial ainda sem organização/usuário/pedido real; primeiro teste ponta a ponta e teste de hardware permanecem para ambiente operacional.
- Próximo bloco lógico: #083–#092 — Gestor de Pedidos.
