-- PedeAqui — o restaurante decide se o entregador pode consultar entregas concluídas.
-- O padrão é privado: novas e atuais unidades só exibem histórico após ativação explícita.

alter table public.store_delivery_settings
  add column if not exists driver_history_visible boolean not null default false;

comment on column public.store_delivery_settings.driver_history_visible is
  'Restaurant-controlled permission for drivers to view their completed delivery history in the driver portal.';
