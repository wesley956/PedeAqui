# Saudação automática do WhatsApp — [326]

## Fluxo

1. Meta entrega uma mensagem ao webhook autenticado.
2. O inbound é persistido/deduplicado primeiro.
3. Somente depois da ingestão o PedeAqui avalia a saudação.
4. A conversa precisa continuar em `bot` e a unidade precisa ter WhatsApp, bot e saudação habilitados.
5. O sistema resolve nome/slug da loja e o estado do cardápio.
6. `APP_URL` fornece a origem; o caminho `/m/:slug` é criado pelo servidor.
7. A mensagem configurável aceita somente `{restaurante}` e `{link}`. URL manual é bloqueada.
8. A saída usa chave determinística `auto:greeting:<conversation_id>`.
9. A RPC `conversation_claim_bot_outbound_internal` garante que apenas uma execução possa despachar aquela saudação; envio já concluído não é repetido e mensagem `failed` pode ser reclamada em uma entrada posterior.
10. A resposta passa pelo mesmo `WhatsAppCloudProvider` e callbacks de entrega das conversas existentes.

## Handoff

A automação não responde quando a conversa já estiver em `waiting_agent`, `human` ou `closed`. Se o bot estiver desabilitado, o primeiro contato é encaminhado à fila humana. Se o cardápio estiver inativo/pausado ou o link público não puder ser gerado, o sistema usa a mensagem de fallback e move a conversa para `waiting_agent`.

Falha da saudação é observável, mas não desfaz o inbound já recebido. Isso evita que indisponibilidade da Meta ou uma configuração de automação bloqueiem o atendimento.

## Configuração

Em Configurações → Conversas:
- habilitar/desabilitar saudação;
- editar texto de boas-vindas;
- editar fallback;
- manter bot e canal WhatsApp habilitados.

A mensagem de boas-vindas deve conter `{link}`. `{restaurante}` é opcional. Nenhum campo aceita URL manual; o host público vem exclusivamente de `APP_URL` e HTTPS é obrigatório em produção.

## Idempotência

A combinação organização + `client_message_id` já é única no ledger de mensagens. A [326] adiciona uma claim transacional específica para automação, com lock na conversa/mensagem. Assim, webhook duplicado, duas mensagens próximas ou retry de infraestrutura não devem gerar duas saudações externas para a mesma conversa.

## Segurança

- RPC de claim: somente `service_role`;
- nenhum token/secret é colocado no template;
- link não recebe URL fornecida pelo cliente/operador;
- a unidade é resolvida a partir do Phone Number ID já isolado pelo webhook;
- estado humano sempre prevalece sobre automação;
- o logger recebe apenas IDs de tenant/unidade/request, sem telefone/body bruto.

## Homologação externa

O código e a migration podem ser homologados por CI, mas a issue [326] permanece dependente da [325]. Para fechar comercialmente é obrigatório um telefone físico provar:

`Oi → webhook real → uma saudação → link correto → cardápio da unidade`.

Também testar uma segunda mensagem sem saudação duplicada e uma conversa assumida por humano sem resposta automática.
