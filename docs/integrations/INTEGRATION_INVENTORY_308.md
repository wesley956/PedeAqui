# [308] Inventário técnico de integrações — PedeAqui

Data: 2026-08-14

Este documento descreve os contratos externos existentes no código. Ele **não troca fornecedor**, não cria endpoint fictício e não transforma segredo em configuração pública.

## Matriz de contratos

| Integração | Entrada/saída | Contrato e autenticação | Idempotência/retry | Limites e erros | Logs e risco | Evidência principal |
|---|---|---|---|---|---|---|
| WhatsApp Cloud API | Saída `POST https://graph.facebook.com/{version}/{phoneNumberId}/messages`; entrada `GET/POST /api/webhooks/whatsapp` | saída usa Bearer token resolvido por referência de segredo; versão vem de `WHATSAPP_GRAPH_API_VERSION`; entrada verifica token de challenge em comparação constante e `x-hub-signature-256` com app secret | ingestão de eventos é delegada ao `ConversationService`; IDs externos servem de referência; provider de envio não faz retry HTTP automático, para evitar duplicação sem idempotency key do provedor | webhook limita corpo a 1 MB e recusa JSON/assinatura inválidos; envio limita detalhe de erro do provedor a 300 caracteres | endpoint de entrada não loga payload/segredo; erro de envio pode propagar apenas mensagem limitada do provedor. **Risco: médio** — disponibilidade depende da Meta e configuração dos secrets | `src/server/conversations/provider.ts`, `src/server/conversations/whatsapp-webhook.ts`, `src/app/api/webhooks/whatsapp/route.ts` |
| Billing / assinatura | Entrada `POST /api/webhooks/billing/[providerKey]` | provider é selecionado por `providerKey`; validação/assinatura pertence a `processBillingWebhook`; segredo permanece server-side | serviço de billing mantém identidade externa de evento/assinatura e deve rejeitar repetição conforme implementação do provider; endpoint não reprocessa manualmente por conta própria | limite explícito de 1 MB por header e bytes reais; falha retorna mensagem genérica 400 | HTTP boundary registra somente `errorType`, sem raw body, assinatura, token ou mensagem externa. **Risco: alto** por impacto em entitlement/cobrança | `src/app/api/webhooks/billing/[providerKey]/route.ts`, `src/server/platform/billing-webhook-service.ts` |
| Fiscal | Saída via registry/provider fiscal; entrada `POST /api/webhooks/fiscal/[integrationId]` | credenciais são referências de segredo resolvidas no servidor; integração é selecionada por configuração persistida/registry; webhook valida a integração antes de processar | fila/worker fiscal possui tentativas e estado persistido; webhook/service deve usar referência externa do documento/evento para não duplicar efeitos | provider/worker possuem timeout/erros controlados; artefatos fiscais são tratados em serviço próprio | credenciais não entram no client bundle; raw payload não deve ser logado. **Risco: alto** por validade fiscal e dependência do fornecedor | `src/server/fiscal/fiscal-provider.ts`, `fiscal-provider-registry.ts`, `fiscal-worker.ts`, `fiscal-webhook-service.ts`, `src/app/api/webhooks/fiscal/[integrationId]/route.ts` |
| Impressão local / Print Agent | App expõe `config`, `claim`, `ack`, `fail`, `heartbeat`; agente local faz polling e impressão ESC/POS | agente usa token próprio; token é validado no servidor e escopo deve permanecer loja/agente; nunca é chave de usuário final | jobs são claimados com lease e finalizados por ack/fail; spool local evita perda durante indisponibilidade; reentrega deve respeitar identidade do job | respostas e jobs são estruturados; CI executa `node --check` no agente; falha é reportada sem imprimir novamente de forma cega | não registrar token nem conteúdo sensível do pedido além do necessário. **Risco: alto** operacional, pois falha pode impedir produção física | `src/app/api/print-agent/*`, `src/server/printing/*`, `print-agent/src/index.mjs`, `spool.mjs`, `escpos.mjs` |
| Outbound webhooks | Saída HTTPS para endpoint configurado | exige HTTPS, host presente em `OUTBOUND_WEBHOOK_ALLOWED_HOSTS`, proíbe credenciais na URL; assina `timestamp.body` com HMAC SHA-256 e secret reference; redirect é `manual` | claim com lease de 120 s; `x-pedeaqui-delivery` identifica entrega; retry usa `Retry-After` numérico ou backoff exponencial limitado a 3600 s | timeout 10 s, batch 1–100; HTTP não-2xx vira falha persistida | não envia secret no payload/header; erro persistido deve permanecer técnico e sem valor do secret. **Risco: médio/alto** por egress externo; allowlist reduz SSRF | `src/server/integrations/outbound-webhook-worker.ts` |
| Health check | Entrada `GET /api/health` | público e intencional; não depende de sessão nem retorna segredo | não aplicável | resposta pequena, usada por orquestrador/monitor | deve revelar apenas disponibilidade/versionamento seguro, nunca env/config. **Risco: baixo** | `src/app/api/health/route.ts` |

