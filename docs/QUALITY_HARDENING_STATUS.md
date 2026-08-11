# PedeAqui — Qualidade e Hardening [116]–[126]

Branch: `agent/quality-hardening-116-126`
Base: `agent/customers-dashboard-111-115`

## Issues

- [116] #131 — PricingService
- [117] #132 — Order State Machine
- [118] #133 — isolamento multiempresa
- [119] #134 — checkout duplicado
- [120] #135 — concorrência de pedido
- [121] #136 — fila de impressão
- [122] #137 — E2E Cardápio → Cozinha
- [123] #138 — E2E PDV → Cozinha
- [124] #139 — hardening de segurança
- [125] #140 — performance do MVP
- [126] #141 — validação mobile

## [116] PricingService

A suíte agora cobre:
- preço promocional explícito, inclusive zero;
- preço-base + adicionais em centavos inteiros;
- grupo obrigatório e limite máximo;
- adicional externo ao produto;
- adicional duplicado;
- produto indisponível;
- quantidade zero, negativa, acima do limite, fracionada e NaN;
- valores monetários negativos;
- overflow de `Number.MAX_SAFE_INTEGER`;
- total de carrinho negativo/overflow.

O navegador nunca vira autoridade de preço.

## [117] State Machines

Teste matricial completo das quatro máquinas independentes:
- order;
- payment;
- production;
- fulfillment.

Cada par `from → to` é comparado contra a matriz oficial. Auto-transição continua idempotente. Também são validados os estados de fulfillment considerados concluídos.

## [118] Isolamento multiempresa

Teste PostgreSQL real com rollback:
- duas organizações;
- dois usuários;
- dois papéis com `customers.view`;
- um cliente por organização;
- execução como role `authenticated` usando o JWT subject do usuário A.

Resultado: usuário A visualizou exatamente 1 cliente da própria organização e 0 da organização B. Pós-rollback confirmou zero resíduos.

Script versionado: `supabase/tests/quality_rls_isolation.sql`.

## [119] Checkout duplicado

A conversão real `create_order_from_checkout_internal` foi chamada duas vezes com o mesmo carrinho/token.

Resultado:
- primeira chamada: `created=true`;
- segunda chamada: `created=false`;
- mesmo `order_id`;
- exatamente 1 pedido;
- carrinho convertido uma única vez.

O contrato também verifica `FOR UPDATE` no carrinho/checkout e uniques por `source_cart_id`/`checkout_session_id`.

## [120] Concorrência

Contratos automatizados validam:
- `FOR UPDATE` em cart e checkout;
- sequência atômica por loja via `INSERT ... ON CONFLICT DO UPDATE`;
- uniques de origem/número amigável;
- lock da chave `pdv.sale` em `idempotency_keys`;
- `FOR UPDATE SKIP LOCKED` na fila de impressão;
- lease + `claimed_by_agent_id`.

O conector atual do Supabase não fornece uma segunda credencial/sessão SQL para um teste simultâneo de duas conexões. Foi tentado `dblink` dentro de rollback, mas PostgreSQL exige senha/GSSAPI para a conexão self-hosted. Portanto não há alegação falsa de teste paralelo: locks/uniques são testados como contratos e as operações idempotentes foram executadas repetidamente no banco real. Um runner futuro com `DATABASE_URL` pode adicionar carga paralela multi-sessão.

## [121] Fila de impressão

Teste PostgreSQL real com rollback validou:
- claim pelo agente atribuído;
- agente errado impedido de falhar job alheio;
- `max_attempts`;
- fallback para segunda impressora;
- reset de tentativas no fallback;
- `print.fallback_activated` como evento de `print_job`, com `order_id` no payload;
- novo claim do fallback;
- ACK final em `printed`.

Script versionado junto do E2E PDV: `supabase/tests/e2e_pdv_to_kitchen.sql`.

## [122] E2E Cardápio → Cozinha

