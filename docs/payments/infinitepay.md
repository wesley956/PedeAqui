# InfinitePay no PedeAqui

A loja pode escolher a InfinitePay em **Configurações → Pagamentos → Pagamento online**. Habilite o Checkout Integrado no aplicativo InfinitePay e informe a InfiniteTag e a chave `inchk_` no formulário do painel. A chave fica no Vault, somente no servidor. Salvar a conexão não ativa pagamentos; a ativação é separada e desativa os demais provedores online da mesma unidade.

O cliente escolhe **Pix ou cartão online** no checkout e abre **Pagar na InfinitePay** na página do pedido. Cartões na entrega, dinheiro e formas personalizadas preservam seu fluxo. A opção online continua subordinada à forma Pix habilitada nas opções aceitas da unidade.

O checkout recebe o total canônico do pagamento, incluindo entrega e descontos. A API gera um link com pagamento único e validade de 30 minutos. O PedeAqui não recebe dados de cartão nem exige CPF para a InfinitePay.

## Confirmação e isolamento

- Notificações exigem token privado por unidade, limite de corpo de 256 KB e identificadores válidos. O corpo bruto não é armazenado: só seu hash e os identificadores do evento.
- Tanto webhook quanto retorno consultam `/payment_check` com a chave da unidade. Os campos de valor, estado e método recebidos pelo navegador ou webhook não são usados como prova de pagamento.
- A referência deve pertencer à unidade. O retorno também exige o cookie de acesso ao pedido e confere que a referência pertence ao mesmo pedido.
- A confirmação passa por uma RPC exclusiva do servidor, com valor e método conferidos e transação atômica para ledger, método efetivo Pix/crédito, estado do pedido, eventos de domínio e espelho da cobrança. O ledger fica com o valor original do pedido, mesmo que o provedor cobre taxas adicionais do comprador.
- O fluxo online usa a intenção Pix existente até o cliente escolher como pagar. Crédito confirmado é registrado como `credit_card` no pagamento e no resumo do pedido.
- Repetições são idempotentes. Pedidos cancelados/rejeitados e pagamentos liquidados por outra origem não são reconfirmados.
- Links já emitidos continuam conciliáveis depois da troca/desativação do provedor. Trocar a InfiniteTag com cobranças pendentes é bloqueado; o token de callback é preservado ao atualizar a conexão.

## Limites de recuperação

A API consultada não documenta um cabeçalho de idempotência para criar links. Por isso, o PedeAqui reserva a criação atomicamente no banco e só envia uma requisição. Após um timeout ambíguo, não cria outro link automaticamente: a loja deve verificar a cobrança antes de liberar outra tentativa. Rejeições definitivas 400/401/403/422 permitem corrigir a configuração e tentar novamente.

A consulta de pagamento exige a transação e a fatura. A reconciliação agendada cobre cobranças para as quais esses identificadores já foram obtidos por uma consulta autenticada. Sem ambos, a recuperação depende da notificação da InfinitePay ou do retorno do comprador. Links expirados não são substituídos automaticamente. Estornos na InfinitePay e no ledger precisam ser conciliados pela operação; este trabalho não adiciona uma API de estorno.

## Validação e publicação em 20/10/2026

- 2.936 testes Vitest aprovados, incluindo 36 cenários da integração e a renderização da configuração desativada, além das regressões Mercado Pago/PagBank.
- Typecheck, lint sem erros, integridade de rotas, histórico de migrações e build Next.js aprovados. Os oito avisos de lint são preexistentes.
- PostgreSQL isolado (PGlite 0.5.10), com tabelas e funções reais de pagamento e substitutos locais para Vault e transição de pedido: reaplicação da migração, reserva repetida, configuração desligada, troca atômica de provedor, validação de valor/unidade/método, crédito no ledger, eventos idempotentes, rollback de cancelamento e privilégios/RLS aprovados. Não substitui uma homologação completa do esquema em produção.
- Migração aplicada ao projeto `idyjinpeijyqcejnunwm` como `20261020214527_infinitepay_order_checkout`. Impressão digital das configurações existentes permaneceu idêntica. Nenhuma conta InfinitePay foi criada ou ativada. RLS e restrições de execução verificadas por leitura; não surgiram novos avisos no advisor.
- O inventário de produção foi sincronizado por leitura com as 267 migrações já aplicadas, sem executar novamente as anteriores.
- **Pendente para ativação comercial:** conectar uma conta real e validar uma venda de baixo valor em Pix e crédito, incluindo webhook, retorno e valor/método no painel. Os testes de API usam respostas simuladas; não houve cobrança real.

Teste SQL isolado reproduzível (a dependência é instalada fora do projeto):

```bash
npm install --prefix /tmp/pedeaqui-sql-runtime --no-audit --no-fund @electric-sql/pglite@0.5.10
node tests/infra/infinitepay-isolated-ledger.mjs /tmp/pedeaqui-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js
```

Documentação oficial consultada:

- https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay
- https://www.infinitepay.io/checkout-documentacao

As fontes oficiais descrevem a criação com chave e objeto `webhook`, além do payload de notificação com `order_nsu`, `transaction_nsu` e `invoice_slug`. O retorno usa `slug`. Qualquer diferença de payload da conta real deve ser validada antes da ativação comercial.
