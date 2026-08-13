# PedeAqui — Status Estoque e Fichas Técnicas [186]–[198]

## Estado

Milestone 19 concluído e mesclado em `main` pelo PR #220. Merge commit: `d93972cd8720c3594a0106d3ee66204b52acade7`.

Issues #207–#219 encerradas como `completed`.

## Princípios de domínio

- `inventory_movements` é o ledger imutável e a fonte de verdade dos movimentos.
- `inventory_balances` é apenas projeção transacional para leitura rápida.
- a UI nunca sobrescreve saldo diretamente;
- quantidades usam PostgreSQL `numeric(18,6)` e unidade-base `unit|g|ml`, sem `float` vindo do navegador;
- custo de insumo é armazenado em microcentavos por unidade-base para suportar custo subcentavo;
- fichas técnicas são imutáveis e versionadas;
- produto ou adicional sem ficha não gera consumo inventado;
- a baixa automática acontece em `order.completed` de forma idempotente.

## [186]–[189] Estoque

### Mestre de insumos

`inventory_items` pertence à organização. A configuração operacional fica em `inventory_item_stores`, por unidade.

Cada unidade pode definir:

- ativo/inativo;
- estoque mínimo;
- permitir ou bloquear saldo negativo;
- custo médio projetado.

A mesma identidade de insumo pode ser habilitada em várias unidades, permitindo transferência sem duplicar o mestre.

### Ledger e projeção

`inventory_movements` suporta:

- `purchase`;
- `sale`;
- `loss`;
- `adjustment`;
- `transfer`;
- `production`;
- `return`.

Cada movimento possui chave idempotente, quantidade assinada exata, referência de origem, pedido/transferência quando aplicável, motivo, metadata, ator e timestamp.

Update/delete do ledger é bloqueado por trigger.

`inventory_balances` é atualizado na mesma transação do movimento. Retry é reconhecido antes de revalidar saldo, evitando falha causada pelo efeito da primeira tentativa.

### Operações

RPCs internas implementadas:

- criar insumo;
- habilitar insumo em unidade;
- atualizar configuração do insumo na unidade;
- entrada/retorno/perda/ajuste/produção;
- transferência entre unidades;
- contagem/reconciliação física.

Todas são service-role-only no banco e só são chamadas depois de autorização/escopo org+unidade na aplicação.

Transferência gera exatamente dois movimentos, saída e entrada, ligados por `transfer_group_id`. Transferências opostas do mesmo insumo são serializadas por advisory lock para reduzir risco de deadlock A→B/B→A.

Contagem física nunca grava um “novo saldo” diretamente: calcula contado − projetado e gera apenas o ajuste compensatório necessário. A idempotência é persistida mesmo quando a diferença é zero e nenhum movimento precisa ser criado.

## [190]–[193] Fichas técnicas e consumo

`recipes` pode ter alvo:

- produto;
- adicional/modifier.

Uma edição não altera a versão anterior: cria uma nova versão imutável com `version`, `effective_at` e seus `recipe_items`.

A quantidade de cada insumo é exata na unidade-base.

### Regra histórica

Na conclusão do pedido, a receita só pode ser usada se:

1. estava vigente na confirmação (`effective_at <= confirmed_at`);
2. a versão já existia na confirmação (`created_at <= confirmed_at`).

Isso impede que uma versão criada depois seja retroativamente aplicada a um pedido antigo, mesmo se alguém informar uma vigência anterior.

Desativar um insumo depois da confirmação também não apaga a obrigação histórica daquele pedido: a baixa `sale` histórica continua registrada. Novas operações manuais continuam exigindo o insumo ativo.

### Produtos e adicionais

O consumo percorre:

- `order_items` para receita do produto;
- `order_item_modifiers` para receita de adicionais.

As chaves idempotentes incluem pedido, item/adicional, versão da receita e insumo, garantindo exatamente um conjunto lógico de baixas por pedido concluído.

Produto/adicional sem ficha não recebe quantidade “chutada”; o sistema emite `inventory.recipe_missing`.

## [192] Custo estimado

O custo estimado da ficha usa:

`quantidade da receita × custo médio atual do insumo`

O custo é analítico/preparatório para Compras. A composição histórica da receita não muda quando o custo do insumo muda.

