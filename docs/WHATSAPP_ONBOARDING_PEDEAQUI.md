# Fluxo oficial de WhatsApp do PedeAqui

## Objetivo

O WhatsApp é um canal opcional de entrada, atendimento e atualização. O pedido continua sendo criado e operado 100% no PedeAqui.

Arquitetura alvo:

`1 app Meta oficial do PedeAqui + 1 webhook + N organizações/unidades + 1 canal WhatsApp por unidade`.

O restaurante não recebe nem informa App Secret, token, WABA ID, Phone Number ID, Graph Explorer ou configuração de webhook.

## Jornada do restaurante

1. Criar conta, organização e unidade.
2. Configurar dados mínimos da operação, cardápio, horários, entrega/retirada e pagamentos.
3. WhatsApp pode ser configurado agora ou depois; ausência do canal nunca bloqueia a operação.
4. Em `Configurações > Conversas e WhatsApp`, escolher um modo:
   - **Continuar usando no celular (`coexistence`)**: para número que já usa WhatsApp Business e deve continuar disponível no aplicativo.
   - **Usar número dedicado (`cloud_api`)**: para número dedicado à Cloud API do PedeAqui.
5. Abrir o Embedded Signup oficial da Meta.
6. O proprietário autentica e autoriza os ativos próprios.
7. O PedeAqui correlaciona a sessão com `organization_id`, `store_id` e usuário autenticado.
8. O backend troca o código de autorização server-side.
9. O backend valida a WABA e resolve/valida o Phone Number ID diretamente na Meta.
10. O backend impede reutilização do mesmo Phone Number ID em outra unidade.
11. O System User do PedeAqui recebe somente as tarefas necessárias.
12. O app PedeAqui é inscrito na WABA (`subscribed_apps`).
13. No modo `cloud_api`, o telefone é registrado e o PIN fica em armazenamento protegido; no modo `coexistence`, o PedeAqui não repete o registro de um número mantido pelo WhatsApp Business App.
14. É executado health check real do Phone Number ID.
15. Somente depois do health o canal recebe estado `connected`.

## Máquina de estados

```text
not_connected
  -> awaiting_meta
  -> authorizing
  -> configuring_assets
  -> subscribing_webhooks
  -> registering_phone       (somente cloud_api)
  -> health_checking
  -> connected

Falhas recuperáveis:
connected -> temporarily_unavailable -> connected
connected -> action_required -> reconectar -> connected
qualquer onboarding incompleto -> failed/action_required -> tentar novamente
connected -> disconnected
```

Regras:
- nenhuma falha de WhatsApp altera pedido, pagamento, produção ou entrega;
- reconectar preserva histórico;
- desconectar preserva histórico;
- refresh/callback repetido não cria um segundo canal;
- modo de conexão pertence à sessão server-side e não pode ser trocado no callback;
- WABA/Phone Number ID são validados contra a Meta antes de persistir.

## Fluxo inbound

```text
Cliente -> WhatsApp do restaurante
        -> Meta
        -> webhook único PedeAqui
        -> valida assinatura
        -> metadata.phone_number_id
        -> resolve unidade/organização
        -> conversa correta
        -> saudação elegível + link do cardápio
```

O roteamento nunca usa nome do restaurante ou telefone textual como autoridade de tenant.

## Pedido e atualizações

```text
WhatsApp -> link do cardápio
         -> cardápio PedeAqui
         -> carrinho
         -> checkout
         -> pagamento habilitado na unidade
         -> pedido PedeAqui
         -> eventos autoritativos
         -> automações elegíveis
         -> WhatsApp
```

- PIX não é dependência do WhatsApp.
- Dinheiro e cartão presencial são suficientes para o fluxo comercial do primeiro cliente.
- Automações dependentes de Produção/Entregas são suspensas quando o módulo correspondente não estiver disponível.
- O WhatsApp nunca cria nem antecipa estado do pedido.

## Janela de atendimento e templates

- Dentro da janela de atendimento aberta por mensagem inbound do cliente, o PedeAqui pode usar texto livre quando permitido pela Meta.
- Fora dessa janela, o PedeAqui usa somente template utilitário aprovado e configurado.
- Se não houver template aprovado, a notificação é encerrada como não enviada por configuração pendente; não fica em backlog para disparar horas/dias depois quando um template for ativado.
- Template ausente nunca bloqueia o pedido.

## Saúde e recuperação

Um canal conectado é revalidado antes de ser tratado como saudável quando o último health estiver antigo.

Resultados:
- saudável -> atualiza nome, número, qualidade e `last_health_check_at`;
- indisponibilidade temporária da Meta -> `temporarily_unavailable`;
- credencial/permissão inválida -> `action_required`;
- painel oferece reconexão no mesmo modo de conexão.

## Segurança e isolamento

- `organization_id`, `store_id` e usuário vêm da sessão autenticada server-side.
- estado anti-CSRF é armazenado somente como hash.
- sessão de onboarding expira.
- tokens permanentes e App Secret não vão para o browser.
- Phone Number ID é único entre unidades.
- webhook valida assinatura da Meta.
- RPCs internas de ingestão/fila/PIN permanecem restritas ao service role.
- logs e auditoria guardam apenas erro sanitizado e identificadores necessários.

## Gates externos para liberação ampla

A engenharia do PedeAqui pode ficar pronta independentemente destes gates, mas produção self-service para clientes externos depende de:

1. App Meta do PedeAqui com permissões/revisões necessárias para Embedded Signup externo.
2. Configuração Meta compatível com coexistência, quando esse modo for liberado.
3. Webhooks/campos exigidos pela Meta para coexistência configurados no app oficial.
4. Modelo de cobrança da mensageria definido (`meta_billing_mode`).
5. Pelo menos um template utilitário aprovado para avisos fora da janela de atendimento.
6. Variáveis de produção do projeto Vercel correto configuradas.
7. Homologação com uma segunda empresa/WABA/número real usando somente o botão do PedeAqui.
8. Prova A/B: tenant A nunca recebe/envia pelo canal do tenant B.

## Gate final de escala

A issue #445 só deve ser encerrada depois do roteiro real abaixo passar:

`novo restaurante -> Conectar WhatsApp -> login Meta -> escolher/autorizar número -> health verde -> enviar Oi -> receber saudação/cardápio -> criar pedido -> receber atualização -> reconectar -> desconectar -> repetir com segundo tenant`.
