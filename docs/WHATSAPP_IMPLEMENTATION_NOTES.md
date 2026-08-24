# Notas de implementação — WhatsApp PedeAqui

## Decisões preservadas

- Não criar um segundo subsistema para coexistência; ambos os modos reutilizam webhook, inbox, provider, automações e isolamento existentes.
- Não alterar o canal já conectado: registros existentes permanecem `cloud_api` por default.
- Não acoplar WhatsApp à state machine do pedido.
- Não ativar responsabilidade financeira/linha de crédito Meta automaticamente.
- Não revogar ativos externos agressivamente no botão Desconectar até o contrato/permissões Meta do modo real estar homologado; o PedeAqui suspende o canal localmente e preserva histórico.
- Não deixar falha permanente ou template ausente em retry infinito.

## Diferenças por modo

### `cloud_api`
- Embedded Signup padrão.
- WABA/phone validados server-side.
- System User + subscribed app.
- `/register` executado.
- PIN gerado e guardado via camada protegida existente.
- health real antes de `connected`.

### `coexistence`
- Embedded Signup com feature type de WhatsApp Business App onboarding.
- aceita retorno com WABA sem Phone Number ID e resolve o telefone no backend quando inequívoco.
- WABA/phone validados server-side.
- System User + subscribed app.
- PedeAqui não repete `/register` no onboarding de coexistência.
- health real antes de `connected`.

## Recuperação

- `temporarily_unavailable`: falha transitória; automações podem aguardar retry controlado.
- `action_required`: credencial/permissão precisa de reconexão; novos avisos são ignorados até recuperar.
- `disconnected`: nenhuma automação nova; histórico intacto.

## Compatibilidade

A migration 140 usa default `cloud_api`; portanto canais anteriores não mudam de semântica. A migration 141 apenas encerra retries antigos que nunca poderiam sair sem um template Meta aprovado.
