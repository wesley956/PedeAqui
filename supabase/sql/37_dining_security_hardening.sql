-- PedeAqui — Salão: torna explícita a negação de acesso direto à sequência interna.
-- A tabela continua service-role-only; a policy existe para documentar a intenção sob RLS.

create policy tab_sequences_deny_direct
on public.tab_sequences
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
