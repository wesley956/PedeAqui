-- #1125 — remove the legacy duplicate constraint that still evaluates the invalid large regex quantifier.
-- The corrected constraint from 20260922223000 remains authoritative for the same 1–512 / [a-z0-9_] contract.

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_order_template_name_check;
