# Financeiro / DRE — Status [211–224]

Status do Milestone 21 do PedeAqui.

## Estado

- Branch: `agent/finance-211-224`.
- Draft PR: #248.
- Base: `agent/purchases-suppliers-199-210` / PR #233.
- Não mesclado em `main`.
- Migrations do domínio aplicadas no Supabase oficial.
- E2Es de domínio executados em transações com rollback e zero resíduos.
- Merge exige nova autorização explícita e revalidação do head/base/CI.

## Escopo entregue

### [211] Contas financeiras

- Contas por unidade.
- Tipos: caixa, banco, clearing, carteira e outras.
- Contas técnicas por unidade para Caixa físico, Pix a liquidar e Cartões a liquidar.
- Saldo não é campo editável: é projeção derivada do ledger.

### [212] Categorias financeiras

- Categorias por organização.
- Natureza receita/despesa.
- Grupos gerenciais de DRE.
- Hierarquia opcional por categoria pai.

### [213] Ledger financeiro imutável

- `financial_transactions` é histórico autoritativo de movimentos financeiros.
- Reconhecimento, liquidação, reversão, transferência e ajustes são lançamentos separados.
- Correções geram compensação; registros antigos não são reescritos.

### [214] Contas a receber

- Pedido concluído reconhece receita por competência.
- Recebível da venda é derivado da venda operacional.
- Pagamentos confirmados liquidam o recebível na conta correspondente.
- Venda não pode ser liquidada manualmente pelo módulo Financeiro; o domínio Pagamentos é o dono dessa liquidação.

### [215] Contas a pagar

- Recebimento de compra cria obrigação a pagar.
- Recebimento de estoque não é lançado diretamente como despesa de DRE.
- Prazo de pagamento do fornecedor é copiado para o pedido de compra como snapshot.

### [216] Liquidações

- Liquidação parcial e final.
- Retry idempotente.
- Estorno cria lançamento compensatório.
- Liquidação criada automaticamente por Pagamentos não pode ser estornada manualmente no Financeiro; o estorno nasce do domínio de origem.

### [217] Transferências

- Transferência entre contas é um par atômico de movimentos.
- Retry usa identificação determinística.
- Transferência interna não altera a DRE consolidada.

### [218] Receitas e despesas manuais

- Lançamento manual por competência.
- Pode permanecer em aberto ou ser liquidado imediatamente se o usuário também possuir `finance.settle`.
- Cancelamento preserva histórico.

### [219] Competência x caixa

- DRE usa data de competência.
- Fluxo realizado usa movimentos em contas/liquidações.
- Reconhecimento de receita/despesa não é confundido com movimentação de dinheiro.

### [220] DRE gerencial

- Receita bruta.
- Deduções e reembolsos.
- Receita de entrega.
- CPV.
- Despesas operacionais.
- Outras receitas/despesas.
- Resultado líquido gerencial.

### [221] Fluxo de caixa

- Movimentos realizados por período e conta.
- Transferências são refletidas nas contas sem inflar o consolidado.
- Recebíveis/pagáveis em aberto permanecem separados de caixa realizado.

### [222] Integração com Caixa

- Caixa físico continua sendo fonte de verdade operacional para abertura, suprimento, sangria e conferência.
- Venda/refund em dinheiro entram pelo domínio Pagamentos e não são duplicados pelo espelhamento de `cash_movements`.

### [223] Painel `/financeiro`

- Contas e saldos projetados.
- Recebíveis e pagáveis.
- Lançamentos manuais.
- Liquidação e transferência conforme permissão.
- DRE e fluxo somente para `finance.reports`.
- `finance.view` sozinho não recebe o relatório gerencial.

### [224] Hardening

- Ledger imutável.
- Idempotência com payload validado.
- Contas restritas à organização/unidade ativa.
- RPCs financeiras server-only/service-role-only no banco.
- Aplicação autoriza usuário antes de usar o cliente administrativo.
- Relatório removido do service de mutações; `financial_report_internal` existe apenas no caminho de leitura protegido por `finance.reports`.
- FKs novas receberam índices de cobertura.

## Integrações de fonte de verdade

### Vendas e Pagamentos

`order.completed` reconhece receita e recebível. Um pagamento realmente `paid` liquida o recebível. Reembolso desfaz a liquidação e reduz a competência/recebível sem apagar histórico.

### Estoque / CPV

O CPV vem do custo real gravado em `inventory_movements` no consumo associado ao pedido, não de preço estimado do navegador.

### Compras

Recebimento gera obrigação a pagar. Correção negativa reduz o aberto; se o fornecedor já foi pago, o excedente vira crédito a receber do fornecedor.

### Caixa físico

Abertura, suprimento, sangria e ajustes físicos podem refletir na conta técnica de Caixa. Vendas/refunds em dinheiro não são contados duas vezes.

## Validações PostgreSQL com rollback

### Núcleo financeiro

Validado:

- lançamento manual;
- retry idempotente;
- payload divergente rejeitado;
- liquidação parcial;
- estorno;
- transferência pareada;
- projeções de saldo coerentes.

### Integração operacional

Cenário validado:

- venda de R$ 11,00;
- liquidação Pix;
- linhas de competência fechando o total da venda;
- CPV de R$ 0,50 originado do custo real de estoque;
- compra de R$ 100,00 com prazo de 7 dias virando conta a pagar sem antecipar despesa na DRE.

### Hardening

Validado:

- liquidação manual de venda bloqueada;
- estorno manual de pagamento automático bloqueado;
- reembolso zerando a liquidação/recebível correspondente e reduzindo a DRE;
- prazo de 7 dias preservado na compra antiga mesmo depois de alterar o fornecedor para 30 dias;
- correção de R$ 20,00 após fornecedor já pago virando crédito contra fornecedor.

Todos os cenários de teste de banco foram encerrados com rollback e verificação de zero resíduos.

## Segurança

- Tabelas financeiras com RLS.
- `anon`/`authenticated` sem acesso direto às tabelas server-only.
- RPCs internas sem EXECUTE para navegador.
- `finance.view`, `finance.manage`, `finance.settle` e `finance.reports` são permissões distintas.
- `FinanceReadService` só chama `financial_report_internal` depois de confirmar `finance.reports`.
- O service de mutações não possui caminho de leitura do relatório.

## Performance

- FKs novas do Financeiro receberam índices específicos.
- Avisos `unused_index` em índices recém-criados são esperados antes de tráfego real.
- Avisos históricos de outros domínios não foram alterados sem evidência de necessidade.

## Limites honestos

Este milestone **não** implementa:

- conciliação bancária automática;
- importação OFX/CNAB;
- integração com banco/adquirente além das fontes operacionais já existentes;
- contabilidade fiscal oficial;
- plano de contas contábil completo;
- emissão fiscal/NF-e/NFC-e;
- obrigações tributárias.

Esses itens pertencem a integrações/fiscal posteriores.
