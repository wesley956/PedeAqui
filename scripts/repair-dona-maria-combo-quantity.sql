-- Data repair for #1210. Not a schema migration and not executed in this session.
-- Run only against the official PedeAqui project after inspecting the returned rows.
-- Existing orders retain their snapshots. This changes one catalog group only.
begin;

select p.id, p.name, p.description, g.id as modifier_group_id,
       g.name as modifier_group_name, g.distribution_total, g.selection_mode
from public.stores s
join public.products p on p.store_id = s.id and p.organization_id = s.organization_id
join public.product_modifier_groups l on l.product_id = p.id and l.store_id = s.id and l.organization_id = s.organization_id
join public.modifier_groups g on g.id = l.modifier_group_id and g.store_id = s.id and g.organization_id = s.organization_id
where s.slug = 'dona-maria-salgados-e-porcoes'
  and p.id = '073c9cab-3b70-4a22-bda7-c50f71fd1a84';

do $$
declare
  target_group public.modifier_groups%rowtype;
  matching_groups integer;
begin
  select count(*) into matching_groups
  from public.modifier_groups g
  join public.product_modifier_groups l on l.modifier_group_id = g.id and l.store_id = g.store_id and l.organization_id = g.organization_id
  join public.products p on p.id = l.product_id and p.store_id = g.store_id and p.organization_id = g.organization_id
  join public.stores s on s.id = g.store_id and s.organization_id = g.organization_id
  where s.slug = 'dona-maria-salgados-e-porcoes'
    and p.id = '073c9cab-3b70-4a22-bda7-c50f71fd1a84'
    and p.deleted_at is null and g.deleted_at is null
    and g.selection_mode = 'equal_split_options' and g.distribution_total in (12, 13);
  if matching_groups <> 1 then
    raise exception 'Expected one matching combo group; inspect catalog before repairing';
  end if;

  select g.* into strict target_group
  from public.modifier_groups g
  join public.product_modifier_groups l on l.modifier_group_id = g.id and l.store_id = g.store_id and l.organization_id = g.organization_id
  join public.products p on p.id = l.product_id and p.store_id = g.store_id and p.organization_id = g.organization_id
  join public.stores s on s.id = g.store_id and s.organization_id = g.organization_id
  where s.slug = 'dona-maria-salgados-e-porcoes'
    and p.id = '073c9cab-3b70-4a22-bda7-c50f71fd1a84'
    and p.deleted_at is null and g.deleted_at is null
    and g.selection_mode = 'equal_split_options' and g.distribution_total in (12, 13)
  for update of g;

  if exists (
    select 1 from public.product_modifier_groups l
    where l.modifier_group_id = target_group.id
      and l.product_id <> '073c9cab-3b70-4a22-bda7-c50f71fd1a84'
  ) then
    raise exception 'Group is shared: inspect every linked product before changing its quantity';
  end if;

  update public.modifier_groups set distribution_total = 12, updated_at = now()
  where id = target_group.id and store_id = target_group.store_id
    and organization_id = target_group.organization_id and distribution_total = 13;
end $$;

-- Explicitly inspect this result before commit. Run with ON_ERROR_STOP.
select g.id, g.distribution_total
from public.modifier_groups g
join public.product_modifier_groups l on l.modifier_group_id = g.id and l.store_id = g.store_id and l.organization_id = g.organization_id
join public.stores s on s.id = g.store_id and s.organization_id = g.organization_id
where s.slug = 'dona-maria-salgados-e-porcoes'
  and l.product_id = '073c9cab-3b70-4a22-bda7-c50f71fd1a84';

-- Intentionally leave the transaction open for inspection; COMMIT only after
-- verifying 12 and recording the repair in #1210. Otherwise ROLLBACK.
