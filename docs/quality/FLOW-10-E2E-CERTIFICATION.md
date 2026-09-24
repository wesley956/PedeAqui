# FLOW-10 — Certificação E2E Checkout ↔ Robô ↔ WhatsApp ↔ Tracking

- Issue: #1141
- Data de abertura do ledger: 2026-09-20
- Branch: `flow/1141-e2e-certification`
- Baseline auditado: `2d7d8ae173e3e636c8bae93d896bc7050d57fc75`
- Decisão atual: **GO técnico da matriz; encerramento operacional pendente**
- Progresso do projeto: **10/10 na matriz obrigatória**
- Cenários P0: **44 PASS / 0 NOT PROVEN / 0 FAIL**

## Objetivo

Este documento é o ledger oficial da certificação final do PedeAqui antes de produção. Ele não substitui evidência executada. Um teste existente, nome de arquivo, contrato estático ou implementação aparentemente correta não transforma um cenário em PASS.

Um P0 só pode ser marcado como **PASS** quando a execução correspondente tiver evidência verificável registrada aqui e/ou na issue #1141.

## Regras de segurança da certificação

1. Não usar Dona Maria, Dom Burger ou qualquer cliente produtivo como ambiente de descoberta de regressão.
2. Não enviar mensagens Meta reais durante descoberta de defeitos.
3. Cenários transacionais devem usar ambiente descartável/rollback quando alterarem ou criarem dados.
4. Nenhuma nova regra de negócio é criada nesta FLOW.
5. Correção de runtime encontrada pela certificação deve ser isolada e reversível, preferencialmente em PR próprio.
6. Nenhum P0 pode ser aprovado apenas porque um teste com nome relacionado existe.
7. Enquanto houver P0 em `FAIL` ou `NOT PROVEN`, a decisão permanece **NO-GO**.

## Estados aceitos

- `NOT PROVEN`: requisito ainda sem evidência executada suficiente.
- `PASS`: requisito executado e evidência anexada.
- `FAIL`: execução demonstrou comportamento incorreto.

## Evidência canônica

Quando aplicável, o registro do cenário deve conter:

- `order_id` artificial/técnico;
- eventos gerados;
- `notification_job_id`;
- destinatário mascarado;
- status de envio/provider;
- status público de tracking;
- screenshot, artifact ou log estruturado;
- veredito PASS/FAIL.

Dados pessoais, telefone integral e conteúdo produtivo não devem ser anexados.

---

## Jornada A — Web Checkout

| ID | P0 | Requisito | Execução | Estado |
|---|---|---|---|---|
| A01 | sim | Cliente abre o cardápio público | E2E controlado | PASS |
| A02 | sim | Item simples + complemento/modificador canônico | E2E controlado | PASS |
| A03 | sim | Checkout preserva identidade, endereço e pagamento | DB descartável/rollback | PASS |
| A04 | sim | CTA de confirmação permanece acessível no mobile | Browser Homologation | PASS |
| A05 | sim | Checkout web cria exatamente um pedido | DB descartável/rollback | PASS |
| A06 | sim | `order.created` gera a notificação específica | DB descartável/rollback | PASS |
| A07 | sim | Cliente recebe estágio público `recebido` | E2E controlado | PASS |
| A08 | sim | Confirmação da loja converge para `confirmado` | E2E controlado | PASS |
| A09 | sim | Preparação/produção converge entre push e tracking | E2E controlado | PASS |
| A10 | sim | Entrega/retirada chega à conclusão no mesmo pedido | E2E controlado | PASS |
| A11 | sim | `onde está meu pedido?` reflete o último estágio público | E2E controlado | PASS |

## Jornada B — Pedido pelo WhatsApp

