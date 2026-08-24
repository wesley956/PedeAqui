# Gates externos da Meta — WhatsApp PedeAqui

Este documento separa o que é responsabilidade da engenharia do PedeAqui do que exige autorização/aprovação de proprietário ou da própria Meta.

## Não bloqueia o restante do PedeAqui

Enquanto qualquer gate abaixo estiver pendente:
- cardápio continua funcionando;
- carrinho/checkout continuam funcionando;
- dinheiro e cartão presencial continuam funcionando;
- pedido continua funcionando;
- produção/retirada/entrega continuam conforme módulos ativos;
- WhatsApp pode permanecer desligado ou com automações suspensas.

## Gates

### 1. App Meta e acesso externo
Confirmar no app oficial do PedeAqui os acessos/revisões vigentes exigidos para onboarding de empresas externas. O código não deve tentar contornar App Review ou permissões ausentes.

### 2. Embedded Signup padrão
A configuração associada a `META_EMBEDDED_SIGNUP_CONFIG_ID` precisa estar ativa e autorizada no app oficial.

### 3. Coexistência com WhatsApp Business App
Quando liberado comercialmente, validar uma configuração Meta compatível com coexistência. O PedeAqui aceita um ID específico em `META_EMBEDDED_SIGNUP_COEXISTENCE_CONFIG_ID`; se não houver, reutiliza a configuração padrão, mas isso não substitui a habilitação correta do recurso na Meta.

### 4. Credenciais da plataforma
As credenciais abaixo ficam somente no servidor:
- `WHATSAPP_APP_SECRET`;
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`;
- `META_SYSTEM_USER_ACCESS_TOKEN`;
- demais credenciais Meta server-side.

Nunca solicitar que restaurante copie essas credenciais.

### 5. Billing da mensageria
`meta_billing_mode` permanece `unconfigured` até decisão comercial explícita. O código não compartilha/anexa automaticamente linha de crédito do PedeAqui.

### 6. Templates
Avisos fora da janela de atendimento só podem ser enviados com modelo que a Meta permita/aprove. O PedeAqui não inventa aprovação e não mantém backlog para disparar mensagem antiga quando o modelo aparecer.

### 7. Homologação com segunda empresa real
A escala só está aprovada quando um segundo negócio conecta o próprio WABA/número pelo painel, sem Graph Explorer, sem Vercel e sem colagem manual de identificadores/tokens.