## [194] Alertas de reposição

Ao cruzar o estoque mínimo para baixo, o domínio emite `inventory.low_stock`.

Ao recuperar saldo acima do mínimo, emite `inventory.restocked`.

O alerta é evento/projeção operacional; não cria compra automaticamente neste milestone.

## [195] `/estoque`

Tela responsiva com:

- saldo projetado;
- unidade-base;
- estoque mínimo;
- alerta de reposição;
- saldo negativo destacado;
- movimentos recentes;
- entrada/perda/ajuste/produção;
- contagem física;
- transferência entre unidades;
- configuração por unidade;
- criação/habilitação de insumos.

Não existe campo para editar saldo diretamente.

## [196] `/estoque/fichas`

Tela responsiva com:

- criação de nova versão por produto ou adicional;
- linhas dinâmicas de insumo/quantidade;
- vigência;
- observações;
- histórico de versões;
- custo estimado atual;
- explicação explícita de imutabilidade/histórico.

## Segurança

Validações no Supabase oficial:

- 6/6 tabelas novas com RLS;
- `anon`: zero privilégios diretos nas tabelas do domínio;
- `authenticated`: zero privilégios diretos nas tabelas do domínio;
- `anon/authenticated`: zero EXECUTE nas RPCs internas de estoque/ficha;
- Security Advisor final sem alertas de segurança introduzidos pelo bloco.

As FKs novas sinalizadas pelo Performance Advisor receberam índices de cobertura em `60_inventory_fk_indexes.sql`. Índices recém-criados podem aparecer como `unused` antes de tráfego real; avisos históricos de outros domínios não foram alterados sem evidência.

## E2E PostgreSQL com rollback

### Cenário principal

Validado no Supabase oficial:

- 2 unidades;
- insumos Carne e Bacon;
- compra inicial de 1.000 g com retry idempotente;
- receita v1 do produto: 100 g de carne;
- receita v1 do adicional: 20 g de bacon;
- pedido confirmado com quantidade 2;
- receita v2 do produto: 150 g, criada depois da confirmação;
- pagamento real no ledger via RPC;
- pedido servido e concluído;
- consumo do produto: exatamente 200 g da v1;
- consumo do adicional: exatamente 40 g;
- exatamente dois movimentos `sale` para o pedido;
- política `allow_negative=false` bloqueou saída excedente;
- transferência de 100 g gerou exatamente saída+entrada e retry não duplicou;
- contagem física gerou ajuste compensatório de -10 g;
- evento de estoque mínimo foi emitido;
- rollback final: zero resíduos.

### Hardening histórico

Segundo E2E validou especificamente:

- v1 criada antes da confirmação;
- v2 criada depois da confirmação, mas com `effective_at` retroativo;
- insumo desativado depois da confirmação;
- conclusão consumiu v1, não v2;
- baixa histórica ocorreu mesmo com o insumo já inativo;
- rollback final: zero resíduos.

## Migrations oficiais

- `inventory_core_186_198`;
- `inventory_operations_186_198`;
- `inventory_recipes_186_198`;
- `inventory_order_consumption_186_198`;
- `inventory_idempotency_hardening_186_198`;
- `inventory_fk_indexes_186_198`;
- `inventory_historical_recipe_hardening_186_198`.

O arquivo de repositório `58_inventory_recipes_consumption.sql` contém receitas + consumo juntos; no Supabase oficial a aplicação foi dividida em duas migrations menores porque o conector bloqueou a chamada longa antes de executar qualquer DDL. Não houve aplicação parcial.

## CI

O **CI #138**, no head `51514b588e481726bab63f2e328fb573365acc01` retargetado para `main`, passou lint, TypeScript, testes, Print Agent e build antes do merge.

## Limites honestos

- não existe leitura de balança física;
- não houve teste em hardware de estoque;
- estoque mínimo não cria pedido de compra automaticamente;
- custo médio é projeção operacional e não substitui o futuro ledger contábil/financeiro.

## Continuação

O módulo **Compras e Fornecedores [199]–[210]** reutiliza diretamente `inventory_items`, custo médio, estoque mínimo e ledger de movimentos no draft PR #233. Financeiro/DRE vem depois desse bloco.
