# Public Flow V1+V3 — baseline funcional

Escopo: `/m/[slug]` → `/m/[slug]/produto/[id]` → `/m/[slug]/carrinho` → `/m/[slug]/checkout`.

## Autoridades preservadas

- catálogo: `PublicMenuService.getMenu` / `getProduct`;
- carrinho: `CartService.getCart`, `addItem`, `updateQuantity`, `removeItem`;
- edição: `CartItemEditService.replaceItem`;
- persistência: cookie HTTP-only via `cartCookieName`;
- submit/alterações: server actions em `src/features/cart/actions.ts`;
- preço, disponibilidade, modificadores e totais permanecem server-side.

## Redirects oficiais

- produto novo submetido com sucesso → `/m/[slug]/carrinho`;
- edição de item submetida com sucesso → `/m/[slug]/carrinho`;
- quantidade/remover → `/m/[slug]/carrinho`;
- produto em edição volta para carrinho; produto novo volta para cardápio;
- carrinho válido libera `/m/[slug]/checkout`;
- carrinho inválido bloqueia avanço;
- checkout sem carrinho continua responsável por retornar ao carrinho.

## Estados que não podem desaparecer

### Cardápio
- aberto, fechado e pausado;
- busca/categorias/imagens conforme configuração;
- entrega, retirada, ETA, mínimo e frete grátis;
- produto normal, promoção, esgotado.

### Produto
- modificadores legados e quantitativos;
- complementos opcionais;
- observação e quantidade;
- edição via `?editar=`;
- gás `exchange` / `with_container` quando aplicável;
- indisponibilidade e erros de preço/opções.

### Carrinho
- vazio e válido;
- `price_changed`, `unavailable`, `invalid_modifiers`;
- edição/reconstrução;
- quantidade e remoção;
- observação, modificadores e metadados de gás;
- subtotal, desconto, entrega e total oficiais;
- benefícios existentes;
- item inválido bloqueando checkout.

## Direção visual do lote

- cardápio continua exploratório;
- produto continua configurador;
- barra de carrinho é irmã do footer do checkout;
- carrinho passa a usar a mesma linguagem V1+V3 do checkout;
- transições são somente acabamento visual e respeitam `prefers-reduced-motion`;
- nenhuma rota real, redirect ou regra de negócio é substituída por estado client-side.