| ID | P0 | Requisito | Execução | Estado |
|---|---|---|---|---|
| B01 | sim | `Oi` inicia conversa de pedido com segurança | E2E controlado | PASS |
| B02 | sim | Estado operacional da loja é consultado antes de vender | E2E controlado | PASS |
| B03 | sim | Robô usa catálogo canônico | E2E controlado | PASS |
| B04 | sim | Robô usa complementos/opções canônicos | E2E controlado | PASS |
| B05 | sim | Carrinho/checkout passam pelos serviços oficiais | E2E controlado | PASS |
| B06 | sim | Pagamento e fulfillment são validados | E2E controlado | PASS |
| B07 | sim | Criação exige confirmação explícita `SIM` | E2E controlado | PASS |
| B08 | sim | Confirmação pelo WhatsApp cria exatamente um pedido | DB descartável/rollback | PASS |
| B09 | sim | WhatsApp e tracking usam mesma identidade/projeção pública | E2E controlado | PASS |
| B10 | sim | Handoff humano preserva contexto da conversa/checkout | E2E controlado | PASS |

## Jornada C — Loja fechada

| ID | P0 | Requisito | Execução | Estado |
|---|---|---|---|---|
| C01 | sim | `Oi` fora do horário informa loja fechada e próxima abertura quando disponível | E2E controlado | PASS |
| C02 | sim | `Quero pedir` fora do horário não cria pedido imediato | DB descartável/rollback | PASS |
| C03 | sim | Tracking de pedido legítimo continua funcionando com loja fechada | E2E controlado | PASS |

## Jornada D — Robustez, concorrência e segurança

| ID | P0 | Requisito | Execução | Estado |
|---|---|---|---|---|
| D01 | sim | Duplo clique/submit não duplica pedido | DB descartável/rollback | PASS |
| D02 | sim | Duas mensagens WhatsApp próximas não duplicam pedido/transição | DB descartável/rollback | PASS |
| D03 | sim | Retry do provider não duplica mensagem ao cliente | DB descartável/rollback | PASS |
| D04 | sim | Backlog >25 notification jobs drena sem perda/duplicidade | DB descartável/rollback | PASS |
| D05 | sim | Workers concorrentes fazem claim exatamente uma vez | DB descartável/rollback | PASS |
| D06 | sim | Refresh do checkout mantém resultado idempotente | E2E controlado | PASS |
| D07 | sim | Internet instável não duplica pedido nem corrompe estado público | E2E controlado | PASS |
| D08 | sim | Template Meta indisponível fora da janela falha de modo seguro e diagnosticável | E2E controlado | PASS |
| D09 | sim | Item pausado durante fluxo não vira venda stale | E2E controlado | PASS |
| D10 | sim | Link imperfeito do cliente usa snapshot seguro do pedido | E2E controlado | PASS |
| D11 | sim | Outro telefone/tenant não acessa o pedido | E2E controlado | PASS |
| D12 | sim | Handoff durante checkout WhatsApp preserva contexto retomável | E2E controlado | PASS |

---

## Matriz de dispositivos

A cobertura abaixo deve ser reexecutada pelo workflow oficial de Browser Homologation. Cobertura histórica ou presença do script não vale como execução da FLOW-10.

| ID | Dispositivo/viewport | Estado |
|---|---|---|
| M320 | 320×568 | PASS |
| M360 | 360×640 | PASS |
| M390 | 390×844 | PASS |
| M412 | 412×915 | PASS |
| M430 | 430×932 | PASS |
| MTAB | tablet | PASS |
| MDESK | desktop | PASS |
| MKEY | mobile com teclado virtual aberto | PASS |

Browser target: Chromium e WebKit onde previsto pelo workflow oficial.

### Evidência executada — Browser Homologation

- Workflow: <https://github.com/wesley956/PedeAqui/actions/runs/35499183077>
- Artifact: `browser-homologation-evidence` (`10601314868`)
- Digest: `sha256:893a114e7ff860e7b8efba59a2ae9fe21de744e6d69b18128c5f8aad5d14460c`
- Resultado: 43 checks, 0 failures.
- A04/M320/M360/M390/M412/M430: CTA visível com mensagens longas e viewport reduzido por teclado em Chromium e WebKit.
- MTAB/MDESK: páginas carregadas sem overflow nos viewports 768–1920 px.
- MKEY: CTA permaneceu visível nos cinco viewports mobile com altura reduzida para simular teclado virtual.

## Evidência executada — Loja fechada

### C01 — PASS

