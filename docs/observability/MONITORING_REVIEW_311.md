# [311] Monitoramento e tratamento de falhas

Data: 2026-08-14

## Contrato único

O PedeAqui mantém um logger estruturado único em `src/server/observability/logger.ts`. Novos logs de servidor devem passar por `logger.debug/info/warn/error`; boundaries críticos de falha usam `recordFailure` para evitar formatos e decisões diferentes em cada integração.

Campos canônicos de correlação:

- `requestId`: obrigatório no boundary de uma requisição monitorada;
- `organizationId`: quando a operação já resolveu o tenant;
- `storeId`: quando a operação pertence a uma unidade;
- `userId`: somente ID técnico quando necessário à auditoria/correlação;
- `failureKind`, `retryable`, `errorType`, `errorCode`: preenchidos por `recordFailure`.

O `requestId` recebido em `x-request-id` é reaproveitado quando válido; caso contrário `getRequestContext` cria UUID. APIs monitoradas devolvem `x-request-id` para que suporte, log e fornecedor consigam correlacionar a mesma falha.

## Dados que não entram em logs

`redactSensitive` continua sanitizando chaves de senha, segredo, token, Authorization, cookie, service role, API key, cartão e CVV. Além disso, o contrato operacional proíbe enviar deliberadamente ao logger:

- raw body de webhook;
- assinatura de webhook;
- access/refresh token;
- segredo de integração;
- cookie de sessão;
- senha;
- número completo de cartão/CVV;
- conteúdo integral de mensagem, endereço ou observação do cliente quando não forem indispensáveis.

Use IDs técnicos e códigos, não payload bruto. O logger não substitui Audit Log de negócio.

## Classificação e retry

| Classe | Exemplos | Retry automático? | Mensagem/ação |
|---|---|---:|---|
| `validation` | 400/422, payload inválido | não | corrigir entrada |
| `session` | 401/sessão inválida | não | autenticar novamente |
| `permission` | 403 | não | informar falta de acesso |
| `conflict` | 409/duplicidade lógica | não cego | atualizar/reconciliar estado |
| `rate_limit` | 429 | sim, com backoff | tentar novamente em instantes |
| `timeout` | 408/504/abort | sim, com idempotência | tentar novamente em instantes |
| `dependency` | 5xx/rede/provider | sim, quando a operação é idempotente | serviço temporariamente indisponível |
| `internal` | falha não classificada | não automaticamente | erro genérico + investigação |

`retryable=true` **não significa repetir imediatamente**. O worker/fila responsável deve aplicar backoff e idempotência. Em requests de webhook, responder 5xx permite que o fornecedor faça retry; erro definitivo deve ficar em 4xx.

## Boundaries ajustados nesta issue

### Billing webhook

- gera/reaproveita `requestId`;
- devolve `x-request-id` e o ID no corpo;
- não loga raw payload, assinatura ou mensagem interna;
- usa `recordFailure`;
- falha classificada como transitória responde 503; falha definitiva responde 400.

### WhatsApp webhook

- gera/reaproveita `requestId` no POST;
- devolve correlação nas respostas;
- raw body continua necessário somente em memória para validação HMAC e parsing, nunca entra no log;
- processamento inesperado usa `recordFailure` e mantém resposta 5xx ao fornecedor.

## Mensagens para telas

`failure-classification.ts` mantém textos operacionais consistentes para sessão, permissão, validação, conflito, indisponibilidade e timeout. Telas devem mostrar mensagem acionável e curta; detalhes internos permanecem no registro correlacionado.

Padrão:

- **usuário:** “Um serviço necessário está indisponível no momento. Tente novamente em instantes.”
- **log:** evento técnico + `requestId` + tenant/loja quando conhecido + classe/código, sem payload secreto.

Nunca mostrar ao usuário stack trace, SQLSTATE bruto, chave de provider, secret ref, token ou mensagem completa do fornecedor.

## Cenários protegidos por teste

- 400/422 não são retryáveis;
- 401 e 403 produzem mensagens distintas e não são retryáveis;
- 429, timeout e 5xx são classificados como transitórios;
- erro desconhecido não dispara retry automático;
- billing e WhatsApp propagam `x-request-id` e passam falhas pelo monitor padronizado;
- nenhum boundary monitorado volta a usar `console.error` diretamente;
- `redactSensitive` continua removendo credenciais conhecidas.
