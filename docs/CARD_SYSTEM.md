# PedeAqui — Cards e superfícies

> Origem: issue **[264]**.

## Fonte canônica

Use `Card`, `CardHeader`, `CardBody`, `CardActions` e `KpiValue` de `src/components/ui/card.tsx`. O export antigo `Card` de `primitives.tsx` aponta para a mesma implementação.

## Tipos de card

- `operational`: execução diária e informação acionável.
- `informational`: conteúdo geral sem urgência.
- `kpi`: indicador numérico/gerencial.
- `order`: pedido e objetos com fluxo operacional.
- `product`: item de catálogo/cardápio.
- `table`: mesa/comanda/sessão de salão.
- `customer`: cliente e relacionamento.
- `alert`: informação que exige atenção.

O `kind` descreve a finalidade do objeto, não seu estado. Estado visual usa `tone`.

## Tons

`neutral`, `success`, `warning`, `danger` e `info` usam exclusivamente tokens semânticos. Nunca crie uma variante copiando hexadecimal de um módulo.

## Densidade

- `compact`: painéis densos e listas operacionais.
- `standard`: padrão do produto.
- `comfortable`: conteúdo com maior respiro.

No mobile, densidades padrão e confortável convergem para padding menor para preservar área útil.

## Composição

`CardHeader` organiza título, subtítulo e ação contextual. `CardBody` contém a informação principal. `CardActions` concentra ações no final e quebra de linha quando necessário. `KpiValue` usa números tabulares para reduzir deslocamento visual.

## Regras

Cards não devem incorporar regras de domínio. Pedido, produto, mesa e cliente continuam sendo dados fornecidos pelos módulos. A camada visual cuida de geometria, superfície, hierarquia e responsividade.

Não use a cor como única informação de estado. O componente de status da [267] será responsável por texto, ícone e semântica operacional.
