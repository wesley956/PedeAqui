# PedeAqui — CRM e Crescimento [140]–[151]

## Objetivo

Implementar a Fase 4 do blueprint sem acoplar fidelidade, campanhas ou automações ao endpoint de pedido. O motor de crescimento reutiliza clientes, carrinho, pedidos e eventos existentes, mantém ledgers próprios para cashback/pontos e deixa provedores de WhatsApp/e-mail para o próximo milestone.

## Escopo oficial

- [140] Cupons e elegibilidade — #157.
- [141] Cupom no pricing autoritativo — #158.
- [142] Cashback accounts/transactions — #159.
- [143] Acúmulo e resgate de cashback — #160.
- [144] Loyalty accounts/transactions — #161.
- [145] Regras de pontos — #162.
- [146] Segmentação dinâmica — #163.
- [147] Campaigns — #164.
- [148] Campaign recipients — #165.
- [149] Automation rules/runs — #166.
- [150] Painel CRM/crescimento — #167.
- [151] Consumidor idempotente de `order.completed` — #168.

Branch: `agent/crm-growth-140-151`. PR: #169.

## Banco de dados

Migrations aplicadas no Supabase oficial:

- `growth_core_140_151` → `38_growth_core.sql`.
- `growth_operations_140_151` → `39_growth_operations.sql`.
- `growth_pdv_140_151` → `40_growth_pdv.sql`.
- `growth_campaigns_automations_140_151` → `41_growth_campaigns_automations.sql`.
- `growth_cart_refresh_140_151` → `42_growth_cart_refresh.sql`.
- `growth_private_execution_grants_140_151` → `43_growth_private_execution_grants.sql`.

Entidades novas:

- `store_growth_settings`.
- `coupons` / `coupon_redemptions`.
- `cashback_accounts` / `cashback_transactions`.
- `loyalty_accounts` / `loyalty_transactions`.
- `customer_segments`.
- `campaigns` / `campaign_recipients`.
- `automation_rules` / `automation_runs`.

## Regras de domínio

1. Cashback e pontos usam ledger auditável + saldo projetado na conta, atualizados na mesma transação.
2. Débitos usam `FOR UPDATE`; saldo nunca pode ficar negativo.
3. Idempotency keys impedem ganho/resgate duplicado.
4. Cupom é bloqueado e revalidado no momento de converter/criar o pedido.
5. `discount_cents = cupom + cashback + pontos`; benefício nunca reduz taxa de entrega.
6. Carrinho repriced revalida os benefícios; se ficaram inválidos, eles são limpos e o total normal é restaurado.
7. Rejeição/cancelamento libera cupom e gera transações compensatórias para cashback/pontos.
8. `order.completed` gera cashback/pontos somente uma vez e sem acoplar `OrderService` às regras de fidelidade.
9. Pedido coberto 100% por benefício pode ter total zero, `payment_status=paid` e nenhuma linha monetária de pagamento.
10. PDV antigo permanece compatível; a RPC antiga é wrapper da RPC Growth-aware sem benefício.
11. Segmentos são dinâmicos; campanhas congelam um snapshot de recipients.
12. Automações criam `automation_run` idempotente antes de executar bônus/campanha.
13. Provedores WhatsApp/e-mail não fazem parte deste módulo; `campaign.channel` só prepara a arquitetura/adaptadores futuros.

## Integração de canais

### Checkout público

- cupom, cashback e pontos aparecem antes da revisão final;
- cashback/pontos só ficam disponíveis quando o carrinho já está ligado a cliente conhecido;
- o servidor revalida tudo novamente na criação do pedido;
- se benefício/preço mudou, exige nova revisão.

### PDV

- caixa vê cupons ativos, cashback e pontos do cliente;
- cálculo visual serve apenas para montar a venda/parcela;
- PostgreSQL recalcula produto, adicionais e benefícios na transação;
- vendas com desconto total zero são suportadas sem criar payment de R$0.

