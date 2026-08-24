# Playbook rápido de suporte — WhatsApp

## `connected`
Canal saudável. Conferir última verificação, qualidade, mensagens e automações.

## `temporarily_unavailable`
Falha transitória Meta/rede. Não alterar pedidos. Manter retry controlado e reavaliar saúde.

## `action_required`
A conexão precisa ser reautorizada/reconectada. Histórico e pedidos permanecem. Não forçar envio com credencial inválida.

## `disconnected`
Canal intencionalmente desligado. Histórico permanece, novos avisos ficam suspensos.

## `template_required`
Não é falha do pedido. Significa que o aviso estava fora da janela e não existe modelo Meta aprovado/configurado. O PedeAqui encerra o aviso sem manter backlog.

## Regras de suporte
- Nunca pedir token ao restaurante.
- Nunca editar WABA/Phone Number ID diretamente no banco para “consertar”.
- Nunca ligar número de outra unidade.
- Nunca fazer pedido depender do WhatsApp.
- Reconectar pelo fluxo oficial do painel.
