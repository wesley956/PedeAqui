# PedeAqui — Status Financeiro / DRE [211]–[224]

## Estado

Milestone 21 implementado/validado na branch `agent/finance-211-224`, empilhada sobre o draft de Compras/Fornecedores [199]–[210].

Issues oficiais: #234–#247.

O PR de Financeiro permanece draft e não deve ser mesclado sem nova autorização explícita. Compras/Fornecedores também continua não mesclado; por isso Financeiro permanece empilhado sobre esse head verde.

O gate de CI deve sempre ser verificado pelo SHA exato no momento de uma eventual decisão de merge. O último gate executado antes desta atualização documental passou lint, TypeScript, 203 testes, Print Agent e build de produção.

## Princípios de domínio

O Financeiro não substitui nem duplica os módulos operacionais:

- **Pedidos/Pagamentos** continuam sendo a fonte de verdade da venda e do pagamento;
- **Caixa** continua sendo a fonte de verdade do dinheiro físico por turno;
- **Compras** continua sendo a fonte de verdade da compra/recebimento do fornecedor;
- **Estoque** continua sendo a fonte de verdade do consumo/custo físico dos insumos;
- **Financeiro** representa competência, recebíveis/pagáveis, liquidações, contas, fluxo realizado e DRE.

Regras centrais:

- `financial_transactions` é o ledger imutável;
- saldos de contas são projeções derivadas do ledger;
- obrigações são projeções derivadas dos reconhecimentos/ajustes/liquidações;
- a UI nunca edita saldo de conta diretamente;
- competência e liquidação são fatos diferentes;
- DRE usa competência;
- fluxo de caixa usa movimentos de contas/liquidações;
- transferências entre contas não entram na DRE;
- valores financeiros usam centavos inteiros; custo de estoque continua em microcentavos por unidade-base no domínio de Estoque.

## [211] Contas financeiras

Entidades:

- `financial_accounts`;
- `financial_account_balances`.

Tipos suportados:

- `cash`;
- `bank`;
- `clearing`;
- `wallet`;
- `other`.

Cada unidade recebe contas técnicas iniciais:

- **Caixa físico** (`cash_on_hand`);
- **Pix a liquidar** (`pix_clearing`);
- **Cartões a liquidar** (`card_clearing`).

Pix/cartão ficam em clearing porque o sistema ainda não possui integração bancária/PSP para afirmar liquidação em banco. Dinheiro confirmado entra no Caixa físico.

## [212] Categorias financeiras

`financial_categories` é hierárquica por organização e separa natureza (`revenue|expense`) de grupo da DRE.

Grupos-base:

- receita bruta;
- deduções;
- receita de entrega;
- CPV;
- despesa operacional;
- outras receitas;
- outras despesas.

Categorias sistêmicas são seedadas por organização, incluindo vendas, descontos, reembolsos, taxa de entrega e CPV.

## [213] Ledger financeiro

`financial_transactions` é imutável e suporta:

- `recognition`;
- `obligation_adjustment`;
- `settlement`;
- `settlement_reversal`;
- `transfer`;
- `manual_adjustment`.

Cada movimento pode referenciar:

- obrigação;
- conta;
- categoria;
- origem de domínio;
- grupo de transferência;
- competência;
- chave idempotente;
- metadata/auditoria.

Update/delete do ledger é bloqueado por trigger.

## [214] Vendas e pagamentos

Quando um pedido entra em `completed`, o Financeiro reconhece por competência:

1. subtotal como receita bruta;
2. desconto como dedução negativa;
3. taxa de entrega como receita de entrega.

O principal do recebível precisa fechar exatamente com `orders.total_cents`; caso contrário a transação falha.

Pagamento `paid` liquida o recebível pela conta técnica correspondente ao método.

### Boundary obrigatório

Uma obrigação com origem `order` **não pode ser liquidada manualmente no Financeiro**. A fonte de verdade dessa liquidação é `payments`.

Da mesma forma, uma liquidação criada por Pagamentos não pode ser estornada manualmente em `/financeiro`; o estorno precisa nascer do domínio Pagamentos/reembolso.

Isso evita dupla contagem caso alguém marque uma venda como paga em dois lugares.

## Reembolsos

Quando um pagamento já liquidado muda para `refunded`:

