# [314] Homologação de layouts no celular

Data: 2026-08-14
Larguras de referência: 320, 360, 375, 390, 412 e 430 px, incluindo safe-area e teclado virtual.

## Shell e navegação

- Até 900 px a sidebar desaparece e existe uma única navegação principal: `MobileNavigation`.
- O seletor mantém no máximo quatro destinos principais; módulos restantes ficam em `Mais`.
- A barra inferior reserva `env(safe-area-inset-bottom)` no layout e no próprio nav.
- O painel `Mais` tem altura limitada, rolagem própria e `overscroll-behavior: contain`, evitando arrastar a página por trás.
- Links/summary usam `touch-action: manipulation`.
- O conteúdo principal corta overflow horizontal acidental no shell mobile; componentes que precisam de rolagem horizontal, como categorias, mantêm overflow local explícito.

## Teclado virtual

Campos `input`, `select` e `textarea` recebem `scroll-margin-block` no mobile para que o navegador possa posicionar o controle acima da navegação inferior/teclado ao ganhar foco. O conteúdo não usa altura fixa de viewport. Em <=480 px o topbar aceita texto operacional quebrado sem empurrar a ação de sair para fora da tela.

## Jornadas homologadas

### Menu público → produto → carrinho → checkout

- cardápio usa grade de uma coluna em <=640 px e categorias com rolagem horizontal local;
- cards mantêm imagem/placeholder com dimensão definida;
- checkout quebra progress/grades para uma coluna e CTAs usam altura de controle grande;
- carrinho e checkout não dependem do AppShell/bottom nav autenticado.

### Salão

- mesas passam de grade adaptativa para duas colunas em <=620 px e uma coluna em <=430 px;
- ações frequentes têm altura touch em `pointer: coarse`.

### Entregador / Entregas

- rota do entregador já possui breakpoint <=520 px, botões de pelo menos 60 px e modo coarse-pointer;
- estados de conexão e próxima ação permanecem textuais, não apenas por cor.

### Pedidos e consultas administrativas

- páginas autenticadas herdam o shell de uma coluna, bottom nav e área `Mais`;
- conteúdo recebe `min-width:0`/controle de overflow e listas/tabelas mantêm seus próprios contratos responsivos;
- nenhuma segunda navegação desktop fica visível no mesmo breakpoint.

## Gate

`tests/mobile-full-layout-qa.test.ts` protege navegação única, safe-area, teclado, overflow, `Mais`, menu/checkout, Salão e Entregador. Os testes mobile já existentes continuam cobrindo seleção de navegação, PDV e jornada do courier.
