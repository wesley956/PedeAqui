-- PedeAqui OMNI #938 — iFood auth/Vault isolation, replay protection and refresh single-flight.
begin;

insert into auth.users (id,email)
values ('f9380000-0000-4000-8000-000000000001','quality-ifood-auth@example.invalid');
insert into public.organizations (id,name,created_by)
values ('f9380000-0000-4000-8000-000000000011','Quality iFood Auth Org','f9380000-0000-4000-8000-000000000001');
insert into public.stores (id,organization_id,name,slug,status)
values ('f9380000-0000-4000-8000-000000000021','f9380000-0000-4000-8000-000000000011','Quality iFood Store','quality-ifood-auth','active');

select vault.create_secret(
  '{"clientId":"client-quality-938","clientSecret":"secret-quality-938","authMode":"distributed"}',
  'pedeaqui_ifood_app_sandbox',
  'quality fixture rolled back'
);

insert into public.integration_accounts (
  id,organization_id,provider,status,environment,auth_mode,connection_state,metadata
) values (
  'f9380000-0000-4000-8000-000000000031','f9380000-0000-4000-8000-000000000011','ifood',
  'disconnected','sandbox','distributed','starting','{}'::jsonb
);

-- Sandbox and production are distinct provider connections.
insert into public.integration_accounts (
  id,organization_id,provider,status,environment,auth_mode,connection_state,metadata
) values (
  'f9380000-0000-4000-8000-000000000032','f9380000-0000-4000-8000-000000000011','ifood',
  'disconnected','production','centralized','starting','{}'::jsonb
);

do $$
declare
  v_app jsonb;
  v_token jsonb;
  v_reference text;
  v_session uuid;
  v_consumed jsonb;
  v_verifier_reference text;
  v_ok boolean;
begin
  v_app := public.integration_ifood_app_credentials('sandbox');
  if v_app->>'clientId' <> 'client-quality-938' or v_app->>'authMode' <> 'distributed' then
    raise exception 'iFood application Vault lookup failed';
  end if;

  v_reference := public.integration_secret_upsert(
    'f9380000-0000-4000-8000-000000000011',
    'f9380000-0000-4000-8000-000000000031',
    '{"accessToken":"access-quality-secret","tokenType":"bearer","expiresAt":"2026-09-08T00:00:00.000Z","refreshToken":"refresh-quality-secret"}'::jsonb,
    'quality token bundle'
  );
  if v_reference is null then raise exception 'token Vault reference was not created'; end if;
  if (select secret_reference from public.integration_accounts where id='f9380000-0000-4000-8000-000000000031') <> v_reference then
    raise exception 'opaque token reference was not persisted on integration account';
  end if;
  if (select metadata::text from public.integration_accounts where id='f9380000-0000-4000-8000-000000000031') like '%access-quality-secret%' then
    raise exception 'plaintext access token leaked into integration account metadata';
  end if;

  v_token := public.integration_secret_read('f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000031');
  if v_token->>'accessToken' <> 'access-quality-secret' or v_token->>'refreshToken' <> 'refresh-quality-secret' then
    raise exception 'token Vault round-trip failed';
  end if;

  v_session := public.integration_authorization_session_create(
    'f9380000-0000-4000-8000-000000000011',
    'f9380000-0000-4000-8000-000000000021',
    'f9380000-0000-4000-8000-000000000031',
    'sandbox',repeat('a',64),
    '{"authorizationCodeVerifier":"verifier-quality-secret"}'::jsonb,
    now()+interval '10 minutes','quality-corr-938'
  );
  select verifier_secret_reference into v_verifier_reference
  from public.integration_authorization_sessions where id=v_session;
  if v_verifier_reference is null then raise exception 'authorization verifier did not enter Vault'; end if;

  v_consumed := public.integration_authorization_session_consume(
    'f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000021',
    'f9380000-0000-4000-8000-000000000031',v_session,repeat('b',64)
  );
  if v_consumed->>'error' <> 'invalid_state' then raise exception 'invalid state was not rejected'; end if;
  if (select status from public.integration_authorization_sessions where id=v_session) <> 'awaiting_authorization' then
    raise exception 'invalid state consumed authorization session';
  end if;

  v_consumed := public.integration_authorization_session_consume(
    'f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000021',
    'f9380000-0000-4000-8000-000000000031',v_session,repeat('a',64)
  );
  if coalesce((v_consumed->>'ok')::boolean,false) is not true or v_consumed#>>'{verifier,authorizationCodeVerifier}' <> 'verifier-quality-secret' then
    raise exception 'valid authorization session was not consumed correctly';
  end if;

  v_consumed := public.integration_authorization_session_consume(
    'f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000021',
    'f9380000-0000-4000-8000-000000000031',v_session,repeat('a',64)
  );
  if v_consumed->>'error' <> 'replay' then raise exception 'authorization replay was not rejected'; end if;

  v_ok := public.integration_authorization_session_finish(
    'f9380000-0000-4000-8000-000000000011',v_session,'completed',null
  );
  if not v_ok then raise exception 'authorization session did not finish'; end if;
  if exists (select 1 from vault.secrets where id=v_verifier_reference::uuid) then
    raise exception 'ephemeral authorization verifier remained in Vault after completion';
  end if;

  v_ok := public.integration_acquire_refresh_lease(
    'f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000031','worker-a',60
  );
  if not v_ok then raise exception 'first refresh worker did not acquire lease'; end if;
  v_ok := public.integration_acquire_refresh_lease(
    'f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000031','worker-b',60
  );
  if v_ok then raise exception 'second refresh worker acquired an active lease'; end if;
  v_ok := public.integration_release_refresh_lease(
    'f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000031','worker-a'
  );
  if not v_ok then raise exception 'refresh lease was not released by owner'; end if;
  v_ok := public.integration_acquire_refresh_lease(
    'f9380000-0000-4000-8000-000000000011','f9380000-0000-4000-8000-000000000031','worker-b',60
  );
  if not v_ok then raise exception 'next refresh worker could not acquire released lease'; end if;
end $$;

insert into public.integration_merchants (
  id,organization_id,store_id,integration_account_id,provider,environment,external_merchant_id,display_name
) values (
  'f9380000-0000-4000-8000-000000000041','f9380000-0000-4000-8000-000000000011',
  'f9380000-0000-4000-8000-000000000021','f9380000-0000-4000-8000-000000000031',
  'ifood','sandbox','merchant-quality-938','Quality Merchant'
);

do $$
declare
  v_caps jsonb;
begin
  select capabilities into v_caps from public.integration_merchants where id='f9380000-0000-4000-8000-000000000041';
  if coalesce((v_caps->>'ifood_orders')::boolean,false)
     or coalesce((v_caps->>'ifood_catalog')::boolean,false)
     or coalesce((v_caps->>'ifood_shipping')::boolean,false) then
    raise exception 'auth/binding implicitly enabled iFood capability';
  end if;

  if has_function_privilege('authenticated','public.integration_secret_read(uuid,uuid)','execute') then
    raise exception 'authenticated browser role can execute Vault read helper';
  end if;
  if has_function_privilege('anon','public.integration_authorization_session_consume(uuid,uuid,uuid,uuid,text)','execute') then
    raise exception 'anon role can execute authorization consume helper';
  end if;
end $$;

rollback;
