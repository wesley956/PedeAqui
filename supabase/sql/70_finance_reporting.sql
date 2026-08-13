-- PedeAqui — Milestone 21 [211]–[224]
-- Relatório agregado service-role-only: DRE por competência e fluxo por liquidação/conta.

create or replace function public.financial_report_internal(
  p_store_id uuid,p_from date,p_to date
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_store public.stores%rowtype; v_today date; v_accounts jsonb; v_obligations jsonb; v_dre jsonb; v_cashflow jsonb;
begin
  select * into v_store from public.stores where id=p_store_id and status='active';
  if v_store.id is null then raise exception 'store unavailable'; end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'invalid financial report period'; end if;
  if p_to-p_from>400 then raise exception 'financial report period too large'; end if;
  v_today:=(now() at time zone coalesce(v_store.timezone,'America/Sao_Paulo'))::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'name',a.name,'account_type',a.account_type,'system_key',a.system_key,'balance_cents',coalesce(b.balance_cents,0)
  ) order by a.name),'[]'::jsonb)
  into v_accounts
  from public.financial_accounts a
  left join public.financial_account_balances b on b.organization_id=a.organization_id and b.account_id=a.id
  where a.organization_id=v_store.organization_id and a.store_id=v_store.id and a.active=true and a.deleted_at is null;

  select jsonb_build_object(
    'receivable_open_cents',coalesce(sum(open_cents) filter(where direction='in' and status in ('open','partially_settled')),0),
    'payable_open_cents',coalesce(sum(open_cents) filter(where direction='out' and status in ('open','partially_settled')),0),
    'receivable_overdue_cents',coalesce(sum(open_cents) filter(where direction='in' and status in ('open','partially_settled') and due_date<v_today),0),
    'payable_overdue_cents',coalesce(sum(open_cents) filter(where direction='out' and status in ('open','partially_settled') and due_date<v_today),0),
    'open_count',count(*) filter(where status in ('open','partially_settled'))
  ) into v_obligations
  from public.financial_obligations
  where organization_id=v_store.organization_id and store_id=v_store.id and status<>'cancelled';

  with grouped as (
    select c.dre_group,
      coalesce(sum(case when c.nature='revenue' then t.effect_sign*t.amount_cents else -t.effect_sign*t.amount_cents end),0)::bigint as total
    from public.financial_transactions t
    join public.financial_categories c on c.id=t.category_id and c.organization_id=t.organization_id
    where t.organization_id=v_store.organization_id and t.store_id=v_store.id
      and t.competence_date between p_from and p_to
      and t.transaction_type in ('recognition','obligation_adjustment')
    group by c.dre_group
  ), totals as (
    select
      coalesce(sum(total) filter(where dre_group='gross_revenue'),0)::bigint as gross_revenue,
      coalesce(sum(total) filter(where dre_group='deductions'),0)::bigint as deductions,
      coalesce(sum(total) filter(where dre_group='delivery_revenue'),0)::bigint as delivery_revenue,
      coalesce(sum(total) filter(where dre_group='cogs'),0)::bigint as cogs,
      coalesce(sum(total) filter(where dre_group='operating_expense'),0)::bigint as operating_expense,
      coalesce(sum(total) filter(where dre_group='other_revenue'),0)::bigint as other_revenue,
      coalesce(sum(total) filter(where dre_group='other_expense'),0)::bigint as other_expense,
      coalesce(sum(total),0)::bigint as net_result
    from grouped
  )
  select to_jsonb(totals) into v_dre from totals;

  with movements as (
    select (t.occurred_at at time zone coalesce(v_store.timezone,'America/Sao_Paulo'))::date as day,
      case when t.direction='in' then t.effect_sign*t.amount_cents else -t.effect_sign*t.amount_cents end as signed_amount
    from public.financial_transactions t
    where t.organization_id=v_store.organization_id and t.store_id=v_store.id and t.account_id is not null
      and (t.occurred_at at time zone coalesce(v_store.timezone,'America/Sao_Paulo'))::date between p_from and p_to
      and t.transaction_type in ('settlement','settlement_reversal','transfer','manual_adjustment')
  ), daily as (
    select day,sum(signed_amount)::bigint as total from movements group by day order by day
  )
  select jsonb_build_object(
    'net_realized_cents',coalesce((select sum(signed_amount) from movements),0),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('day',day,'net_cents',total) order by day) from daily),'[]'::jsonb)
  ) into v_cashflow;

  return jsonb_build_object(
    'period',jsonb_build_object('from',p_from,'to',p_to,'today',v_today,'timezone',v_store.timezone),
    'accounts',v_accounts,
    'obligations',v_obligations,
    'dre',v_dre,
    'cashflow',v_cashflow
  );
end; $$;
revoke all on function public.financial_report_internal(uuid,date,date) from public,anon,authenticated;
grant execute on function public.financial_report_internal(uuid,date,date) to service_role;
