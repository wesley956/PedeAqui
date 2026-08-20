# PedeAqui — lote [357]–[361]

Este lote conecta a fundação modular à experiência real do usuário:

- navegação desktop/mobile filtrada server-side pelos módulos efetivamente disponíveis;
- bloqueio amigável de deep links de módulos desativados;
- onboarding progressivo com perfil do negócio e modos Essencial, Completo e Personalizar;
- Configurações → Módulos com preview, dependências, bloqueios e restauração de presets;
- Modo Fácil persistido por usuário/unidade, sempre como subconjunto do acesso já autorizado;
- vocabulário adaptativo para Restaurante, Revenda de gás e Comércio genérico sem alterar state machines.

## Compatibilidade
As sete unidades existentes permanecem `restaurant/complete` com seus 20 módulos habilitados. O schema novo é aditivo e nenhuma desativação remove dados de domínio.

## Segurança
Permissões, plano/entitlements, módulos e experiência continuam camadas independentes. O shell esconde somente o que a resolução server-side marcou como indisponível, e o acesso direto à URL passa pelo mesmo snapshot de disponibilidade.
