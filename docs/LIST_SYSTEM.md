# PedeAqui — Sistema de listagens

> Origem: issue **[266]**.

## Componentes

- `ListToolbar`: área para pesquisa, filtros, ordenação e ações.
- `ResponsiveDataList`: mesma informação como tabela no desktop e cards no celular.
- `ListPagination`: resumo e controles de paginação fornecidos pelo módulo.

## Desktop

Use tabela semântica com caption, cabeçalhos `scope=col`, alinhamento numérico à direita e números tabulares. Ações por item ficam na última coluna. Tabelas podem rolar horizontalmente acima do breakpoint mobile, mas informação essencial não deve depender do scroll no celular.

## Mobile

Abaixo de 640 px, a tabela é substituída por cards. Todas as colunas configuradas são repetidas como pares rótulo/valor; não existe ocultação automática de informação essencial. Ações permanecem dentro do card correspondente.

## Pesquisa, filtros e ordenação

`ListToolbar` recebe componentes/controles já construídos pelo módulo. Pesquisa deve usar `SearchInput` da [263]. Filtros e ordenação usam os controles oficiais de formulário. A lógica de consulta continua pertencendo ao módulo/backend.

## Estados

`ResponsiveDataList` integra `LoadingState`, `ErrorState` e `EmptyState` da [265]. O módulo fornece mensagem de erro segura e ação de recuperação quando houver.

## Paginação

A paginação não assume mecanismo de navegação. O módulo fornece controles `previous`/`next` como links ou botões apropriados. O resumo deve indicar claramente o recorte exibido, por exemplo “1–25 de 132”.

## Acessibilidade

- tabela desktop mantém estrutura HTML nativa;
- cards mobile usam `role=list`/`listitem`;
- ordenação ativa pode usar `aria-sort`;
- foco dentro de uma linha/card fica visualmente evidente;
- ações continuam nomeadas e alcançáveis por teclado;
- estado de lista nunca depende apenas de cor.

## Fora de escopo

A [266] define a infraestrutura. Conteúdo específico de pedidos, clientes, estoque, financeiro e outros módulos será migrado nas respectivas etapas e na consolidação [269].
