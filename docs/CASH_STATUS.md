# PedeAqui — Caixa [164]–[174]

Status do Milestone 17 na branch `agent/cash-register-164-174`.

## Escopo

- [164] caixas configuráveis por unidade;
- [165] sessões/turnos de caixa;
- [166] ledger imutável de movimentos;
- [167] abertura idempotente;
- [168] suprimento e sangria;
- [169] integração com pagamentos em dinheiro;
- [170] estornos e compensações;
- [171] saldo esperado e conciliação;
- [172] fechamento/conferência;
- [173] histórico de sessões;
- [174] painel `/caixa` e E2E.

Issues oficiais: #183–#193. Draft PR: #194.

## Modelo de domínio

`cash_registers` representa o caixa físico/lógico configurado na unidade. `cash_sessions` representa um turno aberto/fechado. `cash_movements` é o ledger imutável do dinheiro físico.

Regras principais:

- uma sessão aberta por caixa;
- uma sessão aberta por operador/unidade;
- dinheiro confirmado em `payments` continua sendo a fonte de verdade financeira;
- `cash_movements` é uma projeção operacional do dinheiro físico;
- confirmação de pagamento `cash` exige sessão aberta do operador que confirma;
- venda cash cria movimento `sale` automaticamente;
- estorno cash mantém a venda original e cria movimento compensatório `refund`;
- sangria nunca excede o saldo esperado;
- fechamento grava saldo esperado, contado e diferença;
- movimentos não podem ser atualizados/apagados;
- retries usam idempotency keys e payload compatível.

## RBAC

Permissões:

- `cash.view`
- `cash.manage`
- `cash.open`
- `cash.supply`
- `cash.withdraw`
- `cash.close`

Owner/manager recebem todas. Cashier recebe operação do turno sem configuração do caixa. Financial recebe leitura.

## Supabase

Arquivos SQL versionados:

- `47_cash_core.sql`
- `48_cash_operations.sql`
- `49_cash_payment_integration.sql`
- `50_cash_idempotency_hardening.sql`
- `51_cash_fk_indexes.sql`

Migrations oficiais aplicadas:

- `cash_core_164_174`
- `cash_operations_164_174`
- `cash_payment_integration_164_174`
- `cash_idempotency_hardening_164_174`
- `cash_business_fk_indexes_164_174`
- `cash_actor_fk_indexes_164_174`

Security Advisor após DDL: **0 alertas**.

O Performance Advisor continua com avisos informativos históricos de FKs/índices do projeto. As FKs introduzidas pelo Caixa receberam índices de cobertura; índices recém-criados podem aparecer como `unused` enquanto o banco ainda não possui tráfego real suficiente.

## Integração com PDV e pagamentos

- `pdv_create_order_growth_internal` continua sendo o motor do PDV;
- quando a liquidação cash muda um `payment` para `paid`, um trigger cria exatamente um movimento `sale` na sessão do ator;
- sem sessão aberta, a transação cash é recusada;
- `payment_refund_internal` estorna pagamentos pagos;
- para cash, o ator também precisa de `cash.withdraw` e sessão aberta com saldo físico esperado suficiente;
- o painel de pagamentos expõe o estorno como operação compensatória, sem apagar histórico;
- o PDV retorna mensagem amigável orientando o operador a abrir `/caixa`.

## UI

`/caixa` oferece:

- configuração de caixas para perfis autorizados;
- abertura com saldo inicial;
- saldo esperado e totais do turno;
- suprimento;
- sangria;
- conferência/fechamento;
- movimentos somente leitura;
- histórico recente de sessões;
- navegação desktop/mobile.

## E2E PostgreSQL

`supabase/tests/e2e_cash_register.sql` foi executado no Supabase oficial com rollback.

Cenário validado:

1. abertura R$ 100,00;
2. retry da abertura retorna a mesma sessão;
3. suprimento R$ 20,00;
4. sangria R$ 10,00 + retry sem duplicação;
5. venda PDV em dinheiro R$ 15,90;
6. exatamente um movimento `sale`;
7. estorno cash R$ 15,90 + retry sem duplicação;
8. saldo esperado R$ 110,00;
9. fechamento contado R$ 109,00;
10. diferença -R$ 1,00;
11. retry do fechamento idempotente;
12. nova venda cash após fechamento recusada por ausência de sessão aberta.

Rollback final confirmado: **0 usuários, organizações, lojas, caixas, sessões, movimentos e pedidos de teste**.

## Próxima expansão

Após concluir/mesclar o Caixa, a sequência de produto definida é **Entregas operacionais / Entregadores** antes de Estoque/Fichas Técnicas.
