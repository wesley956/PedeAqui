# PedeAqui — Status Compras e Fornecedores [199]–[210]

## Estado

Milestone 20 implementado/validado na branch `agent/purchases-suppliers-199-210`, draft PR #233, base `main` consolidado até [198].

Issues oficiais: #221–#232. O PR permanece draft e não deve ser mesclado sem nova autorização explícita.

## Princípios de domínio

- fornecedor é mestre da organização; condições comerciais/operacionais podem variar por unidade;
- unidade de compra é diferente da unidade-base do estoque e possui fator de conversão exato `numeric(18,6)`;
- pedido de compra guarda snapshots de insumo, embalagem, conversão, quantidade e custo;
- após envio, snapshots do pedido ficam travados;
- recebimentos e correções são imutáveis;
- recebimento atualiza Estoque e custo médio na mesma transação;
- Compras não cria Contas a Pagar neste milestone; o futuro Financeiro consome eventos do domínio;
- sugestão de reposição nunca cria compra automaticamente.

## [199]–[201] Fornecedores

Entidades:

- `suppliers` — cadastro mestre por organização;
- `supplier_stores` — ativo, prazo padrão, pedido mínimo e observações por unidade;
- `supplier_inventory_items` — catálogo fornecedor↔insumo por unidade.

O catálogo registra:

- código no fornecedor;
- unidade de compra, como `caixa 12un` ou `saco 5kg`;
- fator exato para a unidade-base;
- último custo por embalagem;
- fornecedor preferencial do insumo naquela unidade.

Existe no máximo um fornecedor preferencial ativo por insumo/unidade.

## [202]–[204] Pedido de compra

`purchase_orders` possui número amigável atômico por unidade e estados:

`draft → sent → partially_received → received`

Terminal: `cancelled`.

`purchase_order_items` guarda snapshots autoritativos. O frontend envia intenção; servidor/PostgreSQL validam catálogo, quantidade, custo, pedido mínimo e total.

Após `sent`, preço, quantidade pedida, insumo, unidade e conversão não podem ser reescritos. Divergências posteriores entram pelo domínio de recebimento/correção.

## [205]–[207] Recebimentos e correções

`purchase_receipts` e `purchase_receipt_items` são imutáveis.

O recebimento:

1. trava o pedido;
2. reconhece retry idempotente;
3. valida que a quantidade não ultrapassa o pedido;
4. converte embalagem para a unidade-base usando o snapshot;
5. calcula custo em microcentavos por unidade-base;
6. chama o ledger existente de Estoque;
7. atualiza recebido parcial/final;
8. registra auditoria e DomainEvent.

Exemplo: `1 saco 5kg` comprado por R$ 100,00 entra como `5.000 g` com custo-base calculado no banco.

### Correção

Recebimento confirmado nunca é editado/apagado.

- complemento positivo gera nova entrada `purchase` e participa do custo médio;
- estorno negativo gera `adjustment` compensatório e preserva o custo médio atual;
- motivo é obrigatório;
- a correção referencia o recebimento original.

Se uma correção reduzir o total recebido abaixo do pedido, o pedido volta de `received` para `partially_received`.

## Idempotência e concorrência

Criação do pedido, recebimentos e correções usam fingerprints SHA-256 do payload relevante.

- mesma chave + mesmo payload → retry seguro;
- mesma chave + payload diferente → rejeitado;
- item lógico duplicado na mesma operação → rejeitado explicitamente;
- cada item de um recebimento só aparece uma vez;
- o recebimento reutiliza os locks/transações do ledger de Estoque.

## [208] Sugestões de reposição

`/compras` deriva sugestões quando:

`saldo atual <= estoque mínimo`

A sugestão considera fornecedor preferencial/configurado e converte a falta para a unidade de compra quando possível.

Ela é somente operacional. O usuário precisa confirmar/criar o pedido manualmente.

## [209] Interfaces

### `/fornecedores`

