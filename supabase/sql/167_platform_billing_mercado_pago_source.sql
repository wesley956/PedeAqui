-- PedeAqui — fonte Mercado Pago da cobrança SaaS
-- Reutiliza a autorização OAuth saudável do super-admin proprietário sem copiar segredos.
-- A cobrança automática permanece desligada até ativação explícita no go-live.

insert into public.platform_settings(key,category,description,value,active,updated_by)
values(
  'billing.mercado_pago.source',
  'billing',
  'Fonte OAuth do Mercado Pago usada exclusivamente para cobrar assinaturas do PedeAqui.',
  jsonb_build_object('enabled',false),
  true,
  null
)
on conflict(key) do nothing;

do $$
declare
  v_actor uuid;
  v_store_id uuid;
  v_organization_id uuid;
  v_provider_account_id text;
begin
  select u.id into v_actor
  from auth.users u
  join public.platform_admins pa on pa.user_id=u.id and pa.active=true and pa.role='super_admin'
  where lower(u.email)=lower('aweservicosaw@gmail.com')
  order by pa.created_at
  limit 1;

  if v_actor is null then return; end if;

  select c.store_id,c.organization_id,c.provider_account_id
  into v_store_id,v_organization_id,v_provider_account_id
  from public.order_payment_provider_configs c
  join public.organization_members m
    on m.organization_id=c.organization_id
   and m.user_id=v_actor
   and m.status='active'
  where c.provider='mercado_pago'
    and c.environment='production'
    and c.enabled=true
    and c.connection_mode='oauth'
    and c.revoked_at is null
    and c.access_token_secret_id is not null
    and c.refresh_token_secret_id is not null
    and c.webhook_secret_id is not null
  order by c.authorized_at desc nulls last,c.updated_at desc
  limit 1;

  if v_store_id is null then return; end if;

  update public.platform_settings
  set value=jsonb_build_object(
        'enabled',false,
        'source_store_id',v_store_id,
        'source_organization_id',v_organization_id,
        'provider_account_id',v_provider_account_id,
        'connection_mode','oauth',
        'environment','production',
        'source_owner_email','aweservicosaw@gmail.com'
      ),
      active=true,
      updated_by=v_actor,
      updated_at=now()
  where key='billing.mercado_pago.source';

  insert into public.platform_global_audit(
    actor_user_id,action,entity_type,entity_id,organization_id,before_data,after_data,reason,protocol
  ) values(
    v_actor,
    'platform.billing.mercado_pago_source_configured',
    'platform_setting',
    null,
    v_organization_id,
    null,
    jsonb_build_object(
      'setting_key','billing.mercado_pago.source',
      'source_store_id',v_store_id,
      'provider_account_id',v_provider_account_id,
      'enabled',false
    ),
    'Conta Mercado Pago OAuth do proprietário definida como fonte da cobrança de assinaturas.',
    'PA-BILLING-MP-SOURCE-V1'
  );
end $$;
