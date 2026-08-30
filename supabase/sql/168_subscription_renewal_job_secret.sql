-- PedeAqui — segredo interno do job de renovação de assinaturas.
-- Cria uma chave aleatória no Vault sem expor seu valor no Git ou no painel.
-- A contraparte CRON_SECRET da Vercel será configurada somente no go-live final.

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name='pedeaqui_internal_subscription_renewals_token'
      and decrypted_secret is not null
      and length(decrypted_secret)=64
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32),'hex'),
      'pedeaqui_internal_subscription_renewals_token',
      'Token server-only usado para autenticar o job diário de renovação das assinaturas PedeAqui.',
      null
    );
  end if;
end $$;
