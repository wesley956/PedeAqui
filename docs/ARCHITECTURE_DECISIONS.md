# Cruz — Decisões de Arquitetura

Este arquivo registra decisões que orientam a implementação. Mudanças relevantes devem ser documentadas por ADR/PR, não feitas silenciosamente.

## ADR-001 — Aplicação web

Usar Next.js 16 App Router + React + TypeScript estrito.

Motivos: SSR/RSC, experiência unificada painel/cardápio, integração natural com deploy web e suporte a Server Actions/Route Handlers. Em Next.js 16, o arquivo de interceptação de requests é `proxy.ts`; ele será usado apenas para renovação/checagens otimistas de sessão, nunca como única camada de autorização.

## ADR-002 — Banco/Auth

PostgreSQL com Supabase como plataforma inicial para Auth, banco, Realtime e Storage.

Regras:
- `@supabase/ssr` para sessão baseada em cookies no Next.js;
- chave publishable no cliente;
- nenhuma chave service/secret exposta no browser;
- RLS habilitado em todas as tabelas expostas;
- autorização não deve usar `user_metadata` controlável pelo usuário;
- políticas sempre restringem tenant/ownership, não apenas `TO authenticated`.

## ADR-003 — Multi-tenancy

Modelo compartilhado com `organization_id` e, quando aplicável, `store_id`.

Defesa em profundidade:
1. RLS no banco;
2. resolução server-side de contexto;
3. `authorize()` por permissão;
4. queries sempre tenant-scoped;
5. testes explícitos Empresa A x Empresa B.

Escopos de role:
- `organization_members.role_id`: role global da organização, usada apenas quando o usuário realmente possui autoridade em todas as unidades;
- `user_store_roles`: roles limitadas às unidades explicitamente atribuídas;
- convites padrão criam membership sem role global e aplicam a função somente via `user_store_roles`;
- `owner` não pode ser concedido por convite padrão.

## ADR-004 — Identidade e perfis

`auth.users` contém a identidade de autenticação. A aplicação mantém `profiles` 1:1. Membership e autorização ficam em tabelas próprias (`organization_members`, `roles`, `permissions`, `user_store_roles`) — nunca em metadata editável pelo usuário.

## ADR-005 — Serviços de domínio

Controllers/Server Actions/Route Handlers fazem transporte e validação. Regras ficam em serviços de domínio. Acesso a dados deve permanecer encapsulável para evitar regra duplicada.

## ADR-006 — Eventos

Começar com outbox persistente (`domain_events`) dentro da mesma transação das mudanças importantes. Dispatch assíncrono evolui sem alterar o contrato dos produtores.

## ADR-007 — Idempotência

Infraestrutura reutilizável baseada em `idempotency_keys`, escopada por organização/loja/operação. Obrigatória em checkout, pedidos, pagamentos e impressão.

## ADR-008 — Auditoria

`audit_logs` é append-only na aplicação. Alterações críticas registram actor, organização, unidade, entidade, before/after e contexto de request. Senhas, tokens e segredos nunca entram no log.

## ADR-009 — Observabilidade

Logs estruturados com request/correlation ID e health endpoint. Dados sensíveis devem ser redigidos. Erros operacionais precisam ser rastreáveis até ação/evento.

## ADR-010 — Impressão

Impressão é subsistema de primeira classe e baseado em fila persistente. O navegador não é spooler. Arquitetura completa em `PRINTING_SYSTEM.md`.

## ADR-011 — Dependências

Dependências de runtime devem ser fixadas em versões estáveis verificadas e lockfile deve ser versionado assim que a instalação puder ser executada em ambiente com registry disponível. Evitar canary/preview no núcleo.

Toolchain validado pelo CI da fundação (agosto/2026): Next.js/eslint-config-next 16.2.12, React/React DOM 19.2.8, Supabase JS 2.111.0, `@supabase/ssr` 0.12.4, TypeScript 6.0.3, Zod 4.4.3, ESLint 9.39.5 e Vitest 4.1.10.

Nota: ESLint 10 foi inicialmente avaliado, mas apresentou incompatibilidade em runtime com o `eslint-plugin-react` carregado pelo `eslint-config-next`; a linha de manutenção 9.39.5 foi adotada e validada por lint + typecheck + testes + build no GitHub Actions.

## ADR-012 — Estrutura

Estrutura inicial:

```
src/
  app/
  components/
  features/
  lib/
  server/
    auth/
    access/
    audit/
    events/
    idempotency/
    observability/
  services/
  domain/
  types/
supabase/
  migrations/
tests/
```

## ADR-013 — Segurança de rotas

`proxy.ts` atualiza cookies/sessão e pode redirecionar visitantes, mas ações sensíveis sempre chamam camada server-side que resolve usuário/contexto e autorização. Nunca considerar presença de cookie suficiente para autorizar uma operação.

## ADR-014 — Soft delete

Entidades operacionais importantes devem preferir `deleted_at`/status quando histórico e auditoria exigirem preservação. Exclusão física só quando segura e explicitamente definida.

## ADR-015 — Dinheiro

Valores monetários não usam `float`. No banco, usar `numeric` ou centavos inteiros conforme contexto; APIs devem ter contrato explícito.
