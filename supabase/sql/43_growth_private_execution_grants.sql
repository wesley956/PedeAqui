-- PedeAqui — Growth hardening.
-- SECURITY INVOKER public RPCs execute these private helpers as service_role.
-- Browser roles remain unable to use the private schema or execute helpers.

grant usage on schema private to service_role;

grant execute on function private.post_cashback_transaction(uuid,uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb,uuid) to service_role;
grant execute on function private.post_loyalty_transaction(uuid,uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb,uuid) to service_role;
grant execute on function private.resolve_growth_benefits(uuid,uuid,uuid,text,bigint,uuid,text,bigint,bigint) to service_role;
grant execute on function private.segment_rule_matches(jsonb,bigint,bigint,bigint,timestamptz,bigint,bigint) to service_role;
grant execute on function private.execute_growth_automation(public.automation_rules,public.customers,public.orders,text,uuid) to service_role;

revoke usage on schema private from anon;
revoke execute on function private.post_cashback_transaction(uuid,uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb,uuid) from anon,authenticated;
revoke execute on function private.post_loyalty_transaction(uuid,uuid,uuid,uuid,text,bigint,text,timestamptz,jsonb,uuid) from anon,authenticated;
revoke execute on function private.resolve_growth_benefits(uuid,uuid,uuid,text,bigint,uuid,text,bigint,bigint) from anon,authenticated;
revoke execute on function private.segment_rule_matches(jsonb,bigint,bigint,bigint,timestamptz,bigint,bigint) from anon,authenticated;
revoke execute on function private.execute_growth_automation(public.automation_rules,public.customers,public.orders,text,uuid) from anon,authenticated;
