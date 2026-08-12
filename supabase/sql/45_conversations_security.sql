-- PedeAqui — Milestone 16 [152]–[163]
-- Hardening: tabelas internas permanecem invisíveis ao browser mesmo com RLS explícita.

create policy store_conversation_settings_browser_deny
on public.store_conversation_settings
for select to authenticated
using (false);

create policy automation_sessions_browser_deny
on public.automation_sessions
for select to authenticated
using (false);
