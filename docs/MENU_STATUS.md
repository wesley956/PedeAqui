# Status — [025] a [032]

Branch: `agent/menu-025-032`

## Escopo

- [025] Configuração do cardápio
- [026] Horários de funcionamento
- [027] Pausar recebimento de pedidos
- [028] Cardápio público
- [029] Página pública de produto
- [030] Busca
- [031] Navegação por categorias
- [032] Clientes

## Banco real

Aplicado ao Supabase oficial `zsbsczjhiujnhdznrzck`:

- `store_menu_settings`
- `store_hours`
- `customers`
- slug público globalmente único
- RPC `get_public_menu`
- RPC `get_public_product`
- suporte a produtos sem categoria via seção virtual `Outros`

O cliente anônimo não recebe `SELECT` em `products`, `categories`, `customers` ou tabelas administrativas. As RPCs públicas retornam somente projeções seguras.

Após essas migrations, o Supabase Security Advisor continua com **zero alertas**.

## Horários

- múltiplos períodos por dia;
- suporte a fechamento após meia-noite;
- validação de sobreposição inclusive entre sexta 18:00→02:00 e sábado 01:00→03:00;
- cálculo no timezone da unidade.

## UI

- `/configuracoes/cardapio`
- `/configuracoes/horarios`
- `/m/[slug]`
- `/m/[slug]/produto/[id]`
- `/clientes`

A identidade padrão é PedeAqui, com laranja + grafite.

## Limite intencional

O cardápio e produto já mostram opções/adicionais, mas carrinho e seleção interativa pertencem ao bloco [036]–[040]. Nesta fase, produto esgotado é claramente sinalizado e não é removido do catálogo.

## Validação

- SQL aplicado no Supabase oficial;
- Security Advisor: 0 alertas;
- testes unitários adicionados para horários/overnight e normalização de telefone;
- CI do PR deve validar lint, typecheck, testes e build antes do merge.
