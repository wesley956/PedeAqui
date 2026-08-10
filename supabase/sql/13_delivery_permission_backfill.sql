-- Existing organizations created before delivery permissions were introduced
-- must receive the same default grants as future bootstrap organizations.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('delivery.view', 'delivery.manage')
where r.key in ('owner', 'manager')
on conflict (role_id, permission_id) do nothing;
