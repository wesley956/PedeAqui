# [306] Revalidação de isolamento e permissões

Data da homologação: 2026-08-14  
Projeto oficial: `zsbsczjhiujnhdznrzck`

## Resultado

A revisão não exigiu afrouxar nenhuma policy. O contrato permanece em três camadas independentes:

1. **Navegação/UI** decide apenas o que faz sentido mostrar.
2. **Server-side RBAC** chama `has_permission` usando organização + unidade ativa antes de executar operações protegidas.
3. **Postgres/RLS/grants** continua sendo a barreira final de dados.

Ocultar um item do menu não autoriza nem desautoriza uma operação.

## Evidência do banco oficial

Consulta de catálogo `pg_class` + `pg_policies` + `role_table_grants` confirmou:

- todas as tabelas `public` estão com RLS habilitado;
- nenhuma tabela `public` possui grant direto para `anon`;
- tabelas destinadas à Data API autenticada possuem RLS/policies;
- os 20 objetos apontados pelo advisor como `RLS enabled, no policy` pertencem aos domínios server-only de **Estoque/Fichas**, **Compras/Fornecedores** e **Financeiro** e também estão sem grants para `anon` e `authenticated`;
- esses objetos são acessados pela camada de servidor via `service_role`; não foi criada policy apenas para silenciar o advisor.

Os 20 objetos server-only são:

- estoque: `inventory_items`, `inventory_item_stores`, `inventory_balances`, `inventory_movements`, `recipes`, `recipe_items`;
- compras: `suppliers`, `supplier_stores`, `supplier_inventory_items`, `purchase_sequences`, `purchase_orders`, `purchase_order_items`, `purchase_order_history`, `purchase_receipts`, `purchase_receipt_items`;
- financeiro: `financial_accounts`, `financial_account_balances`, `financial_categories`, `financial_obligations`, `financial_transactions`.

A implementação versionada reforça esse desenho com `REVOKE ... FROM anon, authenticated` e grants somente para `service_role` nos arquivos `56_inventory_core.sql`, `62_purchases_core.sql` e `66_finance_core.sql`.

## Teste de sessão sem identidade

Foi executada uma consulta somente leitura com `SET LOCAL ROLE authenticated` e **sem JWT/`auth.uid()`**. Resultado observado:

- `organizations`: 0 linhas visíveis;
- `stores`: 0 linhas visíveis;
- `orders`: 0 linhas visíveis;
- `customers`: 0 linhas visíveis.

Isso confirma que possuir o papel SQL `authenticated`, sozinho, não atravessa o isolamento de tenant.

## RPCs expostos

A revisão de `role_routine_grants` mostrou exposição explícita, não acidental:

- `anon`: somente fluxos públicos de consulta como cardápio/produto/mesa/resumo público de entrega;
- `authenticated`: onboarding/convite, helpers de acesso e RPCs públicos necessários;
- operações internas dos domínios sensíveis continuam revogadas de `anon`/`authenticated` e são chamadas apenas pelo backend.

## Navegação × autorização

`src/components/layout/navigation-model.ts` associa cada módulo organizacional a pelo menos uma permission real. O filtro `canSurfaceModule` exige permission concedida; o módulo de plataforma exige autorização de plataforma separada.

`src/server/access/authorize.ts` permanece como autoridade server-side e executa `has_permission` com `organizationId` e `storeId` do contexto. A variante organizacional força `store_id = null` quando a permission é de escopo global.

Os testes desta issue protegem que:

- nenhum módulo organizacional seja exposto sem permission;
- permission desconhecida não entre no modelo de navegação;
- autorização de plataforma não seja inferida de permission organizacional;
- o servidor continue consultando `has_permission` em vez de confiar no menu ou em metadata do cliente;
- os domínios server-only permaneçam revogados de `anon` e `authenticated`.

## Advisor

O advisor de segurança apresenta apenas avisos informativos de `RLS enabled no policy` para as tabelas server-only acima e o aviso de proteção de senha vazada, que pertence ao escopo da [307]. Não há justificativa para criar policies públicas nessas tabelas apenas para remover o aviso informativo.

Remediação/referência do advisor RLS: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
