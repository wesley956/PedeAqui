-- PedeAqui — Milestone 16 [152]–[163]
-- Vincula contato de conversa ao CRM quando o telefone normalizado identifica um único cliente da organização.

create or replace function private.link_contact_customer_by_phone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id uuid;
begin
  if new.customer_id is not null or new.phone_normalized is null then
    return new;
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.organization_id = new.organization_id
    and c.phone_normalized = new.phone_normalized
    and c.deleted_at is null
  limit 1;

  if v_customer_id is not null then
    new.customer_id := v_customer_id;
  end if;
  return new;
end;
$$;

revoke all on function private.link_contact_customer_by_phone() from public, anon, authenticated;
drop trigger if exists contacts_link_customer_by_phone on public.contacts;
create trigger contacts_link_customer_by_phone
before insert or update of phone_normalized on public.contacts
for each row execute function private.link_contact_customer_by_phone();
