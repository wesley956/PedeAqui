# Supabase — Cruz

Os arquivos em `supabase/sql/` são a especificação canônica da fundação enquanto o projeto Supabase ainda não está vinculado a este repositório.

## Aplicação correta

1. Instalar/atualizar Supabase CLI.
2. Vincular o projeto correto.
3. Criar a migration com `supabase migration new foundation` (não criar nome de migration manualmente).
4. Copiar/revisar o SQL de `sql/01_foundation_tables.sql`, `02_rls_policies.sql` e `03_seed_permissions.sql` para a migration.
5. Aplicar primeiro em ambiente de desenvolvimento/staging.
6. Rodar advisors e corrigir alertas.
7. Validar RLS com dois usuários de organizações diferentes.
8. Gerar/confirmar types do banco para o app.

## Segurança

- RLS deve permanecer habilitado em toda tabela exposta.
- `service_role` é somente servidor e nunca deve ser prefixado com `NEXT_PUBLIC_`.
- Policies precisam restringir tenant/ownership; `TO authenticated` sozinho não autoriza acesso ao tenant.
- Não usar `user_metadata` para decisões de autorização.
- Funções `SECURITY DEFINER` auxiliares ficam em schema `private`, têm `search_path` vazio e validam `auth.uid()`.
- Caso as configurações de Data API do projeto exijam grants explícitos, conceder apenas o mínimo necessário e manter RLS habilitado.

## Status

A especificação está versionada, mas ainda não foi aplicada a um projeto Supabase nesta branch. A issue #2 só deve ser fechada depois da execução/validação no projeto real.
