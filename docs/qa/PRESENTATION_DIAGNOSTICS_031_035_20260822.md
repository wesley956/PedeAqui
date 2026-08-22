# Diagnóstico de apresentação — lote PA-DIAG-031 a PA-DIAG-035

Data de corte: 2026-08-22  
Master: GitHub #539  
Issues executadas: #570, #571, #572, #573 e #574

## Resultado

| Diagnóstico | Issue | Estado | Evidência |
| --- | --- | --- | --- |
| Formas de pagamento habilitadas | #572 / PA-DIAG-031 | Aprovado | dinheiro, crédito e débito da unidade `santa-rita` geraram pedidos com snapshots corretos; Pix permanece desabilitado nessa unidade |
| Proteção contra pedido duplicado | #571 / PA-DIAG-032 | Aprovado após correção | botão fica desabilitado durante o envio e a repetição da RPC devolveu o mesmo pedido com `created=false` |
| Confirmação, número e resumo | #570 / PA-DIAG-033 | Aprovado | acompanhamento mostra pedido recebido, número, itens, observações, valores, pagamento e horário solicitado |
| Observações, cupom e agendamento | #574 / PA-DIAG-034 | Aprovado após correções | observação e cupom viraram snapshots; agendamento opcional foi criado de ponta a ponta no fuso da loja |
| Pedido novo no painel | #573 / PA-DIAG-035 | Aprovado por contrato e infraestrutura | tabela `orders` está na publicação Realtime; painel escuta `INSERT`, avisa, toca som opcional e atualiza a fila |

## Falhas encontradas e corrigidas

1. O salvamento em etapas do checkout usava `upsert` parcial. Dependendo da ordem das etapas, uma gravação podia limpar dados já preenchidos em outra etapa. O serviço agora tenta `update` parcial com escopo de organização/loja/carrinho, cria a sessão somente quando ela não existe e repete o update em caso de corrida na primeira gravação.
2. O botão “Fazer pedido” não tinha estado pendente. Agora ele é bloqueado durante a Server Action e exibe “Enviando pedido…”. A idempotência do banco continua sendo a proteção final.
3. Agendamento não existia. Foram adicionados horário opcional na sessão e snapshot no pedido, conversão do horário local usando o fuso da loja, janela de 15 minutos a 7 dias, tolerância de revisão e guarda autoritativa na criação do pedido.
4. A integração do segmento de gás havia substituído a função de criação de pedido e removido os campos de cupom/cashback/pontos. Um carrinho com cupom chegava à confirmação, mas falhava no insert do pedido por `orders_growth_discount_consistency`. A migration 118 unifica benefícios e snapshots de gás na mesma função.
5. O painel mostrava os valores técnicos `digital_menu` e `table`. Os rótulos agora aparecem como “Cardápio” e “Mesa”. Pedidos agendados recebem uma etiqueta própria.

## Evidência transacional live

As validações usaram a unidade `santa-rita` em uma transação encerrada com `ROLLBACK`.

- dinheiro: pedido criado com `payment_method_snapshot=cash` e troco de R$ 20,00;
- cartão de crédito: pedido criado com desconto fixo de R$ 1,00, código do cupom e horário agendado preservados;
- cartão de débito: pedido criado com `payment_method_snapshot=debit_card`;
- os três pedidos preservaram a observação `Sem granola - QA`;
- a repetição da finalização devolveu o mesmo `order_id` e `created=false` nos três meios;
- a função ativa contém simultaneamente `resolve_growth_benefits`, snapshots em `order_item_gas_options` e a guarda de horário;
- `checkout_sessions.scheduled_for` e `orders.scheduled_for` são `timestamptz`;
- os gatilhos de snapshot do pedido e do payload de impressão estão ativos;
- `orders` está publicado em `supabase_realtime`.

Após o rollback, carrinhos, clientes, cupons e pedidos com os identificadores de QA retornaram contagem zero.

## Configuração da unidade de demonstração

| Meio | Configuração atual |
| --- | --- |
| Dinheiro | habilitado |
| Cartão de crédito | habilitado |
| Cartão de débito | habilitado |
| Pix | desabilitado |

O checkout lista apenas métodos habilitados. Pix também depende da prontidão do provedor e não deve ser prometido na apresentação da unidade `santa-rita` enquanto estiver desabilitado.

## Limite da validação Realtime

O teste confirmou publicação, filtro por loja e assinatura do cliente. O evento visual não foi disparado com uma gravação persistente porque a massa live foi deliberadamente revertida. A atualização também possui `router.refresh()` como resposta ao evento; portanto, não depende de inserir polling artificial no painel.

## Migrations

- `117_checkout_scheduling.sql` — horário na sessão/pedido, índices e snapshots de impressão;
- `118_checkout_order_growth_gas_compatibility.sql` — criação de pedido compatível com benefícios, gás, idempotência e guarda do agendamento.

## Validação automatizada

- 152 arquivos e 917 testes aprovados;
- typecheck aprovado;
- lint sem erros e com quatro avisos históricos;
- build Next.js aprovado com 66 superfícies;
- revisão condensada de React aprovada: componente cliente mínimo, estado pendente nativo do formulário, sem novos efeitos, props tipadas e controles rotulados.

## Risco que continua aberto

Este lote valida correção funcional. A latência de primeira resposta/execução em produção continua registrada separadamente na PA-DIAG-080 (#619) e não deve ser considerada resolvida por estas mudanças.
