# [315] Homologação de acessibilidade

Data: 2026-08-14

## Fluxos priorizados

- autenticação e recuperação de acesso;
- navegação desktop/mobile;
- pedidos/PDV/Salão/KDS/Entregas;
- cardápio público, produto, carrinho e checkout;
- formulários e estados de feedback.

## Teclado e foco

- `AppShell` agora oferece **Pular para o conteúdo principal** como primeiro atalho focável e `main#main-content` como destino.
- desktop/mobile continuam usando `:focus-visible` nos controles principais.
- `Dialog` usa elemento nativo `<dialog>`, `aria-labelledby`, `aria-describedby` e tratamento de cancel/close.
- navegação principal usa `aria-current=page`; área `Mais` usa `summary` focável.

## Labels, leitura e feedback

- componentes de formulário compartilhados associam label e campo;
- Alert/Toast/Loading/Error/Success usam `role=status/alert` e `aria-live` conforme urgência;
- ícones de estado são decorativos (`aria-hidden`) e sempre existe texto equivalente;
- estados operacionais importantes (aberto, fechado, conta solicitada, esgotado, conexão, checkout pronto/erro) possuem texto e não dependem apenas de cor.

## Movimento e zoom

`accessibility.css` respeita `prefers-reduced-motion: reduce`, reduzindo animações/transições e removendo smooth scrolling. O layout não bloqueia pinch zoom por meta viewport customizada e os breakpoints continuam fluidos.

## Contraste

A aplicação usa os tokens semânticos de `globals.css` e os guardrails de design tokens. White-label injeta somente aliases documentados; o menu público calcula foreground de contraste para a cor validada do restaurante. Estados não usam cor como único indicador.

## Touch e tamanho

Shell, PDV, Caixa, Salão, KDS e Entregador já possuem contratos `pointer: coarse`/`--control-height-lg`; courier usa ações de pelo menos 60 px. Mobile/tablet foram homologados separadamente em [313]–[314].

## Gate automatizado

`tests/full-accessibility-qa.test.ts` protege skip link, reduced motion, landmarks, live regions, dialog labels, navegação atual e feedback textual. Os testes já existentes `component-accessibility.test.ts`, `form-controls.test.ts` e `feedback-system.test.ts` permanecem parte do CI.
