# Diagnóstico de apresentação — lote PA-DIAG-016 a PA-DIAG-020

Data de corte: 2026-08-22  
Master: GitHub #539  
Issues executadas neste lote: #555, #556, #557, #558 e #559

## Resultado

| Diagnóstico | Issue | Estado | Evidência |
| --- | --- | --- | --- |
| `PA-DIAG-016` CRUD de categorias | #555 | Aprovado | criar, ler, editar, ativar/inativar e remover por soft delete |
| `PA-DIAG-017` CRUD de produtos | #556 | Aprovado | criar, ler, editar, duplicar, alterar disponibilidade e remover por soft delete |
| `PA-DIAG-018` imagens | #558 | Parcial | seleção, validação, troca, remoção visual e rollback aprovados; envio autenticado final depende da conta de homologação |
| `PA-DIAG-019` preço, promoção, descrição e disponibilidade | #559 | Aprovado | regras de schema, tela de edição e ciclo transacional live aprovados |
| `PA-DIAG-020` adicionais, tamanhos, sabores e obrigatoriedade | #557 | Aprovado | CRUD completo de grupos/opções, mínimo, máximo, obrigatório, preço extra e vínculo/desvínculo com produto aprovados |

## CRUD de categorias

A página `/cardapio/categorias` agora expõe as operações já existentes no serviço:

- criação com nome, descrição, ordem, estado e imagem;
- leitura tenant/store-scoped;
- edição inline de todos os campos;
- troca ou remoção da imagem atual;
- remoção lógica: `active=false` e `deleted_at`, preservando produtos e histórico.

## CRUD de produtos

A nova rota `/cardapio/produtos/[id]` permite editar:

- nome, descrição e categoria;
- preço, promoção e custo;
- foto atual, substituição e remoção;
- disponibilidade e estado ativo;
- preparo, SKU e código de barras.

A lista mantém busca/filtros, disponibilidade rápida e duplicação, e agora oferece Editar e Remover. A remoção é lógica (`inactive`, `active=false`, `deleted_at`) para não invalidar pedidos antigos.

## Imagens

Cliente e servidor aceitam JPEG, PNG e WebP até 4 MiB. Um arquivo novo é removido do Storage se a persistência da categoria ou do produto falhar. Na troca/remoção bem-sucedida, o registro atual deixa de referenciar a foto antiga, mas o objeto não é apagado imediatamente: pedidos guardam snapshots de URL e a limpeza física exige uma rotina de retenção que comprove ausência de referências.

O bucket live permaneceu intacto durante este lote. O upload ponta a ponta no navegador continua dependendo da conta de homologação; não foi usado login de super admin nem arquivo de cliente real.

## Preço, promoção e disponibilidade

- dinheiro é convertido para centavos inteiros;
- promoção não pode superar o preço normal;
- descrição aceita até 1.000 caracteres;
- produto desativado sempre persiste como `inactive`;
- atalhos de disponível/esgotado continuam auditados;
- tela de edição reapresenta valores em formato decimal compatível com o parser.

## Tamanhos, sabores e escolhas

O domínio usa um modelo único:

- “Escolha o tamanho” ou “Escolha o sabor” = grupo de modificadores;
- “Pequeno”, “Grande”, “Calabresa” = modificadores/opções;
- escolha obrigatória = `required=true` e `min_selection >= 1`;
- limite de escolhas = `max_selection`;
- acréscimo = `price_cents` da opção;
- vínculo e ordem pertencem ao par produto/grupo e são tenant/store-safe.

Não existe uma entidade paralela para “tamanho” ou “sabor”; isso evita duplicar regras de preço e obrigatoriedade.

A página `/cardapio/adicionais` agora oferece criação, leitura, edição, ativação/inativação e remoção lógica de grupos e opções. A tela `/cardapio/produtos/[id]` permite vincular, reordenar e desvincular grupos sem apagar o grupo compartilhado por outros produtos. Remoções preservam pedidos antigos.

## Evidência live com rollback

No tenant marcado `platform_demo=true`, uma transação sintética criou categoria, produto, grupo obrigatório “Escolha o tamanho”, duas opções e o vínculo entre produto e grupo. Depois atualizou categoria, nome/descrição/preço/promoção/disponibilidade do produto e aplicou soft delete em categoria e produto.

O resultado final retornou:

- `category_crud=true`;
- `product_crud=true`;
- `modifier_group_crud=true`;
- `modifier_crud=true`;
- `required_choice_group=true`;
- `size_options_count=2`;
- `link_crud=true`.

A transação terminou com `ROLLBACK`; nenhuma categoria, produto ou adicional de diagnóstico permaneceu na demo.
