# Status — [036] a [040]

Branch: `agent/cart-036-040`  
PR: #47

## Escopo

- [036] Carrinhos
- [037] Itens do carrinho
- [038] Adicionais do carrinho
- [039] PricingService
- [040] Revalidação de preço/disponibilidade

## Segurança

O carrinho público é **server-only**:

- navegador recebe token aleatório opaco em cookie HttpOnly;
- banco armazena apenas SHA-256 do token;
- `carts`, `cart_items` e `cart_item_modifiers` têm RLS ativo;
- `anon` e `authenticated` não podem executar as RPCs internas;
- somente `service_role` executa mutações internas;
- nenhum preço ou total enviado pelo navegador é aceito como fonte de verdade.

Validação direta no Supabase oficial:

- RLS `carts` ✅
- RLS `cart_items` ✅
- RLS `cart_item_modifiers` ✅
- `anon_can_add = false` ✅
- `authenticated_can_add = false` ✅
- `service_role_can_add = true` ✅
- Security Advisor após migrations: 0 alertas ✅
- FKs das tabelas de carrinho possuem índices de cobertura ✅

## PricingService

`PricingService` é a fonte de cálculo do bloco:

1. resolve preço regular/promocional atual;
2. valida disponibilidade do produto;
3. valida se cada adicional pertence ao produto;
4. valida mínimo/máximo/obrigatoriedade dos grupos;
5. rejeita adicional duplicado;
6. soma adicionais por unidade;
7. multiplica pela quantidade;
8. trabalha somente com centavos inteiros e `Number.isSafeInteger`.

## Snapshots

Cada item preserva:

- nome/imagem do produto;
- preço base vigente;
- preço dos adicionais;
- nome de grupo/adicional;
- subtotal unitário e total da linha.

Ao reabrir o carrinho, o servidor compara esses snapshots com o catálogo atual.

## Repricing [040]

Mudanças possíveis:

- `price_changed`: preço atualizado automaticamente e usuário informado;
- `unavailable`: item permanece visível, mas sai do subtotal válido;
- `invalid_modifiers`: item permanece visível e precisa ser montado novamente.

A reaplicação de snapshots/status/totais ocorre na RPC `cart_apply_reprice_internal` dentro de uma transação PostgreSQL.

## UI

- `/m/[slug]/produto/[id]` permite quantidade, observação e adicionais;
- `/m/[slug]/carrinho` mostra itens, adicionais, quantidades, remoção e totais;
- o cardápio público possui acesso direto ao carrinho;
- carrinho avisa alterações de preço/disponibilidade.

## Limite intencional

Este bloco ainda não identifica cliente, endereço, modalidade ou pagamento. Esses itens pertencem ao checkout [041]–[046].

A loja pode permitir montagem de carrinho mesmo quando está fora do horário/pausada; o checkout será responsável por bloquear confirmação quando a operação não puder receber pedido.

## Testes e CI

Cobertura adicionada para:

- promoção + adicionais + quantidade;
- grupo obrigatório;
- adicional fora do produto;
- adicional duplicado;
- produto indisponível;
- soma de carrinho sem float;
- geração/hash do token opaco.

GitHub Actions run #20:

- instalação ✅
- lint ✅
- TypeScript ✅
- testes ✅
- build de produção ✅
