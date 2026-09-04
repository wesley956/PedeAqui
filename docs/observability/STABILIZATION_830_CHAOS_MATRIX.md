# Estabilização #830 — matriz de falhas e recuperação controlada

Esta matriz é executada somente em CI/staging com fixtures isoladas. Produção e contas reais não são usadas para injetar falhas.

| Cenário | Injeção controlada | Contrato esperado | Evidência automatizada |
| --- | --- | --- | --- |
| internet cai antes da confirmação | simular erro/timeout antes da RPC | nenhum pedido inventado; operador recebe orientação de retry | classificação `timeout/dependency` + checkout review |
| resposta se perde depois da criação | repetir conversão do mesmo carrinho | retorna pedido já criado (`created=false`), sem duplicar | lock do carrinho + `source_cart_id` único + replay |
| Supabase/API transitório | erro 503/504 | mensagem prática e retry somente quando seguro | `classifyFailure` |
| Realtime desconecta | status `CHANNEL_ERROR/TIMED_OUT/CLOSED` | modo degradado + reconciliação 15 s; volta a `recovered` | hook operacional + telemetria |
| agente/impressora offline | heartbeat ausente/job falho | pedido permanece; impressão entra em recuperação independente | saúde operacional + fila idempotente |
| duas pessoas atualizam o mesmo pedido | transições concorrentes | state machine/RPC rejeita salto inválido | testes de concorrência/state machine |
| sessão expira durante formulário | erro 401/session | instrução para entrar novamente, sem presumir sucesso | classificação de falhas |
| refresh durante processamento | reenvio da mesma chave/carrinho | replay seguro, sem efeito duplicado | idempotency keys + checkout source unique |
| WhatsApp indisponível | falha após criação do pedido | pedido criado não é revertido pela integração opcional | ordem da Server Action + dispatch assíncrono |
| pagamento online indisponível | provider falha | pedido/manual methods seguem regra da loja; não marcar pago | health de pagamento + payment state machine |
| deploy/restart | processo perde estado em memória | estado autoritativo permanece no Postgres e UI reconcilia | serviços consultam DB + Realtime fallback |

## Procedimento repetível em staging

1. Criar organização/unidade fixture exclusiva do teste.
2. Popular catálogo, métodos de pagamento e bairros mínimos; nunca copiar dados de cliente real.
3. Executar a jornada base e guardar apenas IDs sintéticos.
4. Injetar uma falha por vez no boundary correspondente (mock de rede/provedor, desconexão do canal, agente de teste offline ou concorrência de RPC).
5. Repetir a mesma ação/chave quando o cenário for retry.
6. Conferir pedido, histórico, fila de impressão e eventos de domínio antes/depois.
7. Validar que nenhum segredo/PII aparece no relatório.
8. Limpar a fixture inteira ao final.

## Estado incerto

Timeout não significa falha definitiva. Quando uma mutação pode ter chegado ao servidor, a interface deve orientar o operador a atualizar/reconciliar antes de tentar uma ação diferente. Para criação de pedido, o mesmo carrinho é a chave de reconciliação: a conversão procura `source_cart_id` existente antes de criar outro pedido.

## Serviços opcionais

WhatsApp, PIX online, reconhecimento de cliente, telemetria e impressão não podem ser pré-condições ocultas para persistir um pedido que já passou pela revisão autoritativa. Falhas posteriores são registradas/recuperadas separadamente. Pagamento nunca é assumido como confirmado por timeout.

## Critério para homologação externa

O CI prova os contratos determinísticos e a matriz pode ser executada repetidamente em staging. A homologação com falha de infraestrutura real (queda deliberada de hosting/rede ou restart do ambiente) só deve ocorrer em ambiente não produtivo e fica registrada como evidência separada; não deve ser simulada em Dona Maria, Dom Burger ou outras contas ativas.

## Staging isolado gratuito

O workflow `Isolated Chaos` cria uma pilha Supabase local e descartável no runner do GitHub Actions, sem `supabase link`, token de acesso ou conexão com o projeto hospedado. Ele aplica a especificação canônica de `supabase/sql`, reinicia a infraestrutura preservando o banco e executa três vezes os cenários transacionais de checkout, caixa, impressão/fallback e isolamento RLS.

Comando equivalente em uma máquina com Docker, Supabase CLI e `psql`:

```bash
bash scripts/run-isolated-chaos.sh
```

O log `isolated-chaos.log` é guardado por 30 dias como evidência. Todos os fixtures usam domínios `.invalid`, UUIDs reservados para teste e transações revertidas.