## Configurações e segredos relevantes

Somente nomes/referências, nunca valores:

- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_APP_SECRET` ou referência equivalente persistida
- `WHATSAPP_ACCESS_TOKEN` ou referência equivalente persistida
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- referências de segredo do provider fiscal
- configuração/segredo do provider de billing
- token do Print Agent
- `OUTBOUND_WEBHOOK_ALLOWED_HOSTS`
- secret references de assinatura dos webhooks de saída

Regra: nenhuma dessas credenciais pode usar prefixo `NEXT_PUBLIC_`.

## Dependências e falhas esperadas

### WhatsApp

Dependências: Meta Graph API, número/phone-number-id configurado, app secret, access token e webhook registrado. Falhas recuperáveis: timeout/5xx/rate-limit; falhas de configuração: secret/version ausente; falhas definitivas: recipient/payload rejeitado. O envio atual não faz retry automático na camada HTTP; uma política futura deve ser implementada na fila de mensagens com idempotência, não repetindo `fetch` cegamente.

### Billing

Dependências: provider configurado e secret/assinatura válidos. Falha do webhook deve ser reentregável pelo fornecedor e idempotente no serviço. O endpoint limita corpo antes de delegar. Por impacto em assinatura/entitlements, alteração de parsing ou assinatura exige fixture do provider e teste de evento duplicado.

### Fiscal

Dependências: integração fiscal ativa, credenciais, serviço do fornecedor e fila/worker. Retentativas pertencem ao worker persistente; não devem ocorrer em loop de request. Emissão/cancelamento exige referência externa e estado local antes de repetir.

### Impressão

Dependências: agente em execução, token válido, impressora alcançável e spool gravável. `claim → impressão → ack/fail` é o fluxo canônico. O agente deve sobreviver a reinício sem tratar todo job como novo.

### Outbound webhook

Dependências: allowlist de egress, URL HTTPS, secret de assinatura e worker. Redirect não é seguido. Uma nova URL deve entrar na allowlist de forma explícita. Resposta 429/5xx respeita backoff; falhas 4xx ficam registradas e devem ser investigadas antes de retries prolongados.

### Health

É probe, não endpoint de diagnóstico administrativo. Não deve passar a expor status de secrets, conteúdo do banco, stack trace ou configuração interna.

## Matriz integração → risco → teste mínimo

| Integração | Teste mínimo obrigatório antes de release |
|---|---|
| WhatsApp | assinatura válida/inválida; body > 1 MB; evento repetido; envio rejeitado sem vazamento de token |
| Billing | assinatura/provider inválido; body > 1 MB; evento duplicado; erro sem log de raw body/headers |
| Fiscal | webhook inválido; evento duplicado; emissão/cancelamento retentado sem duplicar documento; secret ausente |
| Print Agent | token inválido; claim concorrente; ack/fail; reinício com spool; job não atribuído não pode ser impresso |
| Outbound webhook | HTTP obrigatório rejeitado; host fora da allowlist rejeitado; assinatura HMAC; timeout; Retry-After/backoff |
| Health | retorna sucesso sem segredo/env; falha controlada quando dependência crítica for incorporada no futuro |

## Decisões desta issue

- **Manter** os providers e contratos atuais; não há troca de fornecedor nesta etapa.
- **Corrigir agora** o log raw do webhook de billing: a rota passa a registrar somente o tipo do erro.
- **Não adicionar retry cego** no envio WhatsApp: duplicação de mensagem é pior do que delegar retry a uma fila idempotente futura.
- **Manter allowlist e HMAC** nos webhooks de saída.
- **Manter health minimalista**.
- A padronização global de observabilidade/logs será consolidada na [311].
