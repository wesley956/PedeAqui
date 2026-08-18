-- Performance hardening for user_guides RLS policies.
-- Preserve the existing per-user authorization semantics while evaluating auth.uid()
-- once per statement through a scalar subquery, as recommended by Supabase Advisor.

drop policy if exists user_guides_select_own on public.user_guides;
drop policy if exists user_guides_insert_own on public.user_guides;
drop policy if exists user_guides_update_own on public.user_guides;

create policy user_guides_select_own
on public.user_guides
for select
to authenticated
using (user_id = (select auth.uid()));

create policy user_guides_insert_own
on public.user_guides
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy user_guides_update_own
on public.user_guides
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
