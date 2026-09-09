# Checkout V1+V3 — baseline funcional

Este documento congela o contrato funcional do checkout público antes do rollout visual V1+V3. O redesign muda apresentação e navegação visual; não substitui o motor de checkout.

## Fontes de verdade

- `CheckoutService.load(storeSlug, token, recognitionToken)` carrega carrinho, sessão, menu, cliente reconhecido, bairros, métodos de pagamento e estado do módulo Growth.
- `checkout_sessions` é a persistência temporária autoritativa entre etapas/reloads.
- actions de `src/features/checkout/actions.ts` persistem identidade, modalidade, endereço, pagamento e agendamento.
- `OrderService.createFromCheckout` chama `CheckoutService.review` antes da criação.
- criação é idempotente pelo carrinho/origem do pedido.

## Fluxos obrigatórios

### Delivery
Recebimento → Dados → Endereço → Pagamento → Revisão → criação → acompanhamento.

### Pickup
Recebimento → Dados → Pagamento → Revisão → criação → acompanhamento.

## Campos de `checkout_sessions` preservados

`customer_id`, `customer_name`, `customer_phone`, `customer_phone_normalized`, `customer_email`, `fulfillment_type`, `scheduled_for`, `address_postal_code`, `address_street`, `address_number`, `address_complement`, `address_district`, `address_city`, `address_state`, `address_reference`, `delivery_quote_status`, `delivery_fee_cents`, `delivery_estimated_min_minutes`, `delivery_estimated_max_minutes`, `payment_method`, `cash_change_for_cents`, `reviewed_at`, `updated_at`.

## Contratos de recebimento

- delivery só existe se `menu.settings.allow_delivery && menu.delivery.enabled`;
- pickup só existe se `menu.settings.allow_pickup`;
- seleção continua passando por `saveCheckoutFulfillmentAction`/`CheckoutService.saveFulfillment`;
- `checkout_set_fulfillment_internal` continua responsável por reconfigurar modalidade/cotação.

## Contratos de identidade e reconhecimento

- nome e WhatsApp são obrigatórios;
- telefone é normalizado server-side;
- e-mail é opcional salvo quando Pix online o exige;
- endereço salvo só é exposto quando recognition token e `session.customer_id` correspondem ao cliente reconhecido;
- digitar telefone por si só nunca autoriza exposição de endereço.

## Contratos de endereço

- etapa existe apenas em delivery;
- bairros cadastrados são buscados conforme digitação, sem dump inicial;
- seleção de bairro usa registros ativos da loja;
- fluxo manual de bairro/cidade/UF continua disponível quando aplicável;
- CEP permanece opcional e visualmente após referência;
- `DeliveryQuoteService` continua autoridade para serviço, mínimo, taxa e ETA;
- estados `valid` e `unserviceable` permanecem válidos.

## Pagamentos e opcionais preservados

- métodos: `pix`, `credit_card`, `debit_card`, `cash`, exibidos somente quando habilitados;
- troco somente para cash e validado contra o total;
- Pix online e exigência de e-mail permanecem;
- Growth só aparece com módulo habilitado;
- agendamento continua usando timezone da loja e validação server-side.

## Confirmação e pós-pedido

Cadeia obrigatória: `confirmCheckoutOrderAction` → acesso operacional → `createOrderFromCheckoutAction` → `OrderService.createFromCheckout` → `CheckoutService.review` → RPC de criação.

Preservar idempotência, contexto de notificação, WhatsApp, despacho de Pix, cookie de acesso ao pedido, cookie de reconhecimento, limpeza do carrinho e redirect para acompanhamento.

## Regras do redesign

- estado visual não vira fonte de verdade;
- F5/reentrada derivam a etapa do estado persistido;
- não mover preço/frete/pagamento para o browser;
- não remover testes funcionais para acomodar markup novo;
- layout usa viewport dinâmica e overflow interno apenas como fallback de segurança.
