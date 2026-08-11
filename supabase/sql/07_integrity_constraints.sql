-- Composite constraints prevent accidental cross-tenant role/store references even
-- in privileged server code.

alter table public.roles
  add constraint roles_organization_id_id_unique unique (organization_id, id);

alter table public.stores
  add constraint stores_organization_id_id_unique unique (organization_id, id);

alter table public.organization_members
  add constraint organization_members_role_same_org_fk
  foreign key (organization_id, role_id)
  references public.roles (organization_id, id)
  on delete restrict;

alter table public.user_store_roles
  add constraint user_store_roles_store_same_org_fk
  foreign key (organization_id, store_id)
  references public.stores (organization_id, id)
  on delete cascade;

alter table public.user_store_roles
  add constraint user_store_roles_role_same_org_fk
  foreign key (organization_id, role_id)
  references public.roles (organization_id, id)
  on delete cascade;
