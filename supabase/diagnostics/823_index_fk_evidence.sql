-- Read-only performance evidence for stabilization #823.
-- Run before/after the stabilization migration in staging/production.
-- Returns only schema/object names and aggregate planner/statistics metadata; no customer rows or PII.

-- 1) Index inventory and usage for the priority operational tables.
select
  schemaname,
  relname as table_name,
  indexrelname as index_name,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
from pg_stat_user_indexes
where schemaname = 'public'
  and relname in (
    'orders', 'order_items', 'order_status_history', 'deliveries', 'drivers',
    'print_jobs', 'products', 'categories'
  )
order by relname, indexrelname;

-- 2) Exact duplicate-index candidates. Same table, same key/expression/predicate definition.
with index_defs as (
  select
    i.indrelid,
    n.nspname as schema_name,
    c.relname as table_name,
    ic.relname as index_name,
    pg_get_indexdef(i.indexrelid) as index_definition,
    regexp_replace(
      pg_get_indexdef(i.indexrelid),
      '^CREATE (UNIQUE )?INDEX [^ ]+ ON ',
      'CREATE INDEX ON '
    ) as normalized_definition,
    i.indisunique,
    i.indisprimary
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_class ic on ic.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
)
select
  a.table_name,
  a.index_name as index_a,
  b.index_name as index_b,
  a.index_definition
from index_defs a
join index_defs b
  on b.indrelid = a.indrelid
 and b.index_name > a.index_name
 and b.normalized_definition = a.normalized_definition
where not a.indisprimary
  and not b.indisprimary
order by a.table_name, a.index_name, b.index_name;

-- 3) Foreign keys without a usable leading-column index, classified by estimated table size.
with foreign_keys as (
  select
    con.oid as constraint_oid,
    n.nspname as schema_name,
    rel.relname as table_name,
    con.conname as constraint_name,
    con.conkey as key_columns,
    rel.reltuples::bigint as estimated_rows,
    pg_total_relation_size(rel.oid) as table_bytes
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where con.contype = 'f'
    and n.nspname = 'public'
), indexed as (
  select
    fk.*,
    exists (
      select 1
      from pg_index idx
      where idx.indrelid = (quote_ident(fk.schema_name) || '.' || quote_ident(fk.table_name))::regclass
        and idx.indisvalid
        and idx.indisready
        and (idx.indkey::smallint[])[0:cardinality(fk.key_columns)-1] = fk.key_columns
    ) as has_leading_index
  from foreign_keys fk
)
select
  table_name,
  constraint_name,
  greatest(estimated_rows, 0) as estimated_rows,
  pg_size_pretty(table_bytes) as table_size,
  case
    when estimated_rows >= 100000 then 'high-volume'
    when estimated_rows >= 10000 then 'medium-volume'
    else 'low-volume'
  end as volume_class,
  has_leading_index
from indexed
where not has_leading_index
order by estimated_rows desc, table_name, constraint_name;

-- 4) Priority-table sequential/index scan ratio. Use this together with EXPLAIN on concrete slow queries;
-- do not create/drop an index solely because idx_scan is zero.
select
  relname as table_name,
  seq_scan,
  idx_scan,
  n_live_tup,
  n_dead_tup,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
where schemaname = 'public'
  and relname in (
    'orders', 'order_items', 'order_status_history', 'deliveries', 'drivers',
    'print_jobs', 'products', 'categories'
  )
order by relname;
