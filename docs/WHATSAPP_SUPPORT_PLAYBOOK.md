# Playbook de suporte — WhatsApp / Inbox PedeAqui

Este playbook deve ser usado junto do card **Saúde do WhatsApp** em `Configurações > Conversas e WhatsApp`.

## Princípios

- WhatsApp nunca é dependência do núcleo de pedidos, checkout, produção ou entrega.
- Não pedir token, App Secret, WABA ID ou Phone Number ID ao restaurante.
- Não editar token, WABA, Phone Number ID ou subscription diretamente no banco para “consertar”.
- Não desconectar/reconectar automaticamente por causa de um alerta.
- Não reprocessar mensagem `failed` manualmente sem verificar idempotência.
- Não interpretar ausência de tráfego recente como falha de webhook.
- Diagnóstico técnico não deve copiar corpo de mensagem, telefone, endereço ou outra PII.

## Estados do health

### `healthy`
Conexão conhecida como saudável e sem backlog/falha recente detectada.

Ação:
1. se o cliente relata problema, confirme horário e fluxo específico;
2. confira se a conversa correta está na unidade correta;
3. não altere conexão apenas porque não houve mensagem recente.

### `attention`
A conexão pode continuar funcional, mas existe sinal que merece investigação, por exemplo fila pendente, falha recente, subscription ainda não confirmada ou erro de sync.

Ação:
1. leia os itens exibidos no card;
2. identifique se o sinal é envio, mídia, ingestão ou sync;
3. corrija somente o domínio afetado.

### `action_required`
A conexão ou uma subscription oficial exige ação.

Ação:
1. usar o fluxo oficial de conexão/reconexão do painel;
2. nunca substituir credencial diretamente;
3. confirmar health depois da reconexão;
4. preservar histórico e pedidos.

### `provider_unavailable`
Falha transitória da Meta/rede.

Ação:
1. não reconectar imediatamente;
2. preservar credenciais e estado;
3. aguardar estabilização e repetir o health;
4. pedidos continuam normalmente.

### `disconnected`
Canal desligado/não conectado.

Ação:
- se intencional, nenhuma correção;
- se não intencional, usar conexão/reconexão oficial.

## Diagnóstico por sintoma

| Sintoma | Conferir | Interpretação | Ação |
|---|---|---|---|
| Cliente mandou mensagem e não apareceu | último inbound, último webhook `messages`, ingest failure | webhook/roteamento/ingestão | conferir conexão e erro de ingestão; não criar conversa manual paralela |
| Resposta do WhatsApp Business não apareceu | último echo webhook e último echo persistido | Coexistence/echo | conferir subscription e ingestão; não reativar bot à força |
| Atendente clicou enviar e falhou | janela Meta, outbound failed recente, estado da conexão | provider/janela/template | seguir WPP-11; não marcar como enviada |
| Mensagem fica pendente | outbound pending | fila local/provider | investigar retry/worker antes de reenviar |
| Imagem/áudio/documento não abre | media pending/failed, WPP-10 | ingestão/storage/mídia | não tornar bucket público; verificar failure kind |
| WhatsApp mostra ação necessária | connection status/last health | credencial/configuração | reconectar pelo fluxo oficial |
| Meta está instável | `provider_unavailable` | indisponibilidade externa | aguardar; não trocar token |
| History/state sync com erro | health sync | sincronização opcional | investigar somente se capability estiver em uso; não ativar flag para “testar” |
| Conversa está aguardando humano | waiting_agent count | operação | atendente autorizado deve assumir pela Inbox |

## WPP-10 — mídia

- Bucket `conversation-media` é privado.
- Download/preview usa signed URL curta e exige acesso à organização, unidade, conversa e mídia.
- `legacy_media_unavailable` representa mídia histórica sem `media.id` recuperável; não é backlog atual.
- Nunca tornar bucket público para resolver preview.
- Falha de mídia não deve derrubar a timeline inteira.

## WPP-11 — janela Meta e templates

- Mensagem livre e mídia livre dependem da janela de atendimento calculada pelo último inbound do cliente.
- Mensagem outbound/echo não reabre janela.
- Fora da janela, usar apenas template aprovado do WABA correto.
- `provider_retryable`: falha temporária; não reconectar automaticamente.
- `provider_non_retryable`: revisar conexão/template.
- Mensagem rejeitada nunca deve aparecer como enviada.

## WPP-12 — permissões

Matriz operacional:

| Ação | Permissão |
|---|---|
| Ver Inbox/timeline/mídia | `conversations.view` |
| Responder | `conversations.reply` |
| Assumir/devolver/encerrar | `conversations.manage` |
| Ver customer/endereço | `customers.view` |
| Ver pedido | `orders.view` |
| Configurar/conectar/desconectar WhatsApp | `integrations.manage` |

Poder atender não autoriza configurar a integração.

## Coexistence / webhook

Para lojas em Coexistence, conferir separadamente:
- subscription da WABA;
- subscription do webhook do app;
- último `messages`;
- último echo recebido;
- último echo persistido.

**Importante:** timestamps antigos de `messages`/echo, isoladamente, não significam falha se não houve tráfego.

## Filas e janela de falhas

O health usa janela operacional explícita de **24 horas** para falhas recentes:
- outbound failed;
- media failed;
- ingest failure recente.

Backlogs atuais:
- outbound `pending`;
- media `pending|processing`;
- conversas `waiting_agent`.

Os números são sempre derivados por organização + unidade; nunca comparar lojas usando uma consulta sem escopo.

## Escalonamento

Escalar para engenharia quando:
- connection está `connected`, subscriptions estão confirmadas e ainda assim webhook esperado não chega durante tráfego real confirmado;
- outbound continua pending sem evolução;
- ingest failure se repete;
- mídia nova fica processing/pending persistentemente;
- há divergência tenant/store;
- runtime apresenta erro 5xx relacionado ao fluxo.

Ao escalar, registrar somente:
- organização/unidade por identificador interno autorizado;
- horário aproximado;
- código seguro do problema;
- request/correlation id quando disponível.

Não colar texto de conversa, telefone, endereço, token ou payload Meta completo.
