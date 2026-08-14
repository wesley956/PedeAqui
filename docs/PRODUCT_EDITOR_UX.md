# Editor de produto — fluxo progressivo

Issue lógica: **[290]**.

O editor privilegia o cadastro comum e mantém todos os campos já aceitos por `createProductAction`.

## Ordem visual

1. Informações básicas — nome, descrição e categoria.
2. Preço — venda e promoção.
3. Imagem — referência visual do produto.
4. Disponibilidade — situação inicial e ativação no catálogo.
5. Adicionais e opções — orientação para a área compartilhada de grupos.
6. Dados avançados — custo, tempo de preparo, SKU e código de barras.

Os dados avançados ficam em `details` fechado por padrão. Nenhum campo foi removido, renomeado ou transferido para lógica client-side.

## Validação e autoridade

Os controles reutilizam o Form System do PedeAqui, incluindo associação de label, required e constraints HTML. A submissão continua integralmente pela server action `createProductAction`, seguida das validações de schema e `ProductService`.

## Mobile

Grades de duas/três colunas colapsam progressivamente para uma coluna. A ação de salvar permanece visível em uma barra sticky, reduzindo rolagem de retorno em formulários longos.

## Fora de escopo

- criar edição de produto onde ela não existe;
- alterar schema, preço, RLS ou auditoria;
- inventar campos de estoque/fiscal não presentes no contrato atual;
- vincular modificadores durante a criação inicial.
