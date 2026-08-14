# Financeiro — hierarquia de gestão

Issue lógica: **[293]**.

A tela separa leitura gerencial de tarefas operacionais sem alterar o modelo financeiro:

1. período e indicadores gerenciais, quando `finance.reports` está autorizado;
2. contas e saldos consolidados;
3. contas a receber e a pagar;
4. lançamentos e transferências autorizadas;
5. cadastros financeiros e prazos de fornecedor;
6. histórico imutável de movimentos.

DRE continua por competência e fluxo por liquidação. Obrigações e saldos são obtidos do `FinanceReadService`; formulários existentes permanecem responsáveis por lançamento, liquidação, transferência, cancelamento e estorno.

Nenhum saldo é editado diretamente e nenhum cálculo ou escopo temporal foi alterado. No mobile, painéis analíticos e ações passam para uma coluna.
