# Status — [041] a [046]

Branch: `agent/checkout-041-046`  
PR: #54  
Base: `agent/cart-036-040`

## Escopo implementado

- [041] Identificação: nome, telefone obrigatório e e-mail opcional.
- [042] Entrega ou retirada, respeitando configuração pública da unidade.
- [043] Endereço de entrega como snapshot do checkout + cotação por bairro.
- [044] Forma de pagamento configurável por loja.
- [045] Dinheiro e troco em centavos.
- [046] Revisão final server-side.

## Modelo de dados

`checkout_sessions` é 1:1 com `carts` e mantém somente estado temporário necessário para concluir o pedido:

- identidade do cliente;
- eventual `customer_id` já existente;
- modalidade `delivery` / `pickup`;
- snapshot do endereço;
- status/custo/ETA da cotação de entrega;
- forma de pagamento;
- valor para troco;
- `reviewed_at`.

O checkout não foi misturado à tabela `carts`, mantendo carrinho, checkout e futuro pedido com responsabilidades separadas.

`store_payment_methods` define por unidade quais métodos aparecem no checkout:

- Pix;
- cartão de crédito;
- cartão de débito;
- dinheiro.

## Privacidade do cliente

O telefone é normalizado no servidor e pode ser usado para reconhecer internamente um cliente existente da organização.

O checkout público **não revela endereços ou outros dados salvos desse cliente apenas porque alguém digitou seu telefone**.

Para evitar clientes criados por abandono de checkout, um cliente novo será criado somente de forma atômica junto com o pedido no bloco [047]–[057].

## Entrega

Ao selecionar entrega:

1. o endereço é validado;
2. bairro/cidade/UF são normalizados para consulta;
3. a regra da unidade é carregada;
4. bairro não atendido é bloqueado quando exigido;
5. pedido mínimo específico do bairro é validado;
6. frete grátis é reaplicado conforme subtotal atual;
7. ETA inclui minutos adicionais do bairro;
8. frete e total do carrinho são atualizados na mesma transação PostgreSQL.

Ao mudar para retirada, endereço, cotação e taxa são limpos e o total volta a excluir frete.

## Pagamento

A unidade pode habilitar/desabilitar os quatro métodos iniciais em:

`/configuracoes/pagamentos`

Neste bloco não há captura financeira online. A seleção representa a intenção de pagamento que será snapshotada no pedido.

Para dinheiro, `cash_change_for_cents` é opcional e, quando informado, precisa ser igual ou superior ao total atual.

## Revisão final

`reviewCheckout()` bloqueia o checkout se ocorrer qualquer um dos casos abaixo:

- carrinho vazio ou item inválido;
- pedido abaixo do mínimo da loja;
- loja fechada ou pausada;
- identificação incompleta;
- modalidade ausente;
- entrega sem cotação válida;
- forma de pagamento ausente ou desabilitada após seleção;
- troco menor que o total.

Antes de aprovar a revisão, o servidor reabre/revalida o carrinho e recalcula a entrega com as regras atuais. Assim, dados antigos da tela não são a fonte de verdade.

Quando tudo está consistente, `reviewed_at` é marcado e o checkout fica pronto para ser consumido pelo `OrderService`.

## Segurança no Supabase

Validação direta no backend oficial `zsbsczjhiujnhdznrzck`:

- RLS em `checkout_sessions`: ✅
- `anon` com SELECT em `checkout_sessions`: ❌
- `authenticated` com SELECT em `checkout_sessions`: ❌
- `service_role` com SELECT: ✅
- `anon` executa `checkout_set_fulfillment_internal`: ❌
- `authenticated` executa RPC interna: ❌
- `service_role` executa RPC interna: ✅
- Security Advisor após migration: **0 alertas** ✅

O Performance Advisor não apontou FK nova do checkout sem índice; os índices recém-criados aparecem apenas como ainda não utilizados enquanto o banco está praticamente vazio.

## UI

- `/m/[slug]/carrinho` → botão **Ir para o checkout** quando todos os itens são válidos.
- `/m/[slug]/checkout` → fluxo progressivo em uma única página.
- `/configuracoes/pagamentos` → métodos aceitos pela unidade.

A navegação não exige seis páginas separadas, mas cada etapa é persistida server-side para sobreviver a refresh/volta ao cardápio.

## Testes

Cobertura adicionada para:

- checkout completo válido;
- item inválido;
- entrega sem cotação válida;
- forma de pagamento desabilitada após seleção;
- loja fechada/pausada;
- troco abaixo do total;
- proibição de troco em método que não seja dinheiro.

## CI

O primeiro run encontrou somente problemas de tipagem relacionados ao narrowing do carrinho e ao tipo da revisão. A correção preservou TypeScript estrito, sem `any` e sem relaxar o `tsconfig`.

Run #25 no head corrigido:

- instalação ✅
- lint ✅
- TypeScript ✅
- testes ✅
- build de produção ✅

## Limite intencional

Este bloco **não cria `orders`**. A revisão produz o estado consistente que será transformado em pedido no próximo bloco.

## Próximo bloco

[047]–[057] — Motor de Pedidos: `orders`, snapshots, número amigável, state machines separadas, histórico, `OrderService`, criação a partir do checkout, cancelamento, eventos e realtime.