- Execução: mensagem real controlada enviada à Dona Maria após o deploy do hotfix de horário.
- Timestamp: `2026-09-20T07:51:50.019364Z` (entrada registrada).
- Environment: produção, verificação pós-deploy autorizada.
- order_id: N/A; nenhum pedido foi criado por esta saudação.
- events: `closed_notice`.
- notification_job_id: N/A.
- recipient: mascarado na evidência pública.
- provider_status: `delivered`.
- public_tracking_status: N/A.
- Deployment: `dpl_9aB1e1crfmDinM3RqenztVP5Lpnh` (`READY`).
- Evidência canônica: <https://github.com/wesley956/PedeAqui/issues/1141#issuecomment-5748521010>
- Veredito: **PASS** — a saudação fora do horário produziu `auto:wa-order:closed-greeting`, informou loja fechada e não gerou erro de automação.

## Evidência executada — Checkout e fila em banco descartável

### A05, A06, D01, D04 e D05 — PASS

- Workflow: <https://github.com/wesley956/PedeAqui/actions/runs/35552631268>
- Artifact: `isolated-chaos-evidence` (`10618534610`)
- Digest: `sha256:ebdced1586524da6a8229d0f8bbca8ad0257a5be7e6072422b16721ad1d87e2f`
- Environment: Supabase local efêmero, sem link com projeto hospedado.
- Execução: três passes consecutivos; cada fixture terminou com `ROLLBACK`.
- A05/D01: duas chamadas de checkout com a mesma identidade retornaram o mesmo `order_id`, com flags `created=true/false`, e deixaram exatamente um pedido.
- A06: 27 checkouts técnicos emitiram 27 jobs `order_received` a partir dos eventos autoritativos, um por pedido.
- D04: lote inicial de 25, job alvo com retry e job residual foram drenados; os 27 terminaram em `sent` e a cardinalidade permaneceu 27.
- D05: duas sessões PostgreSQL simultâneas mantiveram locks concorrentes; cada worker reclamou 10 jobs, totalizando 20 IDs únicos com `attempts=1`, nos três passes.
- Dados: UUIDs reservados e destinatário `.invalid`; nenhum cliente real ou provider foi usado.
- Veredito: **PASS** para A05, A06, D01, D04 e D05.
- Limite da prova: esta execução SQL não enviou ao provider; a prova controlada e o deploy de D03 estão registrados separadamente abaixo.

### D03 — PASS

- Auditoria produtiva somente leitura da Dona Maria: WhatsApp ativo via Meta Cloud, 524 notificações de pedido e 906 mensagens outbound.
- Duplicidades observadas: 0 grupos por `order_id + notification_type`, 0 por `client_message_id` e 0 por `external_message_id`.
- Teste controlado, sem envio Meta real: timeout de rede → erro 408 recuperável → retry com a mesma identidade lógica → uma única aceitação do provider simulado.
- Correção isolada: PR <https://github.com/wesley956/PedeAqui/pull/1154>, head `12dc6e0a1a63dbc35b71cc928a4ef05e337e8735`, merge `07abe35a3b79220f049f5962d4c5f9e03d557b25`.
- Gates: CI <https://github.com/wesley956/PedeAqui/actions/runs/35553854093> e Browser Homologation <https://github.com/wesley956/PedeAqui/actions/runs/35553854095>, ambos `success`.
- Produção: deployment Vercel `dpl_2RT1Uxh4zQb5ZR9ieajwhtztEViK` em `READY`; `/api/health` HTTP 200 com `status=ok`; 0 runtime errors e 0 respostas 5xx após o deploy.
- Evidência canônica: <https://github.com/wesley956/PedeAqui/issues/1141#issuecomment-5754620683>
- Veredito: **PASS** — timeout de transporte agora entra no retry durável e a prova controlada registrou uma única aceitação.

### C02 e D02 — PASS

