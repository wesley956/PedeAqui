# Matriz mínima de regressão — WhatsApp

| Cenário | Esperado |
|---|---|
| Canal atual antes da migration | permanece `cloud_api` e conectado |
| Embedded Signup cloud_api | valida WABA/phone, registra, health, connected |
| Embedded Signup coexistence | valida WABA/phone, não repete register, health, connected |
| Meta retorna somente WABA | backend resolve phone quando houver exatamente um |
| WABA sem telefone | falha recuperável, não conecta |
| WABA com múltiplos telefones sem seleção | falha segura, não escolhe silenciosamente |
| Phone fornecido não pertence à WABA | bloqueia |
| Phone já ligado a outra unidade | bloqueia |
| Callback com mode diferente da sessão | bloqueia |
| Sessão expirada | bloqueia e permite reiniciar |
| State inválido | bloqueia |
| Meta temporariamente indisponível | `temporarily_unavailable` |
| Credencial/permissão inválida | `action_required` |
| WhatsApp action_required durante pedido | pedido continua; aviso não é enviado |
| WhatsApp temporarily_unavailable | pedido continua; retry controlado do aviso |
| Template ausente fora da janela | aviso skipped, sem outbound/backlog |
| Template ausente dentro da janela | texto livre pode seguir quando permitido |
| Módulo Conversas OFF | aviso suspenso, pedido continua |
| Delivery OFF | automações de delivery não enviam |
| Produção OFF | automações dependentes não enviam |
| Dinheiro/cartão, PIX OFF | fluxo de pedido/WhatsApp não exige PIX |
| Reconectar | preserva modo e histórico |
| Desconectar | suspende canal, preserva histórico |
| Tenant A/B | Phone Number ID, conversa e outbound nunca cruzam |
