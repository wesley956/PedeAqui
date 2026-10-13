# NFC-e pela Focus NFe

O PedeAqui emite NFC-e (modelo 65) pela API v2 da [Focus NFe](https://doc.focusnfe.com.br). O adaptador fica em `src/server/fiscal/providers/focus-nfe.ts` e é registrado como `focus_nfe` em `fiscal-provider-registry.ts`.

## Quem precisa de quê

| Quem | O que precisa |
| --- | --- |
| PedeAqui (plataforma) | Uma conta na Focus NFe e o token da API. Um token por ambiente (homologação e produção). |
| Restaurante (emitente) | CNPJ, inscrição estadual, certificado digital A1 e CSC/ID do token da SEFAZ do estado, cadastrados na conta Focus para aquele CNPJ. |
| Cada produto vendido | NCM (8 dígitos), CFOP (4 dígitos) e CST/CSOSN no cadastro fiscal do produto. Sem isso, a nota é recusada pelo próprio PedeAqui antes de ir à SEFAZ, com o nome dos produtos pendentes. |

Restaurantes MEI, em geral, não são obrigados a emitir NFC-e para consumidor pessoa física. Confirme a regra do estado com o contador do cliente.

## Como ligar numa unidade

1. Crie a variável de ambiente com o token da Focus, por exemplo `FOCUS_NFE_TOKEN_HOMOLOG` (homologação) ou `FOCUS_NFE_TOKEN` (produção). O banco guarda só o nome da variável.
2. Em **Fiscal › Configurações fiscais avançadas**, crie a integração:
   - Chave do provider: `focus_nfe`
   - Ambiente: Homologação para testar; Produção para notas válidas
   - Referência do token: o nome da variável do passo 1
   - Referência do secret do webhook: o nome de outra variável com um valor aleatório longo (ex.: `FOCUS_NFE_WEBHOOK_SECRET`)
3. Preencha o perfil fiscal da unidade (CNPJ, IE, CRT, modelo 65, política de emissão).
4. Preencha NCM, CFOP e CST/CSOSN de cada produto.
5. Cadastre o gatilho na Focus para receber as mudanças de status (autorizada fora do tempo, cancelamento, contingência):

```bash
curl -u "$FOCUS_NFE_TOKEN:" -X POST https://api.focusnfe.com.br/v2/hooks \
  -H "content-type: application/json" \
  -d '{"cnpj":"CNPJ_DO_RESTAURANTE","event":"nfce","url":"https://pedeaqui.pp.ua/api/webhooks/fiscal/ID_DA_INTEGRACAO","authorization":"VALOR_DE_FOCUS_NFE_WEBHOOK_SECRET","authorization_header":"authorization"}'
```

   A Focus passa a enviar o valor do secret no cabeçalho `authorization`, que o PedeAqui confere antes de aceitar a notificação.
   Confira na [lista de eventos da Focus](https://doc.focusnfe.com.br/reference/criar_webhook) se o evento da NFC-e é `nfce` ou `nfe` na sua conta.

## Como funciona

- **Emissão:** o agendador chama `/api/internal/fiscal-jobs` a cada minuto (CRON_SECRET), que processa a fila `fiscal_jobs`.
- **Referência estável:** cada documento usa `pedeaqui-<id do documento>` na Focus. Antes de emitir, o adaptador consulta essa referência: se já estiver autorizada, processando ou cancelada, ele não emite de novo. Uma nota rejeitada pode ser corrigida e reenviada com a mesma referência.
- **Valores:** desconto e taxa de entrega do pedido são repartidos entre os itens (`valor_desconto` e `valor_outras_despesas`) sem perder centavos. As formas de pagamento vêm dos pagamentos do pedido (dinheiro 01, crédito 03, débito 04, Pix 17, outros 99).
- **Retorno:** a resposta da Focus é síncrona. Protocolo, chave e XML autorizados são gravados no documento fiscal; o DANFE da NFC-e é um link HTML da Focus.
- **Cancelamento:** `DELETE /v2/nfce/<ref>` com justificativa de 15 a 255 caracteres. A SEFAZ costuma aceitar o cancelamento só nos primeiros 30 minutos.
- **Erros:** 401/403 (token ou permissão) e 5xx (instabilidade) voltam para a fila com espera crescente. Rejeições da SEFAZ ficam no documento com o código e a mensagem.

## Custos de referência

Plano Retail da Focus: R$ 62,90 por mês por CNPJ emissor, com 500 NFC-e incluídas, sem taxa de adesão (página de preços consultada em 13/10/2026). O valor deve entrar no preço do módulo Fiscal.

## Pendente

- Homologar com um CNPJ real no ambiente de homologação da Focus antes de liberar em produção.
- O módulo Fiscal continua fora da venda pública (`commercial_sellable=false` no catálogo) até essa homologação.