- Commit da prova: `fc3c285afb13b745a43dbbb99bf05a98dfc06b87`.
- C02: o teste comportamental executou `Quero pedir` com `canOrder=false`; o orquestrador respondeu como loja fechada antes de chamar o serviço de pedido, sem criar nem alterar checkout.
- D02: duas mensagens técnicas `SIM`, com IDs externos distintos, foram registradas para a mesma conversa e duas sessões PostgreSQL confirmaram simultaneamente o mesmo carrinho pelo canal `whatsapp`.
- Resultado concorrente, repetido em três passes: uma resposta `created=true`, uma `created=false`, o mesmo `order_id`, exatamente 1 pedido, 1 evento `order.created` e 4 transições iniciais.
- Environment: Supabase local efêmero; UUIDs, telefone e mensagens exclusivamente técnicos; nenhum cliente, projeto hospedado ou provider real foi usado.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35555635543> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35555635554> (`success`).
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35555635551> (`success`).
- Artifact: `isolated-chaos-evidence` (`10619264761`).
- Digest: `sha256:7a5eece550d366bc05a3c1eee96b76cd25c0006fa5f2259ad08e873893db908e`.
- Veredito: **PASS** para C02 e D02.

### B07 e B08 — PASS

- Commit da prova: `6beeb35379484cf5c5682cb2791324c1af89dec3`.
- B07: respostas vagas e `NÃO` mantiveram/cancelaram o fluxo sem chamar o checkout; apenas `SIM` acionou a criação oficial.
- B08: a criação recebeu `storeSlug`, o mesmo `cartToken` e o canal `whatsapp`; em seguida preservou o contexto de tracking e agendou a notificação para o mesmo `order_id`.
- A prova concorrente de D02 complementa o caminho: duas confirmações simultâneas retornaram o mesmo `order_id`, com uma criação e um replay, sem duplicar pedido, evento ou transições.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35571118936> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35571119106> (`success`).
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35571118933> (`success`).
- Artifact: `isolated-chaos-evidence` (`10626445285`).
- Digest: `sha256:ed8cb67e6733bdb1390121ebf62a85413499bf4ab04d27a0a7c0a4456f3e14df`.
- Veredito: **PASS** para B07 e B08.

### B01 e B02 — PASS

- Commit da prova: `5732b560c1b8fdd64cc6f33c8b26086320999181`.
- B01: `Oi` recebeu uma saudação da loja técnica com identidade correta, URL canônica do cardápio, opção `Fazer pedido pelo WhatsApp` e sessão persistida em `menu`.
- B02: `Quero pedir` consultou `StoreOperationalStatusService` antes de abrir `order_items`; com loja fechada, a mesma fronteira já comprovada em C02 bloqueia a entrada no pedido.
- Provider: simulado; nenhum envio Meta real foi realizado.
- Dados: organização, loja, conversa, telefone e mensagens exclusivamente técnicos.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35572348505> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35572348490> (`success`).
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35572348512> (`success`).
- Artifact: `isolated-chaos-evidence` (`10626074737`).
- Digest: `sha256:8926666ca8c7feb61e6d53701ce70dc008fb36bd2361bdf9157883ff27626292`.
- Veredito: **PASS** para B01 e B02.

### B03 e B04 — PASS

- Commit da prova: `a200fb6ca2a3509bc01ed440ffa817c65c0f5fdd`.
- B03: o fluxo recebeu somente o produto do catálogo técnico canônico, consultou com `organizationId`, `storeId` e `storeSlug`, recarregou os detalhes pelo mesmo escopo e enviou ao carrinho o ID e a quantidade canônicos.
- B04: o fluxo exibiu as opções e o preço adicional vindos dos detalhes canônicos; a escolha numérica foi convertida no `modifierId` canônico antes do carrinho. Uma opção inexistente foi rejeitada sem mutação.
- Provider: não utilizado; nenhuma mensagem Meta real foi enviada.
- Dados: UUIDs, loja, telefone, produto e opções exclusivamente técnicos.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35583718248> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35583718153> (`success`).
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35583717979> (`success`).
- Artifact: `isolated-chaos-evidence` (`10631926190`).
- Digest: `sha256:fafe5e0b92fb5fc457a1e2a6d1688d7a6a7be4e679f2d59516d5b2fc5b11a139`.
- Veredito: **PASS** para B03 e B04.

### B05 e B06 — PASS

