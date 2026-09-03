-- Stabilization #819: prevent duplicate Windows/system printer rows when the same
-- quick-setup intent is replayed or submitted concurrently.
--
-- Production was checked before introducing this index and had no duplicate
-- (store, agent, system address) tuples. The index is partial so other printer
-- connection models keep their existing semantics.

create unique index if not exists printers_store_agent_system_address_unique
  on public.printers (organization_id, store_id, agent_id, connection_address)
  where connection_type = 'system'
    and agent_id is not null
    and connection_address is not null;
