alter table public.store_operational_settings
  add column if not exists payment_completion_policy text null;

alter table public.store_operational_settings
  drop constraint if exists store_operational_settings_payment_completion_policy_check;
alter table public.store_operational_settings
  add constraint store_operational_settings_payment_completion_policy_check
  check (payment_completion_policy is null or payment_completion_policy in ('strict','flexible','quick_confirmation'));

comment on column public.store_operational_settings.payment_completion_policy is
  'Opt-in order completion policy. NULL preserves the legacy behavior.';
