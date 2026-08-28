-- PedeAqui — índices auxiliares do fallback nativo de alertas.

create index if not exists order_alert_panel_presence_org_store_idx
  on public.order_alert_panel_presence (organization_id, store_id);

create index if not exists order_alert_panel_presence_user_idx
  on public.order_alert_panel_presence (user_id);

create index if not exists order_alert_events_org_store_id_idx
  on public.order_alert_events (organization_id, store_id, id);
