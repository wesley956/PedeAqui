# WhatsApp Cloud API real — homologação [325]

## Estado

O domínio interno de Conversas já possui webhook, parser, HMAC, deduplicação, contatos/conversas/mensagens, outbound idempotente, status de entrega e handoff humano. A [325] adiciona diagnóstico seguro do canal real e define o gate que separa **prontidão de código** de **homologação externa comprovada**.

## Configuração server-side obrigatória

O PedeAqui armazena no domínio somente referências de segredo. O ambiente que executa o Next.js precisa disponibilizar:

- `WHATSAPP_ACCESS_TOKEN` — ou a variável apontada por `access_token_secret_ref`;
- `WHATSAPP_APP_SECRET` — ou a variável apontada por `app_secret_secret_ref`;
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — usado somente no challenge GET;
- `WHATSAPP_GRAPH_API_VERSION` — versão explícita da Graph API aprovada no ambiente.

A unidade também precisa ter `whatsapp_phone_number_id` e, quando aplicável, `whatsapp_business_account_id` configurados.

Nenhum valor de secret deve ser colocado em Git, formulário, URL, log ou tabela de domínio.

## Endpoint público

Callback HTTP(S):

`/api/webhooks/whatsapp`

GET valida `hub.mode`, `hub.verify_token` e devolve `hub.challenge` somente quando o token confere em comparação constante.

POST:

1. lê o raw body com limite de 1 MB;
2. faz parse mínimo;
3. resolve o App Secret server-side pelo `phone_number_id` configurado;
4. valida `X-Hub-Signature-256` sobre o raw body antes de ingerir qualquer evento;
5. deduplica/ingere mensagens pela infraestrutura existente;
6. aplica callbacks `sent → delivered → read`, sem regressão;
7. usa request ID e falha sanitizada sem registrar raw payload ou assinatura.

## Health check

Configurações → Conversas consulta a Graph API com o access token server-side e o Phone Number ID configurado. O browser recebe somente:

- `disabled`;
- `misconfigured`;
- `connected`;
- `provider_unavailable`;
- `invalid_credentials`;
- nome verificado, número de exibição, qualidade e versão da Graph API quando a Meta os retorna.

A chamada possui timeout. Access token, App Secret e assinatura nunca fazem parte da resposta do health.

## Rotação e recuperação

### Access token expirado/revogado

1. gerar/obter nova credencial pelo procedimento administrativo da conta Meta;
2. atualizar somente o secret no ambiente;
3. manter a mesma referência de variável no PedeAqui quando possível;
4. abrir Configurações → Conversas;
5. confirmar `Conectado à Meta`;
6. testar outbound real.

### App Secret alterado

1. atualizar o secret no ambiente;
2. reiniciar/reimplantar a aplicação conforme a plataforma de hospedagem;
3. enviar webhook real de homologação;
4. confirmar que assinatura antiga é rejeitada e nova é aceita.

### Verify token

O verify token é um segredo compartilhado apenas para o challenge de configuração do webhook. Alterá-lo exige atualizar o ambiente e repetir a verificação da callback na Meta.

## Gate externo obrigatório

Esta issue **não pode ser fechada apenas porque CI/mocks estão verdes**. É obrigatório registrar evidência de:

1. deployment público HTTPS executando as rotas Next.js do PedeAqui;
2. callback cadastrada na aplicação Meta;
3. challenge GET aceito;
4. mensagem “Oi” enviada de telefone físico e aparecendo uma única vez em `/conversas`;
5. operador assumindo a conversa e respondendo pelo PedeAqui;
6. resposta chegando ao telefone físico;
7. callback de status real chegando e progredindo sem regressão;
8. webhook duplicado não duplicando mensagem;
9. assinatura inválida sendo rejeitada;
10. health exibindo o Phone Number ID correto sem segredo.

## Bloqueio externo encontrado em 2026-08-14

Na preparação da [325], a equipe Vercel acessível pela conexão atual retornou **zero projetos**. Portanto não há, por essa conexão, um deployment Next.js do PedeAqui que possa receber callbacks da Meta. GitHub Pages é uma publicação estática e não substitui um endpoint de webhook server-side.

Esse bloqueio não é resolvido criando mocks ou marcando a issue como concluída. É necessário implantar o PedeAqui em infraestrutura que execute as rotas Next.js e configurar as credenciais/canal real.

## Critério para liberar [326]

A automação de saudação [326] depende do canal real estar homologado. O código pode ser desenhado sobre o contrato existente, mas a [326] não deve ser declarada comercialmente concluída sem um outbound real comprovado na [325].