Teste PostgreSQL real com rollback:
- cart ativo + item válido;
- checkout revisado;
- conversão idempotente para pedido;
- confirmação;
- trigger da Central de Impressão;
- exatamente 1 print job;
- início atômico da produção;
- pedido chega a `production_status=preparing`.

Script: `supabase/tests/e2e_menu_to_kitchen.sql`.

## [123] E2E PDV → Cozinha

Teste PostgreSQL real com rollback:
- produto de R$ 15,90;
- pagamento em dinheiro com R$ 20,00;
- pedido `confirmed`;
- payment ledger `paid`;
- produção `preparing`;
- job de impressão;
- fallback/ACK;
- produção `ready`;
- fulfillment `served`;
- pedido `completed`.

Script: `supabase/tests/e2e_pdv_to_kitchen.sql`.

## [124] Security Hardening

Migration live: `quality_hardening_116_126` (`supabase/sql/32_quality_hardening.sql`).

Mudanças:
- `anon` perdeu todos os privilégios diretos sobre tabelas do schema `public`;
- `bootstrap_organization`, `accept_invitation` e `has_permission` deixaram de ser executáveis por `anon`;
- anon mantém apenas `get_public_menu` e `get_public_product` entre as projeções públicas atuais;
- default privileges futuros deixam de conceder tabelas a anon;
- default EXECUTE de funções para `PUBLIC` é revogado para objetos futuros criados pelo owner da migration;
- headers HTTP defensivos no Next.js: CSP, nosniff, DENY/frame-ancestors, Referrer-Policy, Permissions-Policy e COOP;
- teste de repositório impede import de `service_role`/admin client em arquivos `use client`;
- RPCs críticas possuem contratos para SECURITY INVOKER + revoke de navegador + grant service_role.

Validação live após migration:
- `anon_table_privileges = 0`;
- `public_tables_without_rls = 0`;
- `anon get_public_menu = true`;
- `anon get_public_product = true`;
- `anon bootstrap_organization = false`;
- `anon accept_invitation = false`;
- `anon has_permission = false`;
- Security Advisor = 0 alertas.

## [125] Performance

Otimizações/revisões:
- detalhe de pedido deixou de fazer `filter()` de todos os adicionais para cada item;
- adicionais passam a ser indexados uma vez em `Map`, reduzindo projeção de O(itens × adicionais) para O(itens + adicionais);
- contratos preservam `Promise.all` e Maps do KDS;
- perfil de cliente mantém quatro leituras independentes em paralelo;
- Dashboard permanece uma agregação server-side em uma única RPC.

Não foram removidos índices apenas porque o banco vazio ainda os marca como `unused`.

## [126] Mobile

Correção concreta no shell autenticado:
- antes, ao esconder a sidebar, a barra inferior usava `navigation.slice(0, 5)` e removia Clientes/Equipe/Configurações;
- agora todos os módulos permanecem acessíveis numa navegação horizontal rolável;
- links da barra mobile têm alvo mínimo de 52px;
- controles do PDV sob 560px têm mínimo de 44px;
- formulários em duas colunas colapsam para uma;
- cardápio público mantém busca de 48px, categorias roláveis e grid fluido.

`tests/mobile-contracts.test.ts` impede regressão dessas garantias estruturais.

## Testes de repositório adicionados/ampliados

- `tests/pricing.test.ts`
- `tests/order-state-machines.test.ts`
- `tests/security-hardening.test.ts`
- `tests/concurrency-contracts.test.ts`
- `tests/mobile-contracts.test.ts`
- `tests/performance-contracts.test.ts`

## Resíduos de teste

Após os cenários live, a consulta final confirmou zero usuários de teste e todas as fixtures foram revertidas.

## Próxima fronteira

O backlog técnico Fase 0 + Fase 1 documentado em `IMPLEMENTATION_BACKLOG.md` termina no item [126]. A próxima expansão macro do blueprint é Salão, mas a numeração e o escopo desse próximo milestone devem ser definidos antes da implementação.