1. o movimento da conta é revertido por `settlement_reversal`;
2. a competência é reduzida pela categoria `sales_refunds`;
3. o principal/settled/open do recebível voltam a refletir o efeito líquido real.

O reembolso não é apenas uma saída de caixa; ele também corrige o resultado econômico.

## [215] Contas a pagar vindas de Compras

O prazo financeiro do fornecedor fica em `supplier_stores.payment_term_days`.

Ao criar o pedido de compra, esse prazo é congelado em `purchase_orders.payment_term_days_snapshot`.

Alterar o fornecedor de 7 para 30 dias amanhã não muda uma compra já criada hoje.

Cada recebimento de compra cria/ajusta uma obrigação a pagar baseada no recebimento físico. A compra de estoque **não vira despesa da DRE no recebimento**.

A despesa/CPV só é reconhecida quando o insumo é consumido por uma venda.

## Correção de compra já paga

Correções negativas possuem duas parcelas possíveis:

- até o valor ainda aberto: reduz o contas a pagar;
- valor que já havia sido pago: vira **crédito a receber contra o fornecedor** (`supplier_credit`).

Esse crédito não entra na DRE por si só; ele representa um ativo/valor a recuperar do fornecedor.

## [216] Liquidações

Liquidação manual é idempotente e pode ser parcial ou total.

- valor aberto é derivado;
- retry idêntico retorna o mesmo fato;
- mesma chave com payload diferente é rejeitada;
- estorno cria `settlement_reversal`, sem editar o original;
- apenas liquidações manuais podem ser estornadas pelo Financeiro.

## [217] Transferências

Transferências entre contas:

- usam duas pernas atômicas;
- possuem `transfer_group_id` determinístico;
- usam advisory lock para ordem estável das contas;
- são idempotentes;
- não entram na DRE;
- no fluxo consolidado, saída e entrada internas se anulam naturalmente.

## [218] Receitas e despesas manuais

O Financeiro permite lançar receita/despesa manual com:

- categoria;
- competência;
- vencimento;
- descrição;
- valor;
- liquidação opcional imediata em uma conta.

Se não escolher conta, nasce uma obrigação em aberto.

Cancelamento de lançamento manual exige motivo e gera compensação; não apaga reconhecimento histórico. Se já houver liquidação, ela deve ser estornada primeiro.

## [219] Competência x caixa

A arquitetura mantém as duas visões separadas:

- **competência**: quando receita/despesa pertence ao resultado;
- **caixa**: quando valor entra/sai de uma conta.

Uma venda pode estar no DRE e ainda não estar liquidada. Uma compra de estoque pode gerar contas a pagar sem virar CPV. Transferência entre contas muda o caixa por conta, mas não o resultado.

## [220] DRE gerencial

`financial_report_internal` calcula por período e unidade:

- receita bruta;
- deduções/descontos/reembolsos;
- receita de entrega;
- CPV;
- despesas operacionais;
- outras receitas;
- outras despesas;
- resultado líquido gerencial.

O cálculo usa apenas `recognition`/`obligation_adjustment` com categoria e `competence_date`.

### CPV real

O CPV nasce do `inventory_movements` de venda:

`abs(quantity_delta) × unit_cost_micros / 1.000.000`

Ou seja: usa o custo real projetado no domínio de Estoque, e não um percentual inventado sobre a venda.

## [221] Fluxo de caixa

O relatório de fluxo realizado usa movimentos que realmente afetam contas:

- liquidação;
- estorno de liquidação;
- transferência;
- ajuste manual de conta.

O período é resolvido no timezone da unidade.

## [222] Caixa físico x Financeiro

A conta financeira **Caixa físico** espelha movimentos de caixa que representam dinheiro físico fora de venda/reembolso, como abertura/suprimento/sangria/ajustes quando aplicável.

Movimentos `sale` e `refund` de `cash_movements` são ignorados pelo sync do Caixa→Financeiro, porque esses fatos já chegam pelo domínio `payments`.

Isso evita contar a mesma venda em dinheiro duas vezes.

## [223] `/financeiro`

A interface possui:

- contas e saldos projetados;
- recebíveis/pagáveis em aberto;
- vencimentos;
- DRE e fluxo realizado por período;
- lançamentos manuais;
- liquidações permitidas;
- transferências;
- contas/categorias;
- prazo financeiro por fornecedor;
- histórico de movimentos/estornos.

