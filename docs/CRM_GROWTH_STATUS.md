# PedeAqui — CRM e Crescimento [140]–[151]

## Objetivo

Implementar a Fase 4 do blueprint sem acoplar benefícios, campanhas ou automações ao endpoint de pedido. O motor de crescimento consome clientes, pedidos concluídos e eventos existentes, mantendo ledgers próprios para cashback/pontos e deixando provedores de comunicação para o milestone WhatsApp/IA.

## Escopo oficial

- [140] Cupons e elegibilidade — issue #157.
- [141] Cupom no pricing autoritativo — issue #158.
- [142] Cashback accounts/transactions — issue #159.
- [143] Acúmulo e resgate de cashback — issue #160.
- [144] Loyalty accounts/transactions — issue #161.
- [145] Regras de pontos — issue #162.
- [146] Segmentação dinâmica — issue #163.
- [147] Campaigns — issue #164.
- [148] Campaign recipients — issue #165.
- [149] Automation rules/runs — issue #166.
- [150] Painel CRM/crescimento — issue #167.
- [151] Consumidor idempotente de `order.completed` — issue #168.

## Decisões iniciais

1. Cashback e pontos usam ledger imutável + saldo projetado na conta, atualizados na mesma transação.
2. Nenhum valor de benefício vindo do navegador é autoridade.
3. Cupons são revalidados no momento de criar/converter o pedido.
4. Campanhas modelam público e execução; integração com WhatsApp/e-mail fica desacoplada.
5. `order.completed` será consumido idempotentemente pelo motor de crescimento; OrderService não conhece regras de fidelidade.
6. Reversões futuras geram transações compensatórias; ledgers não são apagados.
7. Dados permanecem isolados por `organization_id` e `store_id`, com RLS e RBAC server-side.

## Implementação iniciada

Branch: `agent/crm-growth-140-151`.

Primeiro pacote:
- permissões TypeScript `growth.view`, `growth.manage`, `growth.campaigns`;
- `supabase/sql/38_growth_core.sql`;
- `store_growth_settings`;
- `coupons`;
- `cashback_accounts` / `cashback_transactions`;
- `loyalty_accounts` / `loyalty_transactions`;
- índices para lookup por cliente/conta e cupom ativo;
- grants explícitos e RLS de leitura por `growth.view`;
- mutações de ledger reservadas ao backend/service role.

## Validação inicial

O conteúdo de `38_growth_core.sql` foi executado no Supabase oficial dentro de `BEGIN ... ROLLBACK`.

Resultado dentro da transação:
- 6 tabelas criadas;
- 3 permissões criadas;
- RLS ativa nas 6 tabelas.

Após rollback:
- 0 tabelas Growth persistidas;
- 0 permissões Growth persistidas.

A migration ainda **não foi aplicada oficialmente**. O próximo passo do bloco é implementar e testar RPCs atômicas para ledger/benefícios e só então aplicar o conjunto no backend oficial.