- Commit da prova: `bc1ce815556f955d886724278cd91c3078d09f72`.
- B05: identidade, fulfillment e pagamento percorreram os métodos oficiais do `CheckoutService` com o mesmo `storeSlug` e `cartToken`; o resumo foi carregado do checkout oficial antes da confirmação.
- B06: fulfillment inválido não alterou o checkout; retirada válida carregou as formas de pagamento com `organizationId` e `storeId`; pagamento inexistente não avançou nem gravou; somente uma forma habilitada salvou e abriu a confirmação.
- Provider: não utilizado; nenhuma mensagem Meta real foi enviada.
- Dados: organização, loja, telefone, carrinho e item exclusivamente técnicos.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35584705532> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35584705474> (`success`).
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35584705495> (`success`).
- Artifact: `isolated-chaos-evidence` (`10631639289`).
- Digest: `sha256:f460953bbf490b63a43f9bebac03ca7dd5f645182bdb6adc32f8f4b8f3630cc7`.
- Veredito: **PASS** para B05 e B06.

### B09, B10, D09, D11 e D12 — PASS

- Commit da prova: `37cdb0bcaeabc4a1f70c2568d4d0241c55f05b37`.
- B09: um job técnico `out_for_delivery` preservou o mesmo `order_id` da fila até a mensagem simulada e o link seguro; a consulta do robô devolveu o mesmo número, URL e estágio público `Saiu para entrega`.
- B10: antes de mover a conversa para `waiting_agent`, o orquestrador persistiu o passo `order_payment`, o mesmo `cartToken`, fulfillment e identidade, com TTL estendido para atendimento humano.
- D09: ao recarregar um item alterado para `sold_out` durante a escolha de opções, o fluxo descartou o estado stale, não chamou o carrinho e pediu uma nova seleção.
- D11: a recuperação de pedidos aplicou filtros explícitos de `organization_id` e `store_id` e retornou somente o pedido cujo telefone snapshot pertencia ao mesmo WhatsApp; fixtures de outro tenant, outra loja e outro telefone foram excluídas.
- D12: a política retomou exatamente `order_payment` somente com sessão e carrinho ativos; quando o carrinho já havia virado pedido, recuperou para menu seguro em vez de repetir confirmação.
- order_id: `74000000-0000-4000-8000-000000000003` (fixture técnica).
- events: `fulfillment.out_for_delivery` / domain event `74000000-0000-4000-8000-000000000004`.
- notification_job_id: `74000000-0000-4000-8000-000000000005`.
- recipient: `55********00` (fixture técnica mascarada).
- provider_status: `sent` em provider simulado; nenhum envio Meta real.
- public_tracking_status: `out_for_delivery` / `Saiu para entrega`.
- Dados: organização, loja, conversa, telefone, carrinho e pedidos exclusivamente técnicos.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35608283133> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35608283135> (`success`).
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35608283164> (`success`).
- Artifact: `isolated-chaos-evidence` (`10642038099`).
- Digest: `sha256:8b8bfe7f932866a8ea8b77ac780048be14a03a6bd96e81c5165bc10efc96e50a`.
- Veredito: **PASS** para B09, B10, D09, D11 e D12.

### A01, A02, C03, D06, D07, D08 e D10 — PASS

