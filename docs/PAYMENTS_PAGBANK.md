# Pix do pedido pelo PagBank

O PagBank é o segundo provedor de Pix online do pedido, ao lado do Mercado Pago. O restaurante conecta a conta PagBank dele pelo PagBank Connect e o dinheiro cai direto nessa conta. Só um provedor fica ativo por unidade: ativar o PagBank desativa o Mercado Pago, e o contrário também.

## O que o PedeAqui precisa fazer uma vez

1. Criar uma aplicação no PagBank (Connect) com a conta do PedeAqui, primeiro no sandbox: https://developer.pagbank.com.br/docs/connect
   - Redirect URI: `https://www.pedeaqui.pp.ua/api/integrations/pagbank/oauth/callback`
   - Escopos: `payments.read`, `payments.create`, `accounts.read`
2. Configurar as variáveis de ambiente na Vercel (nunca no repositório):

| Variável | Valor |
| --- | --- |
| `PAGBANK_ENVIRONMENT` | `sandbox` para testar; `production` depois da homologação |
| `PAGBANK_CLIENT_ID` | `client_id` da aplicação |
| `PAGBANK_CLIENT_SECRET` | `client_secret` da aplicação |
| `PAGBANK_PLATFORM_TOKEN` | token da conta PagBank do PedeAqui, usado nas rotas `/oauth2` |
| `PAGBANK_OAUTH_REDIRECT_URI` | a mesma Redirect URI do passo 1 |

3. Aplicar a migração `supabase/sql/227_pagbank_order_payments.sql` (cópia idêntica em `supabase/migrations/20261013080000_pagbank_order_payments.sql`). Ela só acrescenta: o Mercado Pago continua igual.

## O que o restaurante faz

1. **Configurações › Pagamentos › PagBank › Conectar PagBank**. Ele entra na conta PagBank e autoriza.
2. A conexão volta com o Pix **desligado**. Ele marca **Receber Pix pelo PagBank** e salva.

## Como funciona

- **CPF do cliente:** o PagBank exige o CPF do pagador para criar o Pix. Na página do pedido, o cliente vê "Falta só o CPF", digita e o QR Code aparece. O CPF é validado pelos dígitos, vai só para o PagBank e não é gravado no PedeAqui. Um CPF corrigido usa outra chave de idempotência, para o PagBank não devolver a recusa anterior.
- **Cobrança:** `POST /orders` na conta do restaurante, com `reference_id` estável (`pa_payment_<pagamento>_<tentativa>`), um item com o valor do pedido, `qr_codes` com validade de 30 minutos e `notification_urls` da unidade. A imagem do QR (`QRCODE.BASE64`) é buscada uma vez; se falhar, o cliente ainda tem o Pix Copia e Cola.
- **Confirmação:** o PagBank chama `/api/webhooks/payments/pagbank/<unidade>?token=<segredo>`. O segredo é aleatório, fica no Vault e é comparado em tempo constante. Mesmo autenticada, a notificação só serve de gatilho: o PedeAqui consulta `GET /orders/<id>` e confere referência, valor e moeda antes de dar baixa no pagamento. Cada notificação é registrada uma vez (hash do corpo), sem guardar o corpo.
- **Notificação perdida:** o job `/api/internal/payment-reconciliation` (a cada 2 minutos) também consulta cobranças PagBank pendentes há mais de 2 minutos.
- **Tokens:** ficam no Vault. A renovação usa `/oauth2/refresh`; como cada renovação invalida o refresh token anterior, a gravação confere `updated_at` para duas requisições não se atropelarem.

## Homologação antes de liberar

1. Com `PAGBANK_ENVIRONMENT=sandbox`, conectar uma conta de testes do sandbox numa unidade de homologação.
2. Fazer um pedido com Pix, informar um CPF de teste e pagar o QR pelo simulador do sandbox.
3. Conferir que o pedido muda para pago sozinho (webhook) e, desligando o webhook, que o job de reconciliação também resolve.
4. Testar CPF inválido, QR vencido (30 minutos) e desconectar/reconectar.
5. Só então trocar para `production` e repetir com um Pix real de baixo valor.

## Limites conhecidos

- O PagBank pode exigir campos adicionais do cliente (telefone, por exemplo) dependendo da conta. Se isso aparecer na homologação, a recusa vem com o nome do campo em `PagBankProviderHttpError.parameter`.
- A assinatura `x-authenticity-token` do PagBank não é usada, porque depende do token da conta e o comportamento no Connect não está documentado de forma clara. A proteção é o segredo na URL mais a reconsulta autenticada.
- Pelo WhatsApp, o cliente continua sendo levado à página do pedido para pagar; é lá que o CPF é pedido.
