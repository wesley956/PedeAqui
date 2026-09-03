# Evidência live — Lote de estabilização #819–#828

Captura: 2026-09-03  
Projeto Supabase: Cruz (`zsbsczjhiujnhdznrzck`)  
Modo das consultas: somente leitura. Nenhuma linha de cliente/configuração foi alterada.

## #820 — superfície pública e backend-only

- Security Advisor revisado sem aplicar correções cegas.
- `public.get_public_menu(text)` e `public.get_public_product(text, uuid)` são `SECURITY DEFINER`, `STABLE`, possuem `search_path=''` e têm execução para `anon`, `authenticated` e `service_role` porque sustentam o cardápio público.
- As implementações limitam a loja a `active`/`temporarily_closed`, escopam produto/categorias por `organization_id` + `store_id`, ignoram registros inativos/deletados e retornam somente o payload público necessário.
- Foram encontradas 47 tabelas com RLS habilitado e zero policies; consulta de grants confirmou **0/47 com grant direto de tabela para `anon` ou `authenticated`**. Elas foram registradas em `supabase/security-backend-only-baseline.json` e há teste impedindo acesso PostgREST direto a essas tabelas em módulos `use client`.
- Advisor ainda informa `Leaked Password Protection Disabled`. Esse item requer configuração de Auth hospedada no Supabase Dashboard/Management API e deve permanecer pendente até ativação + teste de login/recuperação.

## #822 — drift de migrations

- Supabase real lista 183 migrations aplicadas.
- A última migration aplicada é `20260902054003 payment_completion_policies`.
- O baseline versionado converge até `180_payment_completion_policies.sql`.
- `181_stabilization_driver_idempotency_and_index_hardening.sql` e `182_stabilization_data_integrity_diagnostics.sql` permanecem migrations locais pendentes, em sequência append-only.
- O CI valida histórico local e baseline. A comparação via `SUPABASE_DB_URL` continua opcional quando o secret não está configurado, por isso a listagem live do conector foi usada como evidência complementar.

## #823 — índices e FKs

### Duplicidade comprovada

Consulta por definição normalizada encontrou exatamente um par duplicado:

- tabela: `drivers`
- índice canônico mantido: `drivers_store_user_unique_idx`
- índice duplicado removido pela migration #181: `uq_drivers_store_user_active`

### FKs sem índice líder

- 134 FKs sem índice líder foram identificadas.
- Todas estão atualmente na classe `low-volume`.
- Maior estimativa entre essas tabelas: aproximadamente 1.415 linhas.
- Decisão: não criar 134 índices por recomendação genérica. Manter medição por consulta/carga concreta e corrigir somente gargalos comprovados.

### Amostra de uso nas tabelas operacionais

A coleta de `pg_stat_user_tables` mostrou uso real de índices em tabelas críticas como `orders`, `order_items`, `products` e `print_jobs`. `drivers` possui poucos registros e alto número de sequential scans, reforçando que o índice duplicado não traz benefício mensurável e pode ser removido sem adicionar outro índice equivalente.

## #824 — invariantes de integridade

A mesma lógica da migration #182 foi executada diretamente em produção em modo somente leitura. Resultado:

- 15 checks críticos: **0 inconsistências**.
- 2 checks de warning: **0 inconsistências**.
- Total: **17/17 checks zerados**.

Cobertura inclui:

- pedido/item órfão ou fora do escopo;
- entrega/pedido/entregador fora do escopo;
- produto/categoria/modificadores fora do escopo;
- cliente/endereço fora da organização;
- impressão/pedido/impressora/agente/estação fora do escopo;
- fulfillment final com pedido ainda aberto;
- entrega concluída com pedido ainda aberto.

A função versionada retorna somente `check_key`, `severity` e `issue_count`, sem PII, e será executável apenas por `service_role` após promoção da migration.

## Regra de fechamento

Nenhuma issue deste lote deve ser marcada como concluída apenas por esta evidência. O fechamento exige também CI verde e, onde o critério pede, validação visual/browser ou configuração externa efetivamente aplicada.