- cadastro mestre;
- contatos/documento;
- condições da unidade;
- pedido mínimo e prazo;
- catálogo fornecedor↔insumo;
- unidade/fator de compra;
- custo da embalagem;
- fornecedor preferencial.

### `/compras`

- indicadores de pedidos/recebimentos/reposição;
- sugestões de reposição;
- criação de pedido;
- envio/cancelamento;
- recebimento parcial/final;
- histórico de recebimentos;
- correções compensatórias;
- histórico de estados.

A navegação principal agora expõe `Estoque`, `Fornecedores` e `Compras`.

## Segurança

Validação direta no Supabase oficial após as migrations:

- 9/9 tabelas do domínio com RLS;
- `anon`: zero privilégios diretos nas tabelas;
- `authenticated`: zero privilégios diretos nas tabelas;
- `anon/authenticated`: zero EXECUTE nas oito RPCs internas;
- aplicação chama `authorize()` antes de criar cliente admin/service-role.

O Security Advisor lista apenas INFO `rls_enabled_no_policy` para essas tabelas intencionalmente server-only. Elas não possuem grants diretos para o browser.

## Performance

Todas as FKs novas de Compras/Fornecedores sinalizadas pelo Performance Advisor receberam índices de cobertura em `65_purchase_fk_indexes.sql`.

No Advisor final, nenhuma FK deste domínio aparece em `unindexed_foreign_keys`. Índices novos aparecem como `unused` antes de tráfego real; avisos históricos de outros domínios não foram alterados sem evidência.

## E2E PostgreSQL com rollback

### Cenário operacional

- fornecedor + catálogo `saco 5kg = 5.000g`;
- pedido de 2 sacos;
- recebimento parcial de 1 saco;
- retry idêntico sem duplicar;
- segundo recebimento com custo diferente;
- estoque chega a 10.000g e custo médio ponderado é recalculado;
- correção de −0,5 saco mantém histórico e reabre o pedido como parcial;
- saldo final do cenário: 7.500g;
- rollback final: zero resíduos.

### Hardening

10/10 checks passaram:

- retry de criação gera um único pedido;
- mesma chave de criação com payload diferente é rejeitada;
- retry de recebimento gera um único recebimento;
- mesma chave de recebimento com payload diferente é rejeitada;
- complemento +0,5 saco a custo novo entra como `purchase`;
- custo médio intermediário atualizado corretamente;
- recebimento final conclui o pedido;
- custo médio final correto;
- correção negativa reabre o pedido para parcial;
- correção negativa preserva o custo médio.

Estado final antes do rollback no hardening:

- estoque: 8.750g;
- recebido: 1,75/2 embalagens;
- custo médio: 2.300.000 microcentavos/g;
- 4 movimentos físicos;
- rollback: zero organizações, fornecedores, pedidos, movimentos e usuários de teste.

## Migrations oficiais

- `purchases_core_199_210`;
- `purchase_operations_199_210`;
- `purchase_idempotency_hardening_199_210`;
- `purchase_fk_indexes_199_210`.

## CI

- CI #142: encontrou somente regra React `set-state-in-effect` no helper de chave idempotente;
- helper corrigido para `useRef`, mantendo a mesma chave durante retries e descartando-a apenas após sucesso;
- teste de constraint do hardening corrigido;
- CI #144 no head de código `283a023d36a34ad8a7aa7baa7b646e331bb527ad`: verde em lint, TypeScript, testes, Print Agent e build.

O CI definitivo do PR deve ser o run do head documental final.

## Limites honestos

- não existe Contas a Pagar/DRE neste milestone;
- não existe integração fiscal/nota eletrônica;
- referência/NF é apenas metadado operacional;
- não existe envio automático do pedido ao fornecedor externo;
- não existe compra automática por estoque mínimo;
- E2E executado foi de domínio PostgreSQL, não de fornecedor/ERP externo.

## Próximo bloco

Depois de Compras/Fornecedores, a sequência macro prevista é **Financeiro/DRE [211+]**, que deverá consumir eventos de vendas, pagamentos, caixa e compras sem transformar esses módulos em dependentes do ledger financeiro.
