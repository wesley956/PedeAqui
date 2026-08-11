# Fundação #001–#016 — Status

PR de implementação: #17 (`agent/foundation-001-016`).

Este documento registra o que já existe no código e o que ainda precisa de validação antes das issues serem encerradas.

| Backlog | Issue GitHub | Estado atual |
|---|---:|---|
| 001 Core | #1 | scaffold, scripts e CI implementados; lockfile ainda deve ser versionado após instalação validada |
| 002 Database | #2 | schema/RLS/RPCs especificados; ainda não aplicados em projeto Supabase real |
| 003 Auth | #3 | login, cadastro, logout, reset, callback e sessão SSR implementados; aguarda E2E com Supabase real |
| 004 Profiles | #4 | tabela/RLS e upsert no onboarding/convite implementados |
| 005 Organizations | #5 | schema, bootstrap atômico e OrganizationService implementados |
| 006 Stores | #6 | schema, bootstrap, StoreService e status implementados |
| 007 Store context | #7 | contexto server-side, cookies HTTP-only e troca de loja validada por RLS implementados |
| 008 Roles | #8 | roles/permissões, defaults, escopo global/unidade e custom role service implementados |
| 009 Authorization | #9 | `authorize()` e `authorizeOrganization()` implementados; RLS como segunda barreira |
| 010 Invitations | #10 | criação, token hash, expiração e aceite com role por unidade implementados |
| 011 Audit | #11 | `audit_logs`, AuditService e redaction implementados |
| 012 Design System | #12 | Button, Input, Select, Card, Badge, EmptyState e Skeleton iniciais implementados; componentes avançados serão adicionados conforme telas reais |
| 013 Admin layout | #13 | shell desktop/mobile, topbar/sidebar/mobile nav implementados |
| 014 Events | #14 | `domain_events` outbox e EventService implementados |
| 015 Idempotency | #15 | tabela e IdempotencyService implementados; integração começa nos fluxos críticos da Fase 1 |
| 016 Observability | #16 | logger estruturado, redaction, request context e health endpoint implementados |

## Fronteira de acesso definida

- role em `organization_members.role_id` = autoridade global da organização;
- role em `user_store_roles` = autoridade apenas para a loja indicada;
- convite padrão não concede role global;
- `owner` não pode ser concedido por convite padrão;
- seleção de loja é validada por RLS, não apenas por cookie/UI;
- `service_role` nunca é usada como mecanismo de autorização.

## Antes de encerrar as issues

1. CI do PR precisa passar em lint, typecheck, testes e build.
2. Projeto Supabase de desenvolvimento deve ser vinculado.
3. SQL canônico deve virar migration criada pela CLI.
4. Migration deve ser aplicada em staging.
5. Advisors do Supabase precisam ser revisados.
6. Teste multi-tenant obrigatório:
   - owner da Empresa A;
   - funcionário A limitado à Loja A1;
   - Empresa B independente;
   - tentativas A→B e A1→A2 devem falhar.
7. Auth precisa ser testado com confirmação de e-mail e recuperação de senha reais.
8. Lockfile deve ser versionado após a primeira instalação validada.

## Próximo marco após a fundação

Milestone 1 — Catálogo (#017–#024): categories, products, imagens, modifier groups, modifiers, vínculos e disponibilidade.
