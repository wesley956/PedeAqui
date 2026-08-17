# [329] Meta Test WABA

A `Test WhatsApp Business Account` da Meta é tratada como ambiente de homologação.

- o PedeAqui habilita notificações automáticas de pedido dentro da janela de atendimento de 24h;
- não persiste template customizado inexistente;
- fora da janela o worker continua falhando de forma segura com `template_required`;
- em WABA comercial o fluxo continua criando/consultando `pedeaqui_atualizacao_pedido` e só considera produção 24/7 quando a Meta retorna `APPROVED`;
- nenhum token é exposto no navegador ou no banco da unidade.