- Commit da prova: `ac2345a50d2a4819e7f682cfc8586488fbadc7c4`.
- A01: a projeção pública canônica abriu o cardápio técnico, preservou loja, categoria, produto disponível e estado operacional aberto.
- A02: o carrinho oficial recalculou o item e persistiu o `modifierId` canônico com snapshots de grupo, nome, preço e quantidade; nenhum preço do cliente foi aceito como autoridade.
- C03: a mesma loja foi projetada como fechada para novas vendas, enquanto o pedido legítimo protegido por token continuou retornando o mesmo `order_id` e estágio público `preparing`.
- D06: criação e refresh usaram o mesmo token; a primeira resposta foi `created=true`, a segunda `created=false`, ambas com o mesmo pedido e access token, e apenas uma chamada de criação.
- D07: a prova simulou perda da resposta depois do commit. O retry recuperou o pedido já persistido sem nova RPC de criação e a projeção pública permaneceu `confirmed/preparing`.
- D08: fora da janela da Meta e sem template aprovado, o job terminou em `skipped/template_required`, sem `sendText`, `sendTemplate` ou mutação do pedido.
- D10: com vínculo de cliente ausente, o worker normalizou o telefone do snapshot imutável do pedido, resolveu a conversa para esse destinatário e enviou o link seguro do mesmo pedido pelo provider simulado.
- order_id: `75000000-0000-4000-8000-000000000008` (C03), `76000000-0000-4000-8000-000000000004` (D06/D07) e `77000000-0000-4000-8000-000000000003` (D08/D10), todos fixtures técnicos.
- events: criação idempotente do checkout (D06/D07) e `fulfillment.out_for_delivery` (D08/D10); A01/A02/C03 são leituras/mutação de carrinho controlada sem evento de pedido novo.
- notification_job_id: `77000000-0000-4000-8000-000000000005` para D08/D10; N/A para os demais.
- recipient: `55********00` (fixture técnica mascarada) para D08/D10; N/A para os demais.
- provider_status: `skipped/template_required` em D08, `sent` em provider simulado em D10 e N/A nos demais; nenhum envio Meta real.
- public_tracking_status: `preparing` em C03 e D07; link seguro do mesmo `order_id` em D10; N/A para A01/A02/D06/D08.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35632218975> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35632218997> (`success`), incluindo a etapa `Run FLOW-10 controlled resilience batch`.
- Browser artifact: `browser-homologation-evidence` (`10654861772`).
- Browser digest: `sha256:15b5a0793da4884ab7d06ff4efd68f5fac614ac9816b4d0ba4eb7d900b64c2e2`.
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35632219059> (`success`).
- Isolated artifact: `isolated-chaos-evidence` (`10655431090`).
- Isolated digest: `sha256:79dffeaf7e537355250c6648917351be4bf956f2d3b8d0b18b9c308724786c89`.
- Veredito: **PASS** para A01, A02, C03, D06, D07, D08 e D10.

### A03 e A07–A11 — PASS

- Commit da prova: `17bc82c72c421adad1788603251005c8ac9a11db`.
- A03: uma fixture SQL descartável criou checkout técnico com identidade, telefone, e-mail, endereço, taxa/prazo de entrega e pagamento; a função canônica de criação preservou os snapshots no mesmo pedido e emitiu `order.created` e o job `order_received`. Cada passe terminou com `ROLLBACK`.
- A07–A10: o worker real de notificações foi executado contra provider simulado para `order_received`, `order_confirmed`, `production_preparing` e `delivered`; cada job terminou em `sent` e convergiu respectivamente para `received`, `confirmed`, `preparing` e `delivered` no tracking público do mesmo pedido.
- A11: a consulta `onde está meu pedido?` devolveu o mesmo pedido, estágio terminal `Entregue` e link seguro usado durante a jornada ativa.
- order_id A03: UUID gerado no banco descartável e registrado no log estruturado `FLOW10_A03_EVIDENCE` do artifact de Chaos.
- order_id A07–A11: `78000000-0000-4000-8000-000000000003` (fixture técnica).
- events A07–A11: IDs técnicos `78000000-0000-4000-8000-000000000021` a `78000000-0000-4000-8000-000000000025`.
- notification_job_id A07–A11: IDs técnicos `78000000-0000-4000-8000-000000000011` a `78000000-0000-4000-8000-000000000015`.
- recipient: `55********44` (fixture técnica mascarada).
- provider_status: `sent` em provider simulado; nenhum envio Meta real.
- public_tracking_status: `received`, `confirmed`, `preparing` e `delivered`; A11 confirmou o último estágio `delivered`.
- CI: <https://github.com/wesley956/PedeAqui/actions/runs/35638962392> (`success`).
- Browser Homologation: <https://github.com/wesley956/PedeAqui/actions/runs/35638962314> (`success`), incluindo `Run FLOW-10 controlled resilience batch`.
- Browser artifact: `browser-homologation-evidence` (`10657348046`).
- Browser digest: `sha256:dd589948bb22b70682e66471fb404778fd313e627e63180d95c9c53ae9dfa214`.
- Isolated Chaos: <https://github.com/wesley956/PedeAqui/actions/runs/35638962223> (`success`), com três passes em banco efêmero e rollback.
- Isolated artifact: `isolated-chaos-evidence` (`10656699503`).
- Isolated digest: `sha256:e56cc0231335de53817b37119bc9310526a8d0335729ca1ebfde0bfbe39d4542`.
- Veredito: **PASS** para A03 e A07–A11.

