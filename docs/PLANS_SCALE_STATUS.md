# PedeAqui — Planos, Escala e White-label [239]–[253]

## Status

Milestone 23 implementado no PR #279, branch `agent/plans-scale-whitelabel-239-253`, sobre o Fiscal já consolidado no `main` pelo PR #263.

Issues oficiais: #264–#278.

## Escopo entregue

- catálogo `plans`, `features` e `plan_features`;
- assinatura única efetiva por organização com histórico imutável;
- estados `trialing`, `active`, `past_due`, `cancelled` e `expired`;
- `EntitlementService`: RBAC responde **quem pode** e entitlement responde **se o plano habilita**;
- ledger/projeção de uso por feature e período com consumo atômico e idempotente;
- quotas concorrentes reais para recursos persistentes, como domínios personalizados;
- contrato/registry de provider de billing desacoplado;
- webhook de billing assinado, idempotente e protegido contra replay divergente;
- console SaaS `/platform` isolado dos dados operacionais dos tenants;
- branding/white-label por organização aplicado ao shell real via CSS variables;
- domínio customizado com ownership por DNS TXT `_pedeaqui.<domínio>`;
- grupos/franquias e vínculos de lojas limitados à mesma organização;
- central de compras multiunidade derivada do estoque real de cada loja;
- BI multiunidade derivado de `orders` e do relatório financeiro existente;
- catálogo/marketplace de adapters aprovados, sem carregamento arbitrário de código do banco;
- painel `/escala` para assinatura, entitlements, branding, domínios, grupos, compras, BI e integrações.

## Banco e segurança

Migrations do bloco:

- `plans_scale_core_239_253`
- `entitlements_usage_239_253`
- `subscription_lifecycle_billing_239_253`
- `platform_branding_domains_scale_239_253`
- `scale_reporting_marketplace_239_253`
- `scale_entitlement_guards_239_253`
- `domain_token_hardening_239_253`
- `scale_fk_indexes_239_253`
- `scale_fk_indexes_final_239_253`

Validação final no Supabase oficial:

- 14/14 tabelas do bloco com RLS;
- 0 privilégios diretos para `anon`/`authenticated` nessas tabelas;
- 0 EXECUTE de RPCs internas do bloco para browser;
- Security Advisor sem alerta novo do módulo; apenas INFO históricos de tabelas server-only de módulos anteriores;
- FKs novas do módulo cobertas após revisão do Performance Advisor.

## E2E PostgreSQL final

Executado dentro de `BEGIN/ROLLBACK`:

1. organização entra no plano Profissional;
2. primeiro domínio é aceito;
3. segundo domínio é bloqueado pelo limite 1;
4. upgrade para Gestão libera novo domínio;
5. white-label passa a ser permitido;
6. grupo multiunidade é criado e recebe loja da mesma organização;
7. tentativa de vincular loja de outra organização é bloqueada;
8. adapter aprovado é instalado pelo marketplace;
9. BI multiunidade retorna estrutura válida;
10. retry do webhook de billing com mesmo payload é idempotente;
11. replay com hash diferente é bloqueado;
12. assinatura percorre `active → past_due → active` mantendo histórico.

Resultado observado: 2 domínios, 1 membro de grupo, adapter instalado, BI válido, quota bloqueada, isolamento cross-org bloqueado, replay divergente bloqueado, assinatura final `active`, 4 eventos de histórico.

Rollback final confirmado: **0 organizações E2E, 0 usuários E2E, 0 receipts de billing E2E e 0 adapters E2E persistidos**.

## Correção encontrada pelo hardening

O primeiro E2E detectou que `gen_random_bytes()` não era resolvido dentro de uma função com `search_path=''`. A função do projeto está no schema `extensions`. A migration `domain_token_hardening_239_253` passou a usar explicitamente `extensions.gen_random_bytes(18)`; o E2E foi repetido e passou.

## Limites externos honestos

O núcleo de billing está pronto, mas nenhum provider de cobrança real foi registrado/homologado nesta implementação. Checkout, portal e webhook real dependem do adapter e credenciais escolhidos.

Domínio customizado verifica ownership via DNS TXT; provisionamento de TLS/edge permanece desacoplado do provedor de hospedagem.

O console `/platform` exige membership explícita em `platform_admins`; nenhum usuário foi promovido automaticamente a Super Admin.
