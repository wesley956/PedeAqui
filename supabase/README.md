# Supabase — PedeAqui

Os arquivos em `supabase/sql/` são a especificação canônica da fundação enquanto o projeto Supabase ainda não está vinculado a este repositório.

## Aplicação correta

1. Instalar/atualizar Supabase CLI.
2. Vincular o projeto correto.
3. Criar a migration com `supabase migration new foundation` (não criar nome de migration manualmente).
4. Revisar e consolidar, nesta ordem, os arquivos:
   - `sql/01_foundation_tables.sql`
   - `sql/02_rls_policies.sql`
   - `sql/03_seed_permissions.sql`
   - `sql/04_bootstrap_organization.sql`
   - `sql/05_access_rpc.sql`
   - `sql/06_accept_invitation.sql`
   - `sql/07_integrity_constraints.sql`
5. Aplicar primeiro em ambiente de desenvolvimento/staging.
6. Rodar advisors e corrigir alertas.
7. Validar RLS com no mínimo:
   - proprietário global;
   - funcionário restrito a uma unidade;
   - segundo tenant independente.
8. Confirmar que usuário restrito a uma loja não consegue selecionar outra loja por ID/cookie/API.
9. Gerar/confirmar types do banco para o app.
10. Só depois promover a migration para produção.

## Segurança

- RLS deve permanecer habilitado em toda tabela exposta.
- `service_role` é somente servidor e nunca deve ser prefixado com `NEXT_PUBLIC_`.
- Policies precisam restringir tenant/ownership; `TO authenticated` sozinho não autoriza acesso ao tenant.
- Não usar `user_metadata` para decisões de autorização.
- Funções `SECURITY DEFINER` auxiliares ficam em schema `private`, têm `search_path` vazio e validam `auth.uid()`.
- Roles globais ficam em `organization_members.role_id`; roles de unidade ficam em `user_store_roles`.
- Convite padrão nunca concede `owner` e cria role apenas nas lojas explicitamente atribuídas.
- Caso as configurações de Data API do projeto exijam grants explícitos, conceder apenas o mínimo necessário e manter RLS habilitado.

## Status

A especificação está versionada, mas ainda não foi aplicada a um projeto Supabase nesta branch. A issue #2 só deve ser fechada depois da execução e validação no projeto real.