## Gates técnicos

| Gate | Critério FLOW-10 | Estado atual |
|---|---|---|
| Teste focado FLOW-10 | `vitest run tests/flow-10-e2e-certification.test.ts` | PASS — CI #1976 |
| Typecheck | `tsc --noEmit` | PASS — CI #1976 |
| Lint | `eslint .` | PASS — CI #1976 |
| Full suite | suíte Vitest completa | PASS — CI #1976 |
| Public UX | script oficial do repositório | PASS — CI #1976 |
| Route integrity | `check:routes` | PASS — CI #1976 |
| Production preflight | `preflight:production` | PASS — CI #1976 |
| Build | Next.js production build | PASS — CI #1976 |
| Browser Homologation | workflow oficial Chromium/WebKit | PASS — #470 |
| Isolated Chaos | obrigatório para a evidência transacional/SQL | PASS — #216 |

Gates oficiais no SHA `17bc82c72c421adad1788603251005c8ac9a11db`: CI <https://github.com/wesley956/PedeAqui/actions/runs/35638962392>, Browser Homologation <https://github.com/wesley956/PedeAqui/actions/runs/35638962314> e Isolated Chaos <https://github.com/wesley956/PedeAqui/actions/runs/35638962223>.

## Contratos existentes que ajudam, mas não fecham a certificação

O repositório já contém suites de contrato e UX, incluindo idempotência/concorrência, isolamento de acesso, tracking público, checkout progressivo, QA mobile e acessibilidade. Elas devem compor a evidência agregada, porém não substituem a jornada integrada exigida pela #1141.

Exemplo: `tests/concurrency-contracts.test.ts` verifica locks, unicidade e leasing no SQL. Isso é evidência de contrato estrutural; não é, isoladamente, prova de que um retry real do provider ou dois workers concorrentes produziram exatamente uma entrega ao cliente.

## Registro de execução

Preencher para cada evidência:

```text
Scenario: A05
Execution: <workflow/run/test>
Timestamp: <UTC ISO-8601>
Environment: <disposable/staging/local-ci>
order_id: <technical artificial id or N/A>
events: <ids/names or N/A>
notification_job_id: <technical id or N/A>
recipient: <masked or N/A>
provider_status: <status or N/A>
public_tracking_status: <status or N/A>
artifact: <run URL / artifact / structured log>
verdict: PASS | FAIL
notes: <objective observation>
```

## Critério de GO

A FLOW-10 muda de **9/10 / NO-GO** para **10/10 / GO técnico da matriz** quando:

1. todos os P0 estiverem `PASS`;
2. nenhum PASS estiver sem evidência;
3. não houver duplicação de pedido/mensagem nos cenários de retry e concorrência;
4. loja fechada bloquear venda imediata pelo robô sem quebrar tracking legítimo;
5. WhatsApp, eventos, notification jobs e tracking convergirem para o mesmo pedido/estágio público;
6. isolamento por telefone/tenant estiver provado;
7. handoff humano mantiver contexto;
8. matriz mobile/browser estiver verde;
9. CI, lint, typecheck, testes relevantes e build estiverem verdes;
10. as evidências finais estiverem registradas na #1141.

Os dez critérios estão atendidos: **44/44 P0 estão PASS**, sem FAIL ou evidência ausente. A matriz alcançou **10/10 / GO técnico**. O PR permanece em rascunho e a issue permanece aberta até os passos adicionais de encerramento operacional serem explicitados e executados; como este lote altera apenas testes, workflow e documentação, não há runtime novo para publicar em produção.
