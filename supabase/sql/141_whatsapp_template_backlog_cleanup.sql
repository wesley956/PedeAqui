-- PedeAqui — remove backlog legado de notificações que falharam apenas
-- porque ainda não havia template utilitário aprovado/configurado.
--
-- A partir do worker atual, template ausente é configuração pendente e a
-- notificação é encerrada como skipped antes de criar outbound. Isso evita
-- que uma atualização antiga seja enviada horas ou dias depois quando um
-- template for finalmente habilitado.

update public.order_whatsapp_notifications
set
  status = 'skipped',
  locked_by = null,
  locked_until = null,
  updated_at = now()
where status = 'failed'
  and last_error_code = 'template_required'
  and sent_at is null;
