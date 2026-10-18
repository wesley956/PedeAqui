-- Menu lateral personalizável: itens que cada usuário fixa no grupo "Principal", na ordem escolhida.
-- Null = usa o padrão da função (dono, caixa, garçom...). A preferência é por usuário e por unidade,
-- já protegida pelas policies "own" de user_store_preferences.
alter table public.user_store_preferences
  add column if not exists navigation_pins text[];

alter table public.user_store_preferences
  drop constraint if exists user_store_preferences_navigation_pins_check;
alter table public.user_store_preferences
  add constraint user_store_preferences_navigation_pins_check
  check (navigation_pins is null or (cardinality(navigation_pins) <= 12 and array_position(navigation_pins, null) is null));
