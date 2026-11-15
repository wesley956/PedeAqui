-- Correções de banco que a homologação local aplica e a produção ainda NÃO tem.
-- Cada item está descrito em docs/ux2/PENDENCIAS-BANCO.md. Aplicar na produção exige aprovação específica.

-- P-01: enviar rodada no Salão (e pedido por QR da mesa) falha com "permission denied for function dining_price_items".
grant execute on function private.dining_price_items(uuid, jsonb) to service_role;
