# Central Profissional de Impressão — status [058]–[082]

Branch: `agent/printing-058-082`

## Escopo implementado

- [058] `printers`
- [059] `production_stations`
- [060] `station_printers`
- [061] `product_production_stations`
- [062] `PrintService`
- [063] `PrintRoutingService`
- [064] `print_jobs`
- [065] `PrintQueueService`
- [066] retry automático com backoff
- [067] template de cozinha
- [068] template de expedição
- [069] template de balcão
- [070] reimpressão como novo job
- [071] auditoria transacional da reimpressão
- [072] cópias por impressora/rota
- [073] monitor `/configuracoes/impressoes`
- [074] saúde/heartbeat de impressoras
- [075] fallback após esgotar tentativas
- [076] idempotência lógica por evento/estação/impressora/documento
- [077] contrato autenticado do Print Agent
- [078] MVP Node.js do Print Agent
- [079] heartbeat do agente
- [080] detecção/alerta de impressora offline
- [081] encoder ESC/POS 58/80 mm + CP850 básico
- [082] geração automática de jobs na confirmação do pedido

Issues GitHub: #67–#91.

## Arquitetura aplicada

`order.confirmed` → trigger transacional → roteamento → `print_jobs` → claim com lease → Print Agent → impressora → ACK/fail.

A fila persistida no Postgres é a fonte de verdade. Realtime pode futuramente acelerar sinalização, mas o agente não depende de uma mensagem volátil para descobrir trabalho.

### Confirmação durável

O trigger `orders_enqueue_print_on_confirm` executa na mesma transação que muda `order_status` para `confirmed`. Se a criação dos jobs falhar, a confirmação também falha; não existe janela de sucesso do pedido com perda silenciosa da intenção de impressão.

### Roteamento

- estação `production`: recebe somente produtos ligados em `product_production_stations`;
- estação `expedition`: recebe o pedido completo;
- estação `counter`: recebe o pedido completo;
- uma estação pode apontar para múltiplas impressoras;
- cópias podem sobrescrever o padrão da impressora;
- fallback é aplicado somente após esgotar as tentativas da impressora primária.

### Fila e concorrência

- estados: `pending`, `processing`, `printed`, `failed`, `cancelled`;
- `FOR UPDATE SKIP LOCKED` no claim;
- lease de 90 s;
- lease expirado volta à fila;
- backoff exponencial limitado;
- `idempotency_key` única;
- jobs falhos não são apagados;
- retry manual é auditado;
- job em `processing` não pode ser cancelado pelo painel porque o hardware pode já estar imprimindo;
- um agente só pode claimar jobs de impressoras explicitamente vinculadas ao seu `agent_id`.

### Eventos operacionais

Eventos persistidos somente nas transições relevantes, sem spam de heartbeat:

- `print.printer_offline`;
- `print.printer_recovered`;
- `print.fallback_activated`;
- `print.job_failed`.

## Reimpressão

Reimpressão nunca altera o job original. `reprint_job_internal` cria um novo job com:

- `original_job_id`;
- `is_reprint = true`;
- motivo obrigatório;
- usuário solicitante;
- nova chave idempotente;
- evento `print.reprint_requested`;
- `audit_logs` na mesma transação.

O template exibe `*** REIMPRESSAO ***` no topo.

## Print Agent

Diretório: `print-agent/`.

O agente recebe uma credencial própria criada no painel. O valor bruto aparece uma única vez; o banco persiste somente SHA-256. `SUPABASE_SERVICE_ROLE_KEY` nunca é entregue ao computador da loja.

Endpoints server-side:

- `POST /api/print-agent/config`
- `POST /api/print-agent/claim`
- `POST /api/print-agent/ack`
- `POST /api/print-agent/fail`
- `POST /api/print-agent/heartbeat`

MVP físico:

- Node.js 22+;
- spool local;
- ESC/POS por TCP/rede;
- 58 e 80 mm;
- consulta das impressoras atribuídas;
- probe TCP periódico mesmo com fila vazia;
- heartbeat de saúde;
- recuperação de `printed_unacked` sem reimpressão.

USB, Bluetooth e spool do sistema permanecem atrás do mesmo contrato para drivers posteriores.

## Limite físico de exactly-once

A geração lógica de jobs é idempotente. A impressão física, porém, não pode garantir exatamente uma via sem suporte transacional do equipamento: uma queda no intervalo exato entre a impressora aceitar os bytes e o agente persistir a confirmação local pode resultar em nova tentativa. Portanto o transporte físico é tratado como **at-least-once**, com spool para reduzir a janela de duplicidade.

## Segurança Supabase

Após as migrations `printing_058_082`, `printing_hardening`, `printing_operational_events` e `print_agent_strict_assignment`:

- RLS ativo nas seis tabelas do subsistema;
- `anon` sem leitura direta;
- `authenticated` não lê `print_agents` e seus hashes;
- `authenticated` só lê configuração/fila através de `printing.view` + RLS;
- mutações administrativas são server-side após RBAC;
- RPCs do agente/reimpressão são executáveis somente por `service_role`;
- `printing.view`, `printing.manage` e `printing.reprint` adicionadas ao catálogo;
- Owner/Manager existentes receberam backfill;
- Security Advisor: zero alertas.

## Validação

O banco oficial ainda não possui organização, usuário, produto ou pedido. Por isso não foi criado usuário artificial de Auth para simular uma venda. A integração foi validada por schema, grants, trigger/RPCs, advisors e testes automatizados. O primeiro teste ponta a ponta com pedido real deverá validar também impressora física.

O CI também valida explicitamente a sintaxe dos arquivos `.mjs` do Print Agent, além de lint, TypeScript, testes e build do app.

## Próximo bloco após aprovação

[083]–[092] — Gestor de Pedidos.
