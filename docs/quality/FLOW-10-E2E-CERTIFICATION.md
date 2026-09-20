# FLOW-10 — Certificação E2E Checkout ↔ Robô ↔ WhatsApp ↔ Tracking

- Issue: #1141
- Data de abertura do ledger: 2026-09-20
- Branch: `flow/1141-e2e-certification`
- Baseline auditado: `2d7d8ae173e3e636c8bae93d896bc7050d57fc75`
- Decisão atual: **NO-GO**
- Progresso do projeto: **9/10**
- Cenários P0: **10 PASS / 34 NOT PROVEN / 0 FAIL**

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
| A01 | sim | Cliente abre o cardápio público | E2E controlado | NOT PROVEN |
| A02 | sim | Item simples + complemento/modificador canônico | E2E controlado | NOT PROVEN |
| A03 | sim | Checkout preserva identidade, endereço e pagamento | E2E controlado | NOT PROVEN |
| A04 | sim | CTA de confirmação permanece acessível no mobile | Browser Homologation | PASS |
| A05 | sim | Checkout web cria exatamente um pedido | DB descartável/rollback | NOT PROVEN |
| A06 | sim | `order.created` gera a notificação específica | DB descartável/rollback | NOT PROVEN |
| A07 | sim | Cliente recebe estágio público `recebido` | E2E controlado | NOT PROVEN |
| A08 | sim | Confirmação da loja converge para `confirmado` | E2E controlado | NOT PROVEN |
| A09 | sim | Preparação/produção converge entre push e tracking | E2E controlado | NOT PROVEN |
| A10 | sim | Entrega/retirada chega à conclusão no mesmo pedido | E2E controlado | NOT PROVEN |
| A11 | sim | `onde está meu pedido?` reflete o último estágio público | E2E controlado | NOT PROVEN |

## Jornada B — Pedido pelo WhatsApp

| ID | P0 | Requisito | Execução | Estado |
|---|---|---|---|---|
| B01 | sim | `Oi` inicia conversa de pedido com segurança | E2E controlado | NOT PROVEN |
| B02 | sim | Estado operacional da loja é consultado antes de vender | E2E controlado | NOT PROVEN |
| B03 | sim | Robô usa catálogo canônico | E2E controlado | NOT PROVEN |
| B04 | sim | Robô usa complementos/opções canônicos | E2E controlado | NOT PROVEN |
| B05 | sim | Carrinho/checkout passam pelos serviços oficiais | E2E controlado | NOT PROVEN |
| B06 | sim | Pagamento e fulfillment são validados | E2E controlado | NOT PROVEN |
| B07 | sim | Criação exige confirmação explícita `SIM` | E2E controlado | NOT PROVEN |
| B08 | sim | Confirmação pelo WhatsApp cria exatamente um pedido | DB descartável/rollback | NOT PROVEN |
| B09 | sim | WhatsApp e tracking usam mesma identidade/projeção pública | E2E controlado | NOT PROVEN |
| B10 | sim | Handoff humano preserva contexto da conversa/checkout | E2E controlado | NOT PROVEN |

## Jornada C — Loja fechada

| ID | P0 | Requisito | Execução | Estado |
|---|---|---|---|---|
| C01 | sim | `Oi` fora do horário informa loja fechada e próxima abertura quando disponível | E2E controlado | PASS |
| C02 | sim | `Quero pedir` fora do horário não cria pedido imediato | DB descartável/rollback | NOT PROVEN |
| C03 | sim | Tracking de pedido legítimo continua funcionando com loja fechada | E2E controlado | NOT PROVEN |

## Jornada D — Robustez, concorrência e segurança

| ID | P0 | Requisito | Execução | Estado |
|---|---|---|---|---|
| D01 | sim | Duplo clique/submit não duplica pedido | DB descartável/rollback | NOT PROVEN |
| D02 | sim | Duas mensagens WhatsApp próximas não duplicam pedido/transição | DB descartável/rollback | NOT PROVEN |
| D03 | sim | Retry do provider não duplica mensagem ao cliente | DB descartável/rollback | NOT PROVEN |
| D04 | sim | Backlog >25 notification jobs drena sem perda/duplicidade | DB descartável/rollback | NOT PROVEN |
| D05 | sim | Workers concorrentes fazem claim exatamente uma vez | DB descartável/rollback | NOT PROVEN |
| D06 | sim | Refresh do checkout mantém resultado idempotente | E2E controlado | NOT PROVEN |
| D07 | sim | Internet instável não duplica pedido nem corrompe estado público | E2E controlado | NOT PROVEN |
| D08 | sim | Template Meta indisponível fora da janela falha de modo seguro e diagnosticável | E2E controlado | NOT PROVEN |
| D09 | sim | Item pausado durante fluxo não vira venda stale | E2E controlado | NOT PROVEN |
| D10 | sim | Link imperfeito do cliente usa snapshot seguro do pedido | E2E controlado | NOT PROVEN |
| D11 | sim | Outro telefone/tenant não acessa o pedido | E2E controlado | NOT PROVEN |
| D12 | sim | Handoff durante checkout WhatsApp preserva contexto retomável | E2E controlado | NOT PROVEN |

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

- Workflow: <https://github.com/wesley956/PedeAqui/actions/runs/35497138737>
- Artifact: `browser-homologation-evidence` (`10601056212`)
- Digest: `sha256:3f454489cb7373c0ddb2674be48880a82a26cdb95fce930dba4d8fb3e52049ac`
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

## Gates técnicos

| Gate | Critério FLOW-10 | Estado atual |
|---|---|---|
| Teste focado FLOW-10 | `vitest run tests/flow-10-e2e-certification.test.ts` | PENDING |
| Typecheck | `tsc --noEmit` | PENDING |
| Lint | `eslint .` | PENDING |
| Full suite | suíte Vitest completa | PENDING |
| Public UX | script oficial do repositório | PENDING |
| Route integrity | `check:routes` | PENDING |
| Production preflight | `preflight:production` | PENDING |
| Build | Next.js production build | PENDING |
| Browser Homologation | workflow oficial Chromium/WebKit | PENDING |
| Isolated Chaos | obrigatório para a evidência transacional/SQL | PENDING |

O runner descartável inclui agora `e2e_order_notification_targeted_claim.sql`, que cria 27 pedidos técnicos dentro de transação, produz backlog acima de 25 jobs, exercita claim concorrente e retry e encerra com `ROLLBACK`. A presença do teste não altera sozinha os vereditos: A05, A06, D01, D03, D04 e D05 continuam `NOT PROVEN` até o workflow Isolated Chaos terminar com artifact verificável.

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

A FLOW-10 só pode mudar de **9/10 / NO-GO** para **10/10 / GO técnico** quando:

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

Até lá, a decisão documentada permanece **NO-GO**.
