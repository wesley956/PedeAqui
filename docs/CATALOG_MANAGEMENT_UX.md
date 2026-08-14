# Gestão do cardápio — hierarquia operacional

Issue lógica: **[289]**.

## Objetivo

A gestão do cardápio precisa privilegiar tarefas frequentes durante o expediente sem transformar cadastro avançado em ruído visual.

## Estrutura

- **Produtos**: busca, filtros, preço e disponibilidade operacional.
- **Categorias**: organização e ordem de navegação.
- **Adicionais**: grupos e opções vinculadas aos itens.

O cabeçalho da área apresenta essas três superfícies como caminhos explícitos. Configurações menos frequentes continuam em Configurações, conforme a separação estabelecida em [276].

## Produtos

A listagem permite filtrar por texto, disponibilidade e categoria. A busca cobre nome, descrição e SKU. Os filtros são apenas de apresentação; a leitura continua vindo de `ProductService` e `CategoryService`.

A mudança de disponibilidade continua exclusivamente por `setProductAvailabilityAction`, que delega a validação e autorização ao backend. O navegador não altera `products` diretamente.

Cada item exibe primeiro nome, disponibilidade, categoria e preço. SKU e presença de imagem permanecem informação secundária. Duplicação continua usando a action existente.

## Mobile

A navegação de Cardápio deixa de depender de uma faixa horizontal. Em telas menores ela vira uma pilha curta e os filtros passam para duas ou uma coluna. As ações operacionais ocupam largura adequada ao toque.

## Fora de escopo

- alterar schema ou RLS;
- criar regra nova de disponibilidade;
- alterar cálculo de preços;
- redesenhar o editor completo do produto, reservado para [290].
