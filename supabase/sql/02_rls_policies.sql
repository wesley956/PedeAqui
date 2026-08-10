-- Defense-in-depth RLS policies for foundation tables.
-- Helper functions live in a non-exposed schema and always bind authorization to auth.uid().

create schema if not exists private;

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = target_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    );
$$;

revoke all on function private.is_org_member(uuid) from public;
grant execute on function private.is_org_member(uuid) to authenticated;

create or replace function private.can_access_store(
  target_organization_id uuid,
  target_store_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = target_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and (
          m.role_id is not null
          or exists (
            select 1
            from public.user_store_roles usr
            where usr.organization_id = target_organization_id
              and usr.store_id = target_store_id
              and usr.user_id = (select auth.uid())
          )
        )
    );
$$;

revoke all on function private.can_access_store(uuid, uuid) from public;
grant execute on function private.can_access_store(uuid, uuid) to authenticated;

create or replace function private.has_permission(
  target_organization_id uuid,
  target_store_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = target_organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    and (
      exists (
        select 1
        from public.organization_members m
        join public.roles r on r.id = m.role_id and r.organization_id = m.organization_id
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id
        where m.organization_id = target_organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and p.key = target_permission_key
      )
      or (
        target_store_id is not null
        and exists (
          select 1
          from public.user_store_roles usr
          join public.roles r on r.id = usr.role_id and r.organization_id = usr.organization_id
          join public.role_permissions rp on rp.role_id = r.id
          join public.permissions p on p.id = rp.permission_id
          where usr.organization_id = target_organization_id
            and usr.store_id = target_store_id
            and usr.user_id = (select auth.uid())
            and p.key = target_permission_key
        )
      )
    );
$$;

revoke all on function private.has_permission(uuid, uuid, text) from public;
grant execute on function private.has_permission(uuid, uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_members enable row level security;
alter table public.stores enable row level security;
alter table public.user_store_roles enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.domain_events enable row level security;
alter table public.idempotency_keys enable row level security;

create policy "profiles_select_self" on public.profiles
for select to authenticated
using (id = (select auth.uid()));

create policy "profiles_insert_self" on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "organizations_select_member" on public.organizations
for select to authenticated
using (private.is_org_member(id));

create policy "organizations_update_manager" on public.organizations
for update to authenticated
using (private.has_permission(id, null, 'organization.manage'))
with check (private.has_permission(id, null, 'organization.manage'));

create policy "stores_select_authorized" on public.stores
for select to authenticated
using (private.can_access_store(organization_id, id));

create policy "stores_insert_manager" on public.stores
for insert to authenticated
with check (private.has_permission(organization_id, null, 'stores.manage'));

create policy "stores_update_manager" on public.stores
for update to authenticated
using (
  private.can_access_store(organization_id, id)
  and private.has_permission(organization_id, id, 'stores.manage')
)
with check (
  private.can_access_store(organization_id, id)
  and private.has_permission(organization_id, id, 'stores.manage')
);

create policy "stores_delete_manager" on public.stores
for delete to authenticated
using (
  private.can_access_store(organization_id, id)
  and private.has_permission(organization_id, id, 'stores.manage')
);

create policy "permissions_select_authenticated" on public.permissions
for select to authenticated
using (true);

create policy "roles_select_member" on public.roles
for select to authenticated
using (private.is_org_member(organization_id));

create policy "roles_manage_team" on public.roles
for all to authenticated
using (private.has_permission(organization_id, null, 'team.manage'))
with check (private.has_permission(organization_id, null, 'team.manage'));

create policy "role_permissions_select_member" on public.role_permissions
for select to authenticated
using (
  exists (
    select 1 from public.roles r
    where r.id = role_id and private.is_org_member(r.organization_id)
  )
);

create policy "role_permissions_manage_team" on public.role_permissions
for all to authenticated
using (
  exists (
    select 1 from public.roles r
    where r.id = role_id and private.has_permission(r.organization_id, null, 'team.manage')
  )
)
with check (
  exists (
    select 1 from public.roles r
    where r.id = role_id and private.has_permission(r.organization_id, null, 'team.manage')
  )
);

create policy "members_select_self_or_team" on public.organization_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or private.has_permission(organization_id, null, 'team.view')
);

create policy "members_manage_team" on public.organization_members
for all to authenticated
using (private.has_permission(organization_id, null, 'team.manage'))
with check (private.has_permission(organization_id, null, 'team.manage'));

create policy "store_roles_select_self_or_team" on public.user_store_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    private.can_access_store(organization_id, store_id)
    and private.has_permission(organization_id, store_id, 'team.view')
  )
);

create policy "store_roles_manage_team" on public.user_store_roles
for all to authenticated
using (
  private.can_access_store(organization_id, store_id)
  and private.has_permission(organization_id, store_id, 'team.manage')
)
with check (
  private.can_access_store(organization_id, store_id)
  and private.has_permission(organization_id, store_id, 'team.manage')
);

create policy "invitations_select_team" on public.invitations
for select to authenticated
using (private.has_permission(organization_id, null, 'team.view'));

create policy "invitations_manage_team" on public.invitations
for all to authenticated
using (private.has_permission(organization_id, null, 'team.manage'))
with check (private.has_permission(organization_id, null, 'team.manage'));

create policy "audit_select_authorized" on public.audit_logs
for select to authenticated
using (
  (store_id is null and private.has_permission(organization_id, null, 'audit.view'))
  or (
    store_id is not null
    and private.can_access_store(organization_id, store_id)
    and private.has_permission(organization_id, store_id, 'audit.view')
  )
);

-- No authenticated INSERT/UPDATE/DELETE policies for audit_logs, domain_events or
-- idempotency_keys. Trusted server services use the server-only admin client after
-- authenticating and authorizing the actor. This prevents direct browser mutation.
