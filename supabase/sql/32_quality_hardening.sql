-- PedeAqui — bloco [124] Security Hardening.
-- Reduz ACL de anon: o canal público consome projeções RPC, nunca tabelas internas.

-- Nenhuma tabela pública interna precisa de acesso direto do role anon.
revoke all privileges on all tables in schema public from anon;

-- RPCs que dependem de auth.uid() são explicitamente autenticadas.
revoke execute on function public.bootstrap_organization(text,text,text) from anon;
revoke execute on function public.accept_invitation(text) from anon;
revoke execute on function public.has_permission(uuid,uuid,text) from anon;

-- As únicas projeções públicas atuais continuam disponíveis anonimamente.
grant execute on function public.get_public_menu(text) to anon;
grant execute on function public.get_public_product(text,uuid) to anon;

-- Defense in depth para objetos futuros criados pelo owner da migration.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public;
