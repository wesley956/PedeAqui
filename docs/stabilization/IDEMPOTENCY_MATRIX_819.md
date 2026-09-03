# Matriz de idempotência — estabilização #819

Este inventário classifica mutações críticas do PedeAqui e registra a proteção esperada contra clique duplo, retry, refresh, timeout e concorrência. Nenhuma chave é compartilhada entre organizações/unidades/atores/operações.

| Fluxo | Mutação / efeito | Proteção | Classificação | Evidência principal |
| --- | --- | --- | --- | --- |
| Cardápio público | converter carrinho/checkout em pedido | locks de carrinho e checkout + unicidade por origem + sequência atômica por loja | protegida | `19_orders.sql`, `21_order_access_token.sql`, `tests/concurrency-contracts.test.ts` |
| PDV | criar venda | registro de idempotência bloqueado antes da criação e replay de `response_body` | protegida | `30_pdv.sql`, `tests/concurrency-contracts.test.ts` |
| Pedido | confirmação/cancelamento/transições | transições autoritativas no banco e guards de estado; operações repetidas não podem pular estado | protegida | RPCs de pedido/pagamento e suíte de transições |
| Entregador | cadastrar | `idempotencyKey` estável por submissão + RPC com chave contextual e replay | protegida | `driver-mutation-service.ts`, `delivery/actions.ts`, `181_stabilization_driver_idempotency_and_index_hardening.sql` |
| Entregador | editar | mesma chave lógica é reutilizada em retry; RPC serializa e audita uma vez | protegida | mesmos arquivos acima |
| Entrega | atribuir/aceitar/mudar rota/confirmar | transições de entrega preservam escopo e estado; formulários mantêm chave estável quando a operação é repetível | protegida | ações de delivery, contratos de isolamento e transições |
| Impressão | reclamar job/ACK | leasing com `FOR UPDATE ... SKIP LOCKED`, lease e agente reclamante | protegida | `23_printing.sql`, `26_print_agent_strict_assignment.sql`, `tests/concurrency-contracts.test.ts` |
| Impressão | intenção de impressão | `idempotency_key` única | protegida | `23_printing.sql` |
| Impressão | reimpressão intencional | nova intenção explicitamente ligada a `original_job_id` e `is_reprint`; não é confundida com retry da impressão original | protegida | `23_printing.sql` |
| Configuração/teste | ações repetíveis sem efeito financeiro | UI bloqueia reenvio enquanto pending; efeitos persistentes devem usar mutação autoritativa/guardada | protegida pela camada de ação; revisar ao adicionar nova mutação | `button.tsx`, `interaction-feedback-stabilization.test.ts` |
| Administração | mutações com efeito persistente | autorização server-side + constraints/RPCs; toda nova ação crítica deve declarar chave natural, determinística ou UUID de idempotência | política obrigatória | `authorize.ts`, suíte RBAC e migrations críticas |

## Regras obrigatórias para novas mutações

1. Identificar o contexto: `organization_id`, `store_id`, ator e nome da operação.
2. Preferir chave natural quando já existe uma origem única (ex.: carrinho/checkout).
3. Quando não houver chave natural, usar chave determinística ou UUID criado no cliente e preservado durante retry.
4. Persistir/reproduzir o resultado lógico antes de executar efeitos colaterais novamente.
5. Efeitos colaterais (impressão, mensagem, auditoria) devem pertencer à mesma tentativa lógica e nunca ser recriados em replay.
6. Erro transitório/ambíguo deve permitir retry seguro; nunca avançar estado apenas porque a resposta anterior se perdeu.
7. Reimpressão solicitada pelo operador é uma nova intenção e deve permanecer possível.
8. Telefone de entregador não recebe unicidade global; qualquer regra futura deve declarar o escopo por organização/unidade.

## Gate de regressão

A suíte `tests/concurrency-contracts.test.ts` valida as proteções estruturais existentes e as migrations da estabilização adicionam a lacuna de cadastro/edição de entregadores. O CI deve falhar se locks, unicidades, leasing ou as proteções adicionadas forem removidos sem substituição equivalente.
