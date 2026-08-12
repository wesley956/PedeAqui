# PedeAqui — Conversas / WhatsApp / IA [152]–[163]

Milestone 16. Issues #170–#181. Draft PR #182.

## Implementado

- `contacts` por organização/unidade/canal, com vínculo opcional e automático ao CRM por telefone normalizado;
- `conversations` com estados `bot`, `waiting_agent`, `human`, `closed`;
- State Machine com lock, histórico, auditoria e eventos;
- `messages` com inbound/outbound, IDs externos, idempotência e status de entrega;
- conteúdo de mensagem protegido contra reescrita após criação;
- `automation_sessions` versionadas por conversa;
- Inbox `/conversas` com filtros, unread, timeline, assumir, fila, bot, encerrar e responder;
- Realtime em `conversations` e `messages`;
- configuração do provider em `/configuracoes/conversas`, mantendo credenciais fora do browser e fora das tabelas do domínio;
- adapter desacoplado para WhatsApp Cloud API;
- endpoint `/api/webhooks/whatsapp` com verificação, assinatura HMAC, limite de payload e dedupe;
- envio humano idempotente e atualização de delivery status;
- allowlist de IA com `menu.search`, `order.status`, `customer.summary` e `handoff.request`;
- nenhuma ferramenta de IA permite SQL arbitrário, alteração de preço ou acesso cross-tenant.

## Supabase

Migrations aplicadas:

- `conversations_core_152_163` — `44_conversations_core.sql`;
- `conversations_security_152_163` — `45_conversations_security.sql`;
- `conversations_customer_link_152_163` — `46_conversations_customer_link.sql`.

Validação:

- Security Advisor: 0 alertas;
- 6/6 tabelas do módulo com RLS;
- tabelas internas sem leitura de browser;
- RPCs internas `SECURITY INVOKER`;
- mutações internas não executáveis por `anon`/`authenticated`;
- Realtime somente nas tabelas operacionais necessárias.

## E2E PostgreSQL com rollback

Validado no backend oficial:

1. inbound cria contato/conversa/mensagem;
2. replay do mesmo ID não duplica mensagem nem unread;
3. contato liga ao customer existente pelo telefone;
4. `bot → waiting_agent → human`;
5. resposta humana repetida com a mesma idempotency key gera uma única mensagem;
6. delivery evolui `sent → delivered → read` sem regressão por callback atrasado;
7. sessão do bot versiona de forma determinística;
8. origem IA solicita handoff para fila humana.

Durante o teste: 1 contato, 1 conversa, 2 mensagens e 1 sessão. Após rollback: zero resíduos e zero usuário de teste.

## CI

Run #118 no head `9cff267347b508586549e9fe56bd8f474d5f6e14`:

- lint ✅
- TypeScript ✅
- testes ✅
- Print Agent ✅
- build ✅

## Limite atual

A comunicação real com a infraestrutura externa do WhatsApp ainda não foi homologada nesta sessão porque não há um número/provider conectado ao ambiente. O domínio, adapter, webhook e segurança estão implementados; a homologação externa precisa de credenciais reais e teste de rede inbound/outbound.

O PR #182 permanece draft e não deve ser mesclado sem autorização explícita.
