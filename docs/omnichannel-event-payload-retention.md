# Retenção de payloads de eventos omnichannel

## Objetivo

O inbox `integration_events` é um registro durável usado para idempotência, suporte, auditoria e reconciliação. A linha do evento não deve ser apagada apenas porque o corpo recebido do provider deixou de ser necessário operacionalmente.

A política separa duas responsabilidades:

- **identidade/histórico do evento:** preservados para dedupe, investigação e métricas;
- **payload do provider:** retido somente pelo tempo necessário à operação, suporte e obrigações do contrato aplicável.

## Regra operacional

`integration_redact_event_payloads(cutoff, limit)` substitui o corpo `payload` por `{}` e registra `payload_redacted_at`, mas somente quando:

- o evento está em `processed` ou `ignored`;
- existe `processed_at` anterior ao cutoff informado;
- o payload ainda não foi redigido.

A rotina **nunca** redige eventos `pending`, `processing`, `retry` ou `dead_letter`. Esses estados ainda podem precisar do conteúdo para processamento, diagnóstico ou reprocessamento seguro.

A rotina também não apaga:

- `external_event_id`;
- provider/capability;
- tenant/store/account;
- tipo e status do evento;
- timestamps operacionais;
- tentativas/erros;
- vínculos e histórico de auditoria.

Assim, a deduplicação continua funcionando mesmo depois da minimização do payload.

## Cutoff

O banco não embute um número fixo de dias. O cutoff deve ser definido pela operação conforme:

1. contrato e documentação vigente do provider;
2. necessidade legítima de suporte/reconciliação;
3. obrigações fiscais/legais aplicáveis;
4. política de privacidade do PedeAqui.

Alterar a janela de retenção não exige migration: a execução fornece explicitamente o instante limite.

## Segurança

A função de retenção é `service_role` only. `anon` e `authenticated` não possuem `EXECUTE` e as tabelas de integração permanecem privadas por RLS/grants.

A execução deve ser feita em lotes limitados. Isso evita locks longos e permite pausar/revisar a política sem uma deleção destrutiva em massa.

## Analytics e suporte

Payload bruto de provider não é fonte permanente de analytics. Relatórios devem usar o modelo canônico/minimizado (`orders`, `external_orders` e projeções próprias).

Quando um evento estiver em `dead_letter`, o payload permanece disponível até a resolução/reprocessamento. Depois de processado e fora da janela operacional definida, pode ser redigido pela mesma rotina.

## Rollback

A migration adiciona somente `payload_redacted_at` e uma função de manutenção. Desativar o job de retenção interrompe novas redações sem afetar o processamento do inbox. Payloads já redigidos não são reconstruídos artificialmente; o pedido canônico e o histórico operacional permanecem preservados.
