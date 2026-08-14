# [318] Homologação final de banco, autorização e segurança

Data: 2026-08-14  
Projeto oficial: `zsbsczjhiujnhdznrzck`

## Resultado executivo

A homologação final foi feita com consultas **somente leitura** no Supabase oficial depois da conclusão das issues [304]–[317]. Nenhum DDL foi aplicado nesta etapa porque os controles medidos estão coerentes e não surgiu alerta crítico novo que justificasse mudança especulativa.

Estado observado:

- **113/113 tabelas públicas com RLS habilitado**;
- **0 tabelas públicas com RLS desabilitado**;
- **0 grants diretos de tabela para `anon`**;
- papel `authenticated` sem JWT/`auth.uid()` vê **0 organizações, 0 lojas, 0 pedidos e 0 clientes**;
- `service_role` permanece com `BYPASSRLS=true`, exclusivamente para backend confiável;
- histórico remoto possui **89 migrations**, terminando em `20260813065546 / onboarding_role_permission_conflict_hotfix`;
- **0 resíduos** dos UUIDs controlados usados pela suíte E2E [317];
- **0 órfãos** em `order_items`, `cart_items`, `order_item_modifiers` e `cart_item_modifiers` para as relações verificadas;
- advisor de segurança sem alerta `ERROR`/crítico novo;
- permanecem 20 avisos `INFO` conhecidos de `RLS enabled no policy` em tabelas server-only e 1 `WARN` conhecido de proteção contra senha vazada desabilitada no Supabase Auth.

A evidência numérica fica versionada em `supabase/security-qa-baseline.json`.

## Isolamento de organização e unidade

O modelo continua usando três barreiras independentes:

1. contexto de organização/unidade resolvido no servidor;
2. RBAC server-side via `has_permission`;
3. RLS/grants do Postgres como barreira final.

Foi repetido o teste com `SET LOCAL ROLE authenticated` sem JWT. Resultado: nenhuma linha visível em `organizations`, `stores`, `orders` ou `customers`. Portanto, possuir o papel SQL `authenticated` por si só não concede acesso a tenant algum.

A navegação continua sendo somente apresentação. `src/server/access/authorize.ts` permanece responsável pela autorização efetiva e os guardrails de [306] impedem que o menu seja usado como substituto de RBAC.

## Public / authenticated / service_role

### `anon`

- 0 grants diretos de tabela no schema `public`;
- existem 7 grants de rotina intencionais para fluxos públicos controlados, como consultas públicas do cardápio/mesa/entrega;
- endpoints públicos continuam sujeitos ao contrato específico de cada RPC e não recebem `service_role` no cliente.

### `authenticated`

- existem 225 grants de tabela sujeitos a RLS e 15 grants de rotina intencionais;
- o teste sem JWT mostra que esses grants não quebram o isolamento;
- funções server-side sensíveis e tabelas dos domínios isolados continuam protegidas conforme [306].

### `service_role`

- `BYPASSRLS=true` foi confirmado no banco;
- uso permanece exclusivo de código de servidor;
- nenhuma variável de service role pode usar prefixo `NEXT_PUBLIC_`;
- operações internas de Estoque, Compras e Financeiro continuam deliberadamente server-only.

## Advisor de segurança

### Sem alerta crítico novo

O advisor atual não reportou nível `ERROR`/crítico.

### 20 avisos informativos conhecidos

Os 20 `rls_enabled_no_policy` são os mesmos objetos server-only homologados em [306]:

- Financeiro: `financial_account_balances`, `financial_accounts`, `financial_categories`, `financial_obligations`, `financial_transactions`;
- Estoque/Fichas: `inventory_balances`, `inventory_item_stores`, `inventory_items`, `inventory_movements`, `recipe_items`, `recipes`;
- Compras/Fornecedores: `purchase_order_history`, `purchase_order_items`, `purchase_orders`, `purchase_receipt_items`, `purchase_receipts`, `purchase_sequences`, `supplier_inventory_items`, `supplier_stores`, `suppliers`.

Essas tabelas têm RLS ligado, não possuem grants de cliente e são acessadas pelo backend confiável. Não foi criada policy pública apenas para silenciar o linter.

Referência do advisor: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

### 1 warning conhecido de Auth

`auth_leaked_password_protection` permanece `WARN`: proteção contra senhas comprometidas está desabilitada. O fluxo de login/recuperação foi endurecido em [307], mas essa proteção é configuração do serviço Supabase Auth, não migration SQL.

Referência: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Esse warning é **conhecido e não foi mascarado**. Deve ser habilitado no painel Auth quando o plano/configuração do projeto suportar.

## Histórico de migrations e rollback

A trilha reconciliada em [304]–[305] permanece append-only:

- Git conhece o hotfix remoto como `90_onboarding_role_permission_conflict_hotfix.sql`;
- o baseline remoto possui 89 entradas e a mesma cauda;
- CI executa `npm run db:drift` em todo PR/push;
- quando `SUPABASE_DB_URL` está configurado, o CI compara versão/nome contra `supabase_migrations.schema_migrations` em modo somente leitura;
- nenhuma rotina do CI aplica migration automaticamente em produção.

Rollback operacional segue o princípio de correção por migration posterior, não edição destrutiva do histórico já aplicado. Para mudanças de aplicação, o merge commit/release anterior é o ponto de rollback; para mudanças de banco, a reversão deve ser uma nova migration testada, preservando rastreabilidade.

## Integridade e limpeza dos testes

A suíte E2E [317] usa fixtures exclusivamente em memória. Mesmo assim, a homologação final consultou os UUIDs controlados usados pelo teste:

- `00000000-0000-4000-8000-000000000001`
- `00000000-0000-4000-8000-000000000002`

Resultado no banco oficial: **0 lojas correspondentes**.

Também foram verificadas relações críticas:

- `order_items` sem `orders`: 0;
- `cart_items` sem `carts`: 0;
- `order_item_modifiers` sem `order_items`: 0;
- `cart_item_modifiers` sem `cart_items`: 0.

Logo, a homologação E2E deixa zero resíduo no projeto oficial e as relações verificadas não apresentam órfãos.

## Integrações críticas

A matriz de [308] permanece a referência canônica para WhatsApp, billing, fiscal, Print Agent, outbound webhooks e health check. A revisão final confirma os guardrails versionados:

- secrets permanecem server-side;
- billing/WhatsApp possuem correlação e falhas sanitizadas após [311];
- outbound webhook mantém HTTPS, allowlist de host, HMAC, timeout e redirect manual;
- Print Agent mantém token próprio, claim/lease, ack/fail e spool;
- Edge Functions legadas permanecem tombstones 410 documentados em [309], sem reutilização de slug.

Nenhuma integração foi alterada durante esta homologação final.

## Reprodutibilidade

Para reproduzir o gate de aplicação:

```bash
npm run db:drift
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

O workflow também valida a sintaxe do Print Agent. A comparação remota de migrations entra automaticamente quando o secret de banco de leitura está disponível no CI.

## Critério de aprovação

A [318] é aprovada se o mesmo commit tiver:

- baseline de segurança consistente com a evidência ao vivo;
- migrations Git/remoto alinhadas;
- zero resíduo E2E controlado;
- zero RLS desabilitado;
- nenhum alerta crítico novo do advisor;
- testes de isolamento/autorização e integrações preservados;
- CI completo verde, incluindo `test:e2e` e build.

O warning de leaked-password protection fica explicitamente registrado como configuração pendente do Supabase Auth e não é apresentado como resolvido.
