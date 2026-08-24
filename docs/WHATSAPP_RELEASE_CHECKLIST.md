# Checklist de liberação — WhatsApp PedeAqui

## Engenharia — obrigatório antes do merge
- [x] Um único webhook roteia por `metadata.phone_number_id`.
- [x] `phone_number_id` é único entre unidades.
- [x] Embedded Signup correlaciona organização, unidade e usuário server-side.
- [x] Estado anti-CSRF é persistido apenas como hash e expira.
- [x] Fluxo dedicado (`cloud_api`) continua suportado.
- [x] Fluxo de coexistência (`coexistence`) possui caminho separado sem repetir `/register`.
- [x] WABA e Phone Number ID são validados server-side.
- [x] Health check ocorre antes de marcar `connected`.
- [x] Canal conectado antigo é revalidado e possui estados recuperáveis.
- [x] Reconexão preserva o modo da conexão.
- [x] Desconexão preserva histórico e suspende novas automações.
- [x] WhatsApp indisponível nunca altera/derruba pedido.
- [x] Falta de template fora da janela não cria backlog futuro.
- [x] Backlog legado `template_required` foi encerrado com segurança.
- [x] Nenhum segredo Meta novo é exposto via `NEXT_PUBLIC_*`.
- [x] Fluxo oficial e gates externos estão documentados.

## Meta / infraestrutura — gate externo
- [ ] App Meta do PedeAqui possui acesso necessário para clientes externos.
- [ ] Configuração de Embedded Signup padrão validada em produção.
- [ ] Configuração de coexistência validada/ativada na Meta.
- [ ] Webhook do app Meta assina/entrega todos os campos exigidos pelo modo liberado.
- [ ] Variáveis de produção do Vercel conferidas no projeto correto.
- [ ] Modelo de cobrança da mensageria definido.
- [ ] Template utilitário aprovado e nome configurado quando avisos fora da janela forem desejados.

## Homologação real — gate para fechar #445
- [ ] Segundo restaurante inicia pelo botão do PedeAqui.
- [ ] Nenhum token/WABA/Phone Number ID é colado manualmente.
- [ ] Login/autorização Meta conclui.
- [ ] Health termina verde.
- [ ] Mensagem inbound chega à unidade correta.
- [ ] Saudação aponta para o cardápio correto.
- [ ] Resposta humana sai pelo número correto.
- [ ] Pedido dinheiro/cartão funciona sem PIX.
- [ ] Atualização de pedido elegível chega uma única vez.
- [ ] Reconexão preserva histórico.
- [ ] Desconexão suspende novas mensagens.
- [ ] Tenant A e tenant B não cruzam canal, conversa ou notificação.
