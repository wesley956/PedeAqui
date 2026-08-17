create table if not exists public.user_guides (
  user_id uuid not null references auth.users(id) on delete cascade,
  guide_key text not null,
  status text not null default 'not_started',
  current_step integer not null default 0,
  started_at timestamptz,
  skipped_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, guide_key),
  constraint user_guides_key_check check (char_length(guide_key) between 3 and 120),
  constraint user_guides_status_check check (status in ('not_started','in_progress','skipped','completed')),
  constraint user_guides_current_step_check check (current_step between 0 and 20)
);

comment on table public.user_guides is 'Server-backed progress for contextual PedeAqui product guides.';

alter table public.user_guides enable row level security;

revoke all on table public.user_guides from anon;
grant select, insert, update on table public.user_guides to authenticated;
grant select, insert, update on table public.user_guides to service_role;

create policy user_guides_select_own
on public.user_guides
for select
to authenticated
using (user_id = auth.uid());

create policy user_guides_insert_own
on public.user_guides
for insert
to authenticated
with check (user_id = auth.uid());

create policy user_guides_update_own
on public.user_guides
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Existing accounts must not suddenly receive an automatic tour after deploy.
-- They can still replay the guide manually from the persistent Guia button.
insert into public.user_guides (
  user_id,
  guide_key,
  status,
  current_step,
  started_at,
  completed_at,
  created_at,
  updated_at
)
select
  id,
  'restaurant_getting_started_v1',
  'completed',
  0,
  created_at,
  now(),
  now(),
  now()
from auth.users
on conflict (user_id, guide_key) do nothing;
