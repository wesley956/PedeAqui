# UX2 — Fundação visual

Estado: **Parcialmente validado** (CI + prints na homologação descartável; falta o responsável navegar no computador dele).

## Lote 1 — Item selecionado em escuro (D-01)
- Novo grupo de tokens em `src/app/globals.css`: `--selected`, `--on-selected`, `--selected-surface`. Escuro no tema claro, claro no tema escuro.
- Passaram a usar esses tokens (antes eram laranja): menu lateral e barra inferior, "Mais" do celular, abas de página, navegação do Cardápio, filtros de Disponibilidade, filtros e conversa aberta em Conversas, visão/etapas e linha selecionada em Pedidos, cartões de escolha em Crescimento e em Fluxo de pedidos, dias da semana e produto de promoção no Cardápio, segmentos do checkout, seletor de tema e chave liga/desliga.
- Fundo da página: removido o brilho laranja do canto.
- Continuam laranja de propósito: botão principal, foco de teclado, caixas de seleção nativas e a etapa atual no acompanhamento do pedido do cliente.

Nenhuma regra de negócio, texto ou comportamento mudou: só cor.

## Como conferir
1. Abrir o painel na homologação local e passar por Início, Pedidos, Cardápio, Conversas e Configurações.
2. Em cada tela: o item do menu/aba/filtro selecionado está escuro (ou claro no tema escuro) e só o botão principal é laranja.
3. Trocar o tema (claro/escuro) e repetir.

## Evidências
Prints antes/depois na branch `ux2/evidencias` (pastas `ux2_auditoria` = antes, `ux2_fundacao-visual` = depois).

## Lote 2 — Achados dos primeiros prints
- **Logo do menu lateral**: no tema claro a palavra "Pede" ficava branca em fundo branco (invisível). O logo agora acompanha o tema (`surface="auto"`).
- **PDV**: categoria e forma de pagamento selecionadas em escuro; total em preto (antes laranja); "Detalhes / Dividir" como link sublinhado; o botão flutuante do guia sobe para não cobrir "Finalizar".
- **Checkout do cliente**: opções escolhidas (entrega/retirada, pagamento, troco) em escuro.
- **Cozinha**: filtro ativo em escuro.
- **Cardápio › Produtos e Sabores**: "Filtrar"/"Buscar" viram botão secundário; o único laranja da tela é "Novo produto".
- **Infra de teste**: `browser-homologation.yml` fixado em `ubuntu-24.04` (o Playwright 1.55 não instala no Ubuntu novo do `ubuntu-latest`). Vale só nas branches `ux2/*`; a `main` segue com o problema — ver B-05 em `ESTADO.md`.

## Lote 3 — Correções encontradas pela auditoria (branch `ux2/correcoes-auditoria`)
- **Minhas entregas (`/entregador`)**: dono ou gerente que abria a tela sem ser entregador via "Não foi possível concluir esta operação". Agora a tela explica que é a área do entregador e aponta para Entregas. A regra não mudou: só entregador cadastrado vê entregas ali.
- **Aviso do React em todas as telas**: o script do tema ficava fora do `<body>`. Movido para dentro.
- **Homologação local**: faltavam migrações do WhatsApp (coexistência, mídia, modelos) que não estão no esquema consolidado `supabase/sql`; a tela Configurações › Conversas quebrava só na homologação. Não é defeito da produção.
- **Auditoria**: o comando de prints bloqueava a leitura da saída do servidor e o servidor travava depois de algumas telas; corrigido. O registro do servidor passa a ir junto com os prints.

## Lote 4 — Base do celular e segunda varredura de cor (branch `ux2/pdv`)
- **`position: sticky` voltou a funcionar no painel no celular.** `.app-content` usava `overflow-x: hidden` em telas estreitas; isso a transformava numa área de rolagem que não rola, e tudo que deveria ficar preso à tela sumia ao rolar: barra de pagamento e etapas do PDV, barras "Salvar" de formulários, cabeçalhos. Trocado por `overflow-x: clip`. Conferido com print rolado de 45 telas no celular.
- **Texto laranja virou texto escuro** em 59 pontos do painel (links "Abrir →", totais, rótulos pequenos, setas). Novo token `--link-color`. Rótulos pequenos em maiúsculas ("SEU NEGÓCIO") ficam em cinza.
- **Bordas laranja ao passar o mouse** viraram borda neutra forte em 11 pontos.
- Não mexido de propósito: botões principais, foco de teclado, avisos/alertas, selos, site institucional, telas de acesso e cardápio do cliente (que usa a cor da loja).
