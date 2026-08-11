# PedeAqui — Salão [127]–[139]

## Objetivo

Implementar operação de salão sem criar um segundo motor de pedidos. Mesa/comanda organizam a experiência presencial; cada rodada continua sendo um `order` normal e reutiliza catálogo, preço autoritativo, State Machines, produção, impressão e pagamentos existentes.

## Escopo oficial

- [127] Mesas.
- [128] TableService e estados.
- [129] Comandas.
- [130] Participantes/assentos.
- [131] Abrir, transferir e encerrar comanda.
- [132] Vincular pedidos/itens à comanda.
- [133] Lançar rodada pelo garçom.
- [134] Integrar rodada com produção e impressão.
- [135] Painel de mesas.
- [136] Detalhe mesa/comanda.
- [137] Conta da comanda.
- [138] Divisão de conta e pagamentos.
- [139] QR público da mesa.

## Decisões de arquitetura

1. Uma mesa pode ter uma única comanda ativa (`open` ou `settling`).
2. Uma comanda pode ter várias rodadas.
3. Cada rodada é persistida em `orders` com `tab_id` e `tab_round_number`.
4. Rodada do garçom usa `channel='waiter'`; rodada pública usa `channel='table_qr'`.
5. Pedidos de salão usam `fulfillment_type='table'`.
6. O preço é recalculado no PostgreSQL usando o catálogo atual; valores do navegador nunca são autoridade.
7. Confirmar rodada reutiliza `order_transition_internal`, trigger de impressão e `order_start_production_internal`.
8. A comanda não duplica linhas financeiras: pagamentos são distribuídos nos `payments` dos pedidos existentes.
9. Divisão por pessoa usa `tab_item_allocations`; pagamento identificado por pessoa não pode superar os itens atribuídos a ela.
10. Fechamento exige saldo zero e pedidos prontos/pagos; o fechamento leva fulfillment a `served`, pedido a `completed` e mesa a `cleaning`.
11. QR da mesa usa `public_code` opaco de 120 bits, rotacionável, sem expor UUID interno.
12. RPCs operacionais são `SECURITY INVOKER`, revogadas de `anon/authenticated` e executáveis por `service_role` somente depois de autorização/scoping server-side.

## Banco de dados

Migrations aplicadas no Supabase oficial:

- `dining_127_139_core` → `supabase/sql/33_dining_core.sql`.
- `dining_127_139_operations` → `supabase/sql/34_dining_operations.sql`.
- `dining_127_139_rounds_settlement_public` → `supabase/sql/35_dining_rounds_settlement_public.sql`.
- `dining_127_139_allocation_scope` → `supabase/sql/36_dining_allocation_scope.sql`.
- `dining_127_139_security_hardening` → `supabase/sql/37_dining_security_hardening.sql`.

Entidades novas:

- `tables`.
- `tab_sequences`.
- `tabs`.
- `tab_members`.
- `tab_item_allocations`.

Extensão de `orders`:

- `tab_id`.
- `tab_round_number`.
- `payment_method_snapshot` pode ser nulo somente no fluxo de salão, no qual a forma efetiva nasce no acerto.

## UI

- `/salao` — board responsivo de mesas, estado, comanda ativa, pessoas, tempo e saldo.
- `/salao/[tableId]` — abertura/transferência, participantes, rodadas, atribuição de itens, conta, pagamento e QR.
- `/mesa/[code]` — experiência pública de pedido na mesa por código opaco.

## Validação PostgreSQL real

Teste transacional com rollback executado no banco oficial:

- abertura repetida da mesma mesa retornou a mesma comanda;
- transferência Mesa 01 → Mesa 02 atualizou os estados das duas mesas;
- dois participantes foram adicionados;
- projeção pública do QR retornou loja/mesa/comanda sem qualquer UUID interno;
- rodada `waiter` criada e repetida com a mesma idempotency key retornou o mesmo pedido;
- rodada `table_qr` gerou um segundo pedido lógico;
- exatamente 2 pedidos e exatamente 2 print jobs foram gerados;
- os dois pedidos chegaram a `confirmed` + `preparing` automaticamente;
- um item foi atribuído a uma pessoa;
- tentativa de pagamento acima do saldo da pessoa foi bloqueada;
- pagamento da pessoa foi idempotente;
- pagamento geral quitou o saldo restante;
- produção dos dois pedidos foi marcada `ready`;
- fechamento levou pedidos a `completed/paid/ready/served` e mesa a `cleaning`;
- Print Agent reivindicou e confirmou os 2 jobs;
- rollback final confirmou 0 usuários, organizações, lojas, mesas e pedidos de teste.

## Segurança

Após o hardening:

- Security Advisor: 0 alertas/avisos.
- 0 tabelas de Salão sem RLS.
- `anon` possui 0 privilégios diretos de tabela no schema `public`.
- `anon` pode executar apenas a projeção pública `get_public_table(text)` dentro deste módulo.
- `anon/authenticated` não executam `dining_create_round_internal` nem `dining_pay_tab_internal` diretamente.
- `service_role` executa as RPCs internas depois do scope aplicado no servidor.
- `tab_sequences` possui policy restritiva explícita de negação para browser roles.

## Limitações conhecidas / próximos refinamentos

- O QR possui código opaco + idempotência, mas rate limiting distribuído ainda depende da camada de borda/infra futura.
- A tela mostra o endereço do QR; geração visual/impressão automática da imagem QR pode ser adicionada junto da experiência de material de mesa.
- Reserva avançada, mapa visual drag-and-drop, junção/separação de mesas e comandas nominais independentes de mesa ficam para evolução posterior.
- Não existe hardware específico de salão a validar; impressão continua dependendo do teste físico do Print Agent já registrado no módulo de impressão.
