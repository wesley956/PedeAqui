# Invariantes de segurança — WhatsApp

1. Tenant vem da sessão/autorização server-side, nunca de store id livre do browser.
2. Phone Number ID precisa pertencer à WABA autorizada.
3. Um Phone Number ID não pode pertencer a duas unidades PedeAqui.
4. Callback precisa pertencer à sessão, usuário e modo iniciados.
5. Segredos permanentes permanecem server-side.
6. Webhook valida assinatura Meta.
7. Falha do canal não altera pedido.
8. Não executar offboarding externo destrutivo sem contrato Meta homologado.