### Permissões da UI

- `finance.view`: contas, obrigações e movimentos operacionais;
- `finance.manage`: contas, categorias e lançamentos manuais;
- `finance.settle`: liquidações/transferências permitidas;
- `finance.reports`: DRE e fluxo de caixa.

`finance.view` sozinho **não** chama o RPC agregado de relatório via service role.

## Segurança

Validação direta no Supabase oficial:

- 5/5 tabelas financeiras com RLS;
- `anon`: zero privilégios diretos;
- `authenticated`: zero privilégios diretos;
- `anon/authenticated`: zero EXECUTE nas RPCs públicas internas do Financeiro;
- aplicação chama autorização antes de criar cliente admin/service-role;
- IDs de conta/obrigação/transação são revalidados contra organização/unidade ativa antes da mutação;
- o service de mutações não contém `financial_report_internal`;
- o relatório agregado só é chamado no `FinanceReadService` após `finance.reports`.

O Security Advisor pode listar INFO `rls_enabled_no_policy` nessas tabelas intencionalmente server-only. Elas não possuem grants diretos para o navegador.

## Performance

As FKs novas sinalizadas/relevantes do domínio receberam índices de cobertura em `73_finance_fk_indexes.sql`.

Avisos históricos de outros domínios não foram alterados sem evidência. Índices novos podem aparecer como `unused` antes de tráfego real.

## E2E PostgreSQL com rollback

### Núcleo do ledger

Validado:

- receita manual com liquidação imediata;
- retry sem duplicar;
- mesma chave + payload diferente rejeitado;
- despesa manual em aberto;
- liquidação parcial + retry;
- referência alterada com mesma chave rejeitada;
- estorno + retry;
- transferência pareada + retry;
- saldos projetados coerentes;
- rollback final sem resíduos.

### Integração venda / pagamento / CPV / compra

Cenário:

- venda: subtotal R$10,00;
- desconto: R$1,00;
- taxa de entrega: R$2,00;
- total: R$11,00;
- Pix pago R$11,00;
- recebível principal/liquidado: R$11,00;
- três linhas de competência fecham exatamente o total;
- CPV real: R$0,50 vindo do custo do movimento de estoque;
- compra: R$100,00, prazo snapshot 7 dias;
- recebimento gera contas a pagar e **não** DRE;
- pagamento da compra liquida a obrigação;
- DRE do cenário: R$10,50;
- rollback final sem resíduos.

### Hardening de fronteiras e correções

Validado:

- venda concluída sem pagamento: liquidação manual no Financeiro bloqueada;
- pagamento real `paid`: recebível liquidado;
- estorno manual dessa liquidação automática bloqueado;
- pagamento `refunded`: Pix zerado, recebível líquido zerado e DRE reduzida;
- fornecedor configurado em 7 dias;
- pedido de compra congelou 7 dias;
- fornecedor alterado para 30 dias depois;
- compra antiga manteve vencimento +7 dias;
- compra R$100,00 foi paga integralmente;
- correção posterior de R$20,00 preservou o pagável quitado e criou crédito a receber de R$20,00 contra o fornecedor;
- crédito de fornecedor não entrou na DRE;
- rollback final sem resíduos.

## Migrations oficiais

- `finance_core_211_224`;
- `finance_operations_211_224`;
- `finance_integrations_211_224`;
- `finance_corrections_hardening_211_224`;
- `finance_reporting_211_224`;
- `finance_supplier_terms_211_224`;
- `finance_domain_boundaries_211_224`;
- `finance_fk_indexes_211_224`.

## Limites honestos

- não existe integração bancária/OFX/Open Finance;
- contas Pix/cartão são clearing, não afirmação de dinheiro liquidado no banco;
- não existe conciliação automática de adquirente;
- não existe emissão/entrada fiscal eletrônica neste milestone;
- não existe contabilidade oficial/Sped/ECD/ECF;
- DRE é **gerencial**, baseada nos fatos operacionais disponíveis;
- não existe juros/multa/rateio fiscal avançado;
- E2Es executados são de domínio PostgreSQL, não de bancos/PSPs/ERPs externos.

## Próximo bloco

A sequência macro seguinte é **Fiscal e Integrações [225+]**, mantendo fiscal desacoplado do núcleo de pedidos e usando adaptadores/webhooks idempotentes.