### Painel autenticado `/crescimento`

- configurações de cashback/pontos;
- criação/lista de cupons;
- saldos de clientes;
- segmentos;
- campanhas e preparação de público;
- regras de automação e execuções recentes;
- execução manual da rotina diária de aniversário/inatividade.

## E2E PostgreSQL real com rollback

### Checkout + benefícios

Subtotal R$ 100,00:
- cupom: R$ 20,00;
- cashback: R$ 10,00;
- 100 pontos × R$ 0,10: R$ 10,00;
- desconto total: R$ 40,00;
- total final: R$ 60,00.

Após conclusão:
- pedido `completed` e pagamento `paid`;
- cupom `consumed`;
- cashback inicial R$ 30,00 → R$ 20,00 após resgate → R$ 26,00 após ganhar R$ 6,00;
- pontos 500 → 400 após resgate → 460 após ganhar 60.

### Compensação e zero-total

- pedido rejeitado devolveu integralmente cashback e pontos usados e liberou o cupom;
- cupom de 100% criou pedido total R$ 0,00, `paid`, sem payment row.

### PDV Growth

- subtotal R$ 100,00 → cupom R$ 20,00 + cashback R$ 10,00 + 50 pontos/R$ 5,00 → total R$ 65,00;
- idempotency retry devolveu o mesmo pedido sem novo débito;
- cupom anônimo funcionou com `customer_id` nulo quando não havia limite por cliente;
- cupom de 100% criou venda PDV total zero sem payment row, já confirmada e em produção.

### Segmentação/campanhas/automações

- segmento por `orders_count >= 1` e gasto mínimo retornou somente o comprador elegível;
- campanha congelou exatamente 1 recipient do segmento;
- 3 automações `order.completed` (cashback, pontos e campanha) terminaram `completed`;
- rotina agendada de aniversário/inatividade processou 2 clientes na primeira chamada e 0 na repetição da mesma data;
- idempotência diária e por pedido confirmada.

Todos os cenários foram revertidos por rollback e não deixaram fixtures.

## Segurança final

- Security Advisor: **0 alertas** após as migrations 38–43.
- 12/12 tabelas Growth com RLS habilitada.
- `anon`: 0 privilégios diretos nas tabelas Growth.
- `authenticated`: 0 privilégios de mutação nas tabelas Growth.
- Todas as RPCs públicas internas Growth auditadas: `service_role=true`, `authenticated=false`, `anon=false` para EXECUTE.
- Todos os helpers privados necessários auditados: `service_role=true`, `authenticated=false`, `anon=false` para EXECUTE.
- `service_role` possui `USAGE` explícito no schema `private` apenas para viabilizar a cadeia `SECURITY INVOKER`; migration 43 documenta os grants mínimos.
- Auditoria de resíduos após todos os E2Es: 0 usuários, organizações, lojas, clientes, pedidos, cupons, campanhas, automation runs e transações de recompensa de teste.

## Testes automatizados

`tests/growth.test.ts` cobre:

- RLS/ACL;
- ledgers assinados e idempotentes;
- locks de cupom/contas;
- checkout e total zero;
- transações compensatórias;
- consumidor `order.completed`;
- compatibilidade PDV;
- campanhas/automações;
- refresh do carrinho;
- privilege chain dos helpers privados;
- projeção de cupom + cashback + pontos no PDV.

CI final validado no run #108: lint, TypeScript, testes, validação do Print Agent e build de produção verdes.

## Limites conscientes

- Campanhas `whatsapp` e `email` ainda não enviam para provedores externos; isso pertence ao próximo milestone de Conversas/WhatsApp/IA.
- Expiração de cashback/pontos possui campo de validade no ledger, mas um executor periódico de expiração física pode ser refinado junto da infraestrutura de jobs.
- Reembolso pós-conclusão ainda exigirá evento/compensação explícita quando o módulo de refund/fiscal for expandido; nunca deve apagar ledger histórico.
