# Estabilização #819 — matriz de idempotência das mutações críticas

Classificação usada:
- **Protegida**: retry/concurrency produz o mesmo resultado lógico ou uma reconciliação segura, sem repetir o efeito de negócio crítico.
- **Parcial**: UI/state/constraint reduz duplicidade, mas um timeout após commit ainda pode produzir erro, auditoria duplicada ou efeito intencional repetido sem uma chave explícita.
- **Intencionalmente repetível**: o efeito é uma nova ação pedida pelo operador (ex.: reimpressão) e não deve ser colapsado como duplicata; exige permissão/auditoria.

## Fluxos críticos

| Fluxo | Caminho | Classificação | Proteção atual | Residual |
| --- | --- | --- | --- | --- |
| Checkout → criar pedido | `createOrderFromCheckoutAction` → `OrderService.createFromCheckout` → `create_order_from_checkout_internal` | **Protegida** | procura `source_cart_id` já convertido antes de criar; carrinho é travado; constraint única; RPC devolve `created=false` no replay; total é recalculado no servidor | integrações posteriores precisam manter deduplicação própria |
| WhatsApp pós-pedido | scheduler → worker → outbound | **Protegida** | fila com claim/lease e `notificationClientMessageId(order.id,type)` determinístico; mensagem já enviada é reutilizada | indisponibilidade do provedor pode atrasar, mas não deve recriar pedido |
| PIX online pós-pedido | `scheduleOrderPixCharge` → `OrderPixService.ensureForOrder` | **Protegida** | criação ocorre depois do commit do pedido e `ensureForOrder` é o boundary idempotente | PSP pode falhar; pagamento nunca é presumido |
| Confirmar/rejeitar/cancelar/concluir pedido | `OrderService.transition` → `order_transition_internal` | **Protegida** | state machine aceita replay `from===to`; RPC usa `FOR UPDATE`; mesmo estado retorna `changed=false` antes de histórico/evento | ações compostas devem tratar cada etapa separadamente |
| Pagamento/produção/fulfillment | `OrderService.transition` → `order_transition_internal` | **Protegida** | mesma proteção de lock + same-state no-op + state machine | integração externa de pagamento tem reconciliação própria |
| Cadastro de entregador | formulário → Server Action → `DriverMutationService` → RPC #181 | **Protegida** | chave gerada na UI atravessa até `idempotency_keys`; fingerprint rejeita mesma chave com payload diferente; replay devolve response anterior | migration 181 precisa ser promovida antes de valer em produção |
| Edição de entregador | formulário → Server Action → `DriverMutationService` → RPC #181 | **Protegida** | mesmo contrato de chave/fingerprint/replay | migration 181 precisa ser promovida |
| Fila/atribuição/self-claim/avanço de entrega | `DeliveryOperationsService` → RPCs de entrega | **Protegida** | chave explícita validada, lock/estado e escopo org/unidade | telemetria opcional é independente |
| Iniciar rota | `RouteTrackingService.startForDelivery` → `driver_route_start_internal` | **Protegida** | trava entrega; reutiliza sessão ativa do entregador; vínculo entrega↔sessão usa `ON CONFLICT DO NOTHING` | nenhum novo evento `route_started` quando sessão ativa já existe |
| Heartbeat de localização | `RouteTrackingService.heartbeat` → `driver_route_heartbeat_internal` | **Protegida para amostras de GPS** | `sample_key` único por sessão + `ON CONFLICT DO NOTHING`; rate limit | eventos de permissão negada/indisponível são telemetria e podem repetir após janela; não alteram pedido/entrega |
| Enfileirar impressão original do pedido | `PrintService` / `PrintQueueService` | **Protegida por estado/constraint** | pedido confirmado + roteamento/queue checks; pedido com job ativo não cria nova via pelo fluxo manual | confirmar após timeout deve consultar fila antes de nova tentativa |
| Retry/cancel/reconhecimento de job | `PrintQueueService` | **Protegida por estado** | mutação é feita sobre job existente e estado atual; reconhecimento manual exige confirmação explícita | repetição pode gerar auditoria adicional em alguns caminhos, sem nova impressão quando estado já mudou |
| Reimpressão | `PrintQueueService.reprint` | **Intencionalmente repetível** | exige `PRINTING_REPRINT`, cria via marcada como reprint e mantém trilha | não deve ser deduplicada entre solicitações conscientes diferentes |
| Criar estação de impressão | `createPrintStationAction` → `PrintConfigService.createStation` | **Parcial** | `Button` bloqueia submit enquanto pending; validação/constraint de código reduz duplicata | resposta perdida após insert pode fazer retry retornar conflito em vez do mesmo resultado; auditoria não tem chave de replay |
| Criar impressora manual | `createPrinterAction` → `PrintConfigService.createPrinter` | **Parcial** | submit pending, escopo e validação | timeout após commit pode deixar impressora criada e retry tentar outra criação; requer reconciliação/chave antes de #819 fechar |
| Quick setup de impressora detectada | `quickSetupDetectedPrinterAction` | **Parcial forte** | procura impressora/estação existente e atualiza/reutiliza quando encontra | auditoria/configuração composta ainda não possui uma única chave transacional de replay |
| Salvar preferências/cópias de impressão | updates/upsert | **Parcial forte** | mesmo payload converge ao mesmo estado | retry pode repetir linha de auditoria mesmo sem mudança lógica |
| Teste de impressão | `enqueuePrinterTestAction` | **Parcial / efeito consciente** | botão pending evita duplo clique local | timeout incerto pode gerar duas folhas de teste; precisa chave por intenção para ser replay-safe |
| Criar/reconectar Print Agent | `PrintAgentAdminService` | **Parcial** | permissão, escopo, estado e UI pending | retry após resposta perdida pode criar/rotacionar credencial novamente; manter aberto até reconciliação segura |

## Ações compostas do gestor de pedidos

`orderManagerAction` combina primitivas já protegidas por state machine (aceitar + iniciar, pagar + concluir, entrega manual etc.). Em retry após a primeira etapa ter sido confirmada, cada primitiva precisa interpretar o estado atual; uma etapa seguinte nunca deve ser executada apenas porque a anterior retornou timeout. A matriz #830 cobre estado incerto e concorrência.

## Contratos que não podem ser quebrados

- Reprint intencional continua permitido; idempotência não pode bloquear uma segunda via conscientemente solicitada.
- Telemetria e WhatsApp/PIX são posteriores ao pedido e nunca fazem rollback da criação autoritativa.
- Chaves pertencem ao contexto/operação; reaproveitar chave com payload diferente é erro.
- Escopo de entregador é por organização/unidade; não criar unicidade global de telefone.
- Replay de transição de estado não cria nova linha de histórico/domain event se o estado já é o solicitado.
- UI pending é defesa adicional, não substituto para idempotência do servidor em efeitos críticos.

## Pendências para fechar #819

1. Tornar criação manual de estação/impressora replay-safe quando a resposta do servidor se perde.
2. Tornar teste de impressão replay-safe para o mesmo envio, preservando a possibilidade de um novo teste consciente.
3. Tornar criação/reconexão do Print Agent reconciliável em retry sem criar/rotacionar credencial novamente.
4. Evitar auditoria duplicada em updates de configuração quando o mesmo payload é replay do mesmo envio.

Até essas pendências serem resolvidas, #819 deve permanecer aberta apesar da cobertura forte nos fluxos de pedido/entrega.
