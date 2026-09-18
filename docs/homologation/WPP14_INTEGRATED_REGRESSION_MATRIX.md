# WPP-14 — Matriz de certificação integrada

Issue: #1118  
Parent: #1050  
Baseline antes do lote: `c6c59145f68215de7f640c7a98875ded05c96a4a`

## Propósito

Este artefato liga os riscos de release da Inbox WhatsApp às suites canônicas já existentes. A WPP-14 não substitui essas suites e não cria uma segunda fonte de verdade: o gate válido é o **CI completo** executando o repositório inteiro, mais Browser Homologation e build.

## Baseline de engenharia

Antes da WPP-14, o último CI verde executou:

- 347 arquivos / 2.287 testes;
- public UX: 12 arquivos / 84 testes;
- E2E context journeys: 3 execuções consecutivas, 7 testes cada;
- Print Agent syntax/entrypoint gate;
- build Next.js;
- Browser Homologation.

A matriz #1045 permanece com 720 cenários determinísticos e a INT-13 mantém a certificação cross-domain.

## Inbox / WhatsApp

| Risco | Evidência principal |
|---|---|
| AppShell, lista/chat/contexto e responsividade | `wpp-03-conversations-inbox-ui.test.ts` |
| paginação, realtime, unread, busca | `wpp-04-inbox-pagination-realtime.test.ts` |
| customer/endereço/pedido canônicos | `wpp-05-inbox-customer-order-context.test.ts` |
| resposta humana pelo painel | `conversations.test.ts`, `int-12-inbox-handoff-coexistence.test.ts` |
| claim/handoff e concorrência | `wpp-07-handoff-claim-hardening.test.ts` |
| Coexistence / echo / diagnósticos Meta | `wpp-08-platform-revalidation-diagnostics.test.ts`, `whatsapp-coexistence.test.ts` |
| history/state sync | `wpp-09-coexistence-history-state-sync.test.ts` |
| mídia privada / ACL / MIME | `wpp-10-conversation-media.test.ts` |
| janela Meta e templates | `wpp-11-meta-window.test.ts` |
| RBAC / tenant / LGPD | `wpp-12-inbox-rbac-lgpd.test.ts` |
| health operacional / sem PII | `wpp-13-whatsapp-operational-health.test.ts` |

## Pedido / checkout

| Risco | Evidência principal |
|---|---|
| pedido WhatsApp direto e confirmação | `whatsapp-direct-orders.test.ts` |
| contexto/correção/composição | `whatsapp-order-context.test.ts`, `whatsapp-order-corrections.test.ts`, `whatsapp-assorted-composition.test.ts` |
| fluxo de pedido | `order-state-machines.test.ts`, `order-workflow-customization-807.test.ts` |
| readiness checkout/pedido | `checkout-order-readiness-031-035.test.ts`, `order-flow-readiness-036-040.test.ts` |
| pagamento e Pix | `whatsapp-payment-parity-int08.test.ts`, `order-pix-security-contract.test.ts` |
| acompanhamento/status | `whatsapp-order-tracking-input.test.ts`, `public-order-timeline.test.ts` |
| operação completa | `operational-order-day.test.ts` |

## Impressão / KDS

| Risco | Evidência principal |
|---|---|
| autenticação/ownership Print Agent | `print-agent-token.test.ts` |
| setup e recuperação | `printing-simple-setup.test.ts` |
| layout/cópias/template | `printing-templates.test.ts` |
| pedido omnichannel → cozinha/impressão | `omnichannel-kitchen-print.test.ts` |
| falha de impressão não muda pedido | suites de printing + order state machine |

Além das suites, o workflow CI executa validação sintática dos entrypoints do Print Agent antes do build.

## Inteligência e paridade cross-domain

| Contrato | Evidência |
|---|---|
| 720 cenários únicos | `whatsapp-intelligence-matrix.test.ts` |
| router/intenção | `unified-intelligence-router.test.ts` |
| authority | `intelligence-authority.test.ts` |
| capability | `intelligence-capability.test.ts` |
| catálogo/preço | `intelligence-catalog-adapter.test.ts` |
| pagamento | `intelligence-payment-adapter.test.ts` |
| entrega | `intelligence-delivery-adapter.test.ts` |
| workflow | `intelligence-order-workflow-adapter.test.ts` |
| Growth no canal WhatsApp | `int-09-growth-whatsapp-channel.test.ts` |
| relatório INT-13 | `docs/intelligence/INT13_CROSS_DOMAIN_CERTIFICATION_REPORT.md` |

## Stop conditions

WPP-14 é NO-GO se ocorrer:

- cross-tenant leak;
- mismatch de preço, pagamento, status, authority ou confirmação;
- pedido duplicado;
- bot responder enquanto a conversa está em humano;
- carrinho/pedido perdido no handoff;
- echo duplicado;
- mensagem livre enviada fora da janela Meta;
- template de WABA/tenant incorreto;
- signed URL de mídia cruzando tenant/store/conversa;
- impressão/KDS quebrada;
- migration/drift incompatível;
- full test, public contracts, E2E, Print Agent, build ou Browser vermelho.

## Gate físico separado — WPP-10

A #1110 continua aberta enquanto não existir uma **mídia nova real pós-deploy** comprovando o caminho de produção:

`Meta → webhook → download server-side → validação → storage privado → Inbox → signed URL/player/download autenticado`.

A WPP-14 pode certificar os contratos automatizados, mas **não transforma essa ausência de evidência em GO para WPP-15**.

## Regras de rollout

- WPP-14 não ativa cliente;
- não altera subscriptions Meta;
- não ativa history/state sync;
- não cria feature flag;
- não usa Dona Maria, Dom Burger ou outra loja como canário automaticamente;
- os resultados dos workflows finais devem ser registrados na #1118 com SHA e contagens reais.
