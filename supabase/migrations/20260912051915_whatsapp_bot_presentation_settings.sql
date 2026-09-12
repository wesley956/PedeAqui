-- PedeAqui #1016 — apresentação configurável do robô por unidade.

alter table public.store_conversation_settings
  add column if not exists bot_menu_mode text,
  add column if not exists bot_display_name text,
  add column if not exists handoff_message text not null
    default 'Certo! Encaminhei sua conversa para a equipe do restaurante. Assim que alguém estiver disponível, continuará o atendimento por aqui.',
  add column if not exists unknown_intent_message text not null
    default 'Não consegui entender desta vez. Você pode escrever de outro jeito ou digitar menu para ver as opções.';

-- Lojas existentes mantêm o comportamento anterior. Novas configurações começam
-- no modo recomendado, com conversa limpa e menu sob demanda.
update public.store_conversation_settings
set bot_menu_mode = 'menu_first'
where bot_menu_mode is null;

alter table public.store_conversation_settings
  alter column bot_menu_mode set default 'conversation_first',
  alter column bot_menu_mode set not null,
  alter column greeting_template set default 'Oi! 😊 Estou por aqui para ajudar com {restaurante}. Pode escrever normalmente o que você precisa.';

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_bot_menu_mode_check,
  add constraint store_conversation_settings_bot_menu_mode_check
    check (bot_menu_mode in ('conversation_first', 'menu_first', 'interactive')),
  drop constraint if exists store_conversation_settings_bot_display_name_check,
  add constraint store_conversation_settings_bot_display_name_check
    check (
      bot_display_name is null
      or (
        char_length(trim(bot_display_name)) between 2 and 60
        and bot_display_name !~* '(https?://|www\.)'
        and bot_display_name !~ '\{[^}]+\}'
      )
    ),
  drop constraint if exists store_conversation_settings_handoff_message_check,
  add constraint store_conversation_settings_handoff_message_check
    check (
      char_length(trim(handoff_message)) between 10 and 800
      and handoff_message !~* '(https?://|www\.)'
      and handoff_message !~ '\{[^}]+\}'
    ),
  drop constraint if exists store_conversation_settings_unknown_intent_message_check,
  add constraint store_conversation_settings_unknown_intent_message_check
    check (
      char_length(trim(unknown_intent_message)) between 10 and 800
      and unknown_intent_message !~* '(https?://|www\.)'
      and unknown_intent_message !~ '\{[^}]+\}'
    );

alter table public.store_conversation_settings
  drop constraint if exists store_conversation_settings_greeting_template_check;

alter table public.store_conversation_settings
  add constraint store_conversation_settings_greeting_template_check check (
    char_length(trim(greeting_template)) between 20 and 1000
    and greeting_template !~* '(https?://|www\.)'
    and regexp_replace(
      regexp_replace(greeting_template, '\{restaurante\}', '', 'gi'),
      '\{link\}', '', 'gi'
    ) !~ '\{[^}]+\}'
    and (bot_menu_mode <> 'menu_first' or position('{link}' in greeting_template) > 0)
  );

comment on column public.store_conversation_settings.bot_menu_mode is
  'Como a saudação apresenta opções: conversation_first, menu_first ou interactive.';
comment on column public.store_conversation_settings.bot_display_name is
  'Nome opcional do atendimento virtual exibido ao cliente.';
comment on column public.store_conversation_settings.handoff_message is
  'Texto enviado quando o cliente solicita atendimento humano.';
comment on column public.store_conversation_settings.unknown_intent_message is
  'Texto enviado antes do menu quando a intenção não é reconhecida.';
