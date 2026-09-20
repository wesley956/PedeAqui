-- PedeAqui FLOW-08 — retomada transacional Robô ↔ Humano ↔ Robô.
-- Usa o mesmo lock de carts adotado por create_order_from_checkout_internal para
-- impedir que a confirmação do pedido e a devolução da conversa ao robô avancem
-- simultaneamente sobre o mesmo carrinho.

create or replace function public.conversation_resume_bot_internal(
  p_organization_id uuid,
  p_store_id uuid,
  p_conversation_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_session public.automation_sessions%rowtype;
  v_cart public.carts%rowtype;
  v_order public.orders%rowtype;
  v_cart_token text;
  v_token_hash text;
  v_reason text;
  v_mode text;
  v_restored_step text;
  v_order_id uuid;
  v_order_steps constant text[] := array[
    'order_items',
    'order_name',
    'order_fulfillment',
    'order_address',
    'order_payment',
    'order_confirmation'
  ];
begin
  if p_organization_id is null or p_store_id is null or p_conversation_id is null then
    raise exception 'invalid conversation resume scope';
  end if;

  select *
    into v_conversation
    from public.conversations
   where id = p_conversation_id
     and organization_id = p_organization_id
     and store_id = p_store_id
   for update;

  if v_conversation.id is null then
    raise exception 'conversation not found';
  end if;
  if v_conversation.status = 'closed' then
    raise exception 'closed conversation cannot resume bot';
  end if;
  if v_conversation.status = 'bot' then
    return jsonb_build_object(
      'mode', 'preserved',
      'reason', 'preserve_non_order_step',
      'restored_step', null,
      'order_id', null
    );
  end if;

  select *
    into v_session
    from public.automation_sessions
   where organization_id = p_organization_id
     and store_id = p_store_id
     and conversation_id = p_conversation_id
   for update;

  if v_session.id is null then
    v_mode := 'recovered';
    v_reason := 'no_session';
    v_restored_step := 'menu';
  elsif v_session.state <> 'active' then
    v_mode := 'recovered';
    v_reason := 'session_inactive';
    v_restored_step := 'menu';
  elsif v_session.expires_at is not null and v_session.expires_at <= now() then
    v_mode := 'recovered';
    v_reason := 'session_expired';
    v_restored_step := 'menu';
  elsif not (v_session.step = any(v_order_steps)) then
    v_mode := 'preserved';
    v_reason := 'preserve_non_order_step';
    v_restored_step := v_session.step;
  else
    if coalesce(v_session.context->>'channel','') <> 'whatsapp_order' then
      v_mode := 'recovered';
      v_reason := 'order_context_missing';
      v_restored_step := 'menu';
    else
      v_cart_token := nullif(trim(v_session.context->>'cartToken'), '');
      if v_cart_token is null then
        v_mode := 'recovered';
        v_reason := 'order_context_missing';
        v_restored_step := 'menu';
      else
        -- cart-token.ts usa SHA-256 hexadecimal. pgcrypto já é usado pelo projeto.
        v_token_hash := encode(extensions.digest(convert_to(v_cart_token, 'UTF8'), 'sha256'), 'hex');

        select *
          into v_cart
          from public.carts
         where organization_id = p_organization_id
           and store_id = p_store_id
           and token_hash = v_token_hash
         for update;

        if v_cart.id is null then
          v_mode := 'recovered';
          v_reason := 'cart_inactive';
          v_restored_step := 'menu';
        else
          -- Executado enquanto o mesmo lock de carts usado pelo checkout está retido.
          select *
            into v_order
            from public.orders
           where organization_id = p_organization_id
             and store_id = p_store_id
             and source_cart_id = v_cart.id
           order by created_at desc, id desc
           limit 1;

          if v_order.id is not null then
            v_mode := 'recovered';
            v_reason := 'cart_already_converted';
            v_restored_step := 'menu';
            v_order_id := v_order.id;
          elsif v_cart.status <> 'active' or v_cart.expires_at <= now() then
            v_mode := 'recovered';
            v_reason := 'cart_inactive';
            v_restored_step := 'menu';
          else
            v_mode := 'preserved';
            v_reason := 'preserve_order_step';
            v_restored_step := v_session.step;
          end if;
        end if;
      end if;
    end if;
  end if;

  perform public.conversation_transition_internal(
    p_conversation_id,
    'bot',
    null,
    case
      when v_mode = 'preserved' then 'Atendimento devolvido ao bot com contexto preservado (' || v_reason || ')'
      else 'Atendimento devolvido ao bot com recuperação segura (' || v_reason || ')'
    end,
    p_actor_user_id,
    'panel'
  );

  if v_mode = 'recovered' then
    perform public.automation_session_upsert_internal(
      p_conversation_id,
      'menu',
      jsonb_build_object(
        'channel', 'whatsapp_menu',
        'version', 4,
        'resume_recovery', jsonb_build_object(
          'reason', v_reason,
          'recovered_at', now()
        ),
        'active_order', case
          when v_order_id is null then 'null'::jsonb
          else jsonb_build_object(
            'order_id', v_order.id,
            'display_number', v_order.display_number,
            'order_status', v_order.order_status,
            'source', 'source_cart_id'
          )
        end
      ),
      null,
      now() + interval '45 minutes'
    );
  end if;

  return jsonb_build_object(
    'mode', v_mode,
    'reason', v_reason,
    'restored_step', v_restored_step,
    'order_id', v_order_id
  );
end;
$$;

revoke all on function public.conversation_resume_bot_internal(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.conversation_resume_bot_internal(uuid,uuid,uuid,uuid)
  to service_role;
