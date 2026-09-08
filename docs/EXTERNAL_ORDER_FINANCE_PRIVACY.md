# Pedidos externos — financeiro, privacidade e retenção

## Escopo

Esta política vale para pedidos importados de marketplaces como iFood e 99Food.
O pedido canônico do PedeAqui é a base operacional, mas o marketplace continua sendo a autoridade para dinheiro e logística quando `payment_owner` ou `logistics_owner` indicarem isso.

## Valores financeiros

As seguintes grandezas são independentes e nunca devem ser misturadas automaticamente:

- total cobrado do cliente;
- frete cobrado do cliente;
- descontos/benefícios;
- taxas adicionais do pedido;
- custo logístico;
- comissão do marketplace;
- repasse esperado ao estabelecimento;
- valor efetivamente conciliado/recebido.

A visão **Vendas por canal** usa apenas o snapshot canônico recebido do provider. Ela é informativa e não cria uma segunda obrigação, transação, recebimento ou movimento de caixa.

Comissão, custo logístico e repasse só podem aparecer como números quando o provider os fornece explicitamente. O PedeAqui não estima esses valores a partir do preço do seu próprio cardápio.

## Cobrança e Pix

- pedido nativo PedeAqui pode seguir o fluxo atual de Pix/PSP;
- pedido de marketplace nunca inicia Pix online do PedeAqui automaticamente;
- `payment_owner=provider` bloqueia criação, confirmação, falha e refund manuais no ledger PedeAqui;
- `payment_owner=merchant` permite recebimento local quando a operação realmente pertence ao restaurante;
- uma cobrança do Mercado Pago não representa nem substitui o ledger financeiro do iFood/99Food.

## Cancelamentos e refunds

Evento operacional de cancelamento não prova, sozinho, que houve movimentação financeira.

Por isso:

- cancelamento do provider não dispara automaticamente `payment_refund_internal`;
- refund parcial/total só deve alterar o ledger quando uma integração financeira autoritativa trouxer evidência do valor e da referência externa;
- o snapshot original, eventos duráveis e histórico financeiro permanecem preservados para auditoria;
- se o dinheiro nunca passou pelo PedeAqui, não deve existir estorno interno correspondente.

## Privacidade / LGPD

Dados pessoais de marketplace são usados prioritariamente para cumprir o pedido e prestar suporte operacional.

Regras:

- payload bruto do provider não é base permanente para analytics;
- analytics/financeiro usam projeções sanitizadas e agregadas;
- telefone, endereço, documento e identificadores internos do provider não entram na visão financeira por canal;
- logs e diagnóstico devem preferir IDs técnicos internos/correlation IDs e evitar PII;
- dados financeiros necessários para auditoria/fiscal podem ter retenção diferente dos dados operacionais de contato;
- deleção/anonimização de PII não deve apagar evidência financeira que precise ser legalmente preservada.

## CRM e WhatsApp

Importar um pedido externo não significa consentimento para marketing.

- o worker de importação não agenda campanha/WhatsApp marketing;
- comunicação transacional só deve acontecer quando permitida pelo contrato/política do canal;
- uso posterior do telefone em CRM/campanha permanece bloqueado por padrão até existir base legal e regra explícita.

## Fase seguinte — conciliação financeira do provider

Quando as APIs/contratos oficiais de settlement estiverem disponíveis, a conciliação deve ser adicionada por `external_order_id`/settlement/reference, preservando o pedido original. Essa fase poderá preencher comissão, custo logístico e repasse real, mas não deve recalcular preços pelo catálogo PedeAqui nem duplicar receita já registrada.
