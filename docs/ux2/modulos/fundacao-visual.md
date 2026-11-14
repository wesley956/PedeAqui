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
