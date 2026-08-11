# Arquitetura Profissional de Impressão — PedeAqui

A impressão é um subsistema estrutural. O pedido nunca fala diretamente com uma impressora.

## Fluxo canônico

```text
order.confirmed
      ↓
trigger transacional
      ↓
PrintRoutingService / regras de estação
      ↓
print_jobs (fila durável)
      ↓
claim com lease
      ↓
Print Agent local
      ↓
ESC/POS / driver físico
      ↓
ACK ou fail/retry/fallback
```

## Princípios

1. `print_jobs` é a fonte de verdade da intenção de impressão.
2. Realtime é sinalização opcional, nunca substituto da fila persistente.
3. Falha de rede/agente/impressora não apaga o job.
4. O pedido não conhece TCP, USB, Bluetooth ou ESC/POS.
5. Reimpressão cria nova via auditada; nunca altera o job original.
6. `service_role` fica somente no backend PedeAqui; Print Agent usa credencial própria.
7. Integridade organização/unidade é garantida também por FKs compostas.

## Entidades

- `production_stations`: cozinha/chapa/fritura/bar/expedição/balcão.
- `printers`: conexão, papel 58/80 mm, cópias, agente, saúde e fallback.
- `station_printers`: estação → uma ou mais impressoras, prioridade e cópias.
- `product_production_stations`: produto → estação de produção.
- `print_agents`: computadores locais autorizados; só o hash do token é persistido.
- `print_jobs`: pedido/estação/impressora/documento/payload/template/status/tentativas/lease/cópias/erro/idempotência/reimpressão.

## Estados e concorrência

Estados: `pending`, `processing`, `printed`, `failed`, `cancelled`.

`processing` possui lease. Claim usa `FOR UPDATE SKIP LOCKED`: dois agentes concorrentes não recebem o mesmo job simultaneamente. ACK/fail só é aceito do agente que possui o job.

## Retry e fallback

Falhas recebem backoff exponencial limitado. Ao atingir `max_attempts`, usa `fallback_printer_id` quando configurado. Sem fallback, permanece `failed`; nunca é descartado.

## Idempotência

Confirmação automática usa chave única por `order + confirmed + estação + impressora + documento`. Reexecutar roteamento não duplica a intenção lógica.

## Templates

- `kitchen`: número/horário/canal/estação/itens/adicionais/observações; sem dados financeiros desnecessários.
- `expedition`: pedido completo, cliente/endereço, itens, pagamento, total e troco.
- `counter`: pedido completo adequado ao balcão/retirada.

Conteúdo é renderizado server-side e codificado ESC/POS pelo agente.

## Reimpressão

Sempre cria um novo `print_job` com `original_job_id`, motivo obrigatório, usuário solicitante, evento, auditoria e marca `*** REIMPRESSAO ***`.

## Print Agent

MVP em `print-agent/`:

- Node.js 22+;
- polling/claim seguro;
- spool local;
- ACK/fail;
- heartbeat;
- TCP ESC/POS;
- CP850 básico pt-BR;
- 58/80 mm.

USB, Bluetooth e spool do sistema são adapters futuros sem mudança do domínio.

## Limite físico de exactly-once

A criação do job é idempotente. A impressão física é **at-least-once** porque impressoras térmicas comuns não participam de transações do banco. Se o processo cair após a impressora aceitar bytes e antes do registro local de sucesso, uma tentativa posterior pode gerar via duplicada. O spool reduz a janela e evita reimprimir `printed_unacked`, mas não inventa garantia que o hardware não oferece.

## Segurança

- RLS em todas as tabelas do subsistema.
- `anon` sem acesso.
- `authenticated` somente leitura autorizada por `printing.view`.
- `print_agents.token_hash` server-only.
- mutações administrativas passam por `authorize()`.
- RPCs internas de agente/reimpressão são `service_role` only.
- `service_role` nunca vai para o computador da loja.

## Operação

Painel: `/configuracoes/impressoes`.

O monitor exibe status, tentativas, pedido, estação, impressora, cópias e erro, com retry/cancelamento/reimpressão conforme regras de segurança.
