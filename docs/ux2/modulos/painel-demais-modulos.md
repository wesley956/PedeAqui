# UX2 — Demais módulos do painel

Cobre: Pedidos (lista e detalhe), Conversas, Cardápio (gestão), Configurações, Caixa, Salão, Produção, Entregas, Gestão (Financeiro, Estoque, Compras, Fornecedores, Clientes, Crescimento, Equipe, Plano).

Estado de todos: **Parcialmente validado**.

## O que foi feito
Estes módulos não receberam redesenho de estrutura. Receberam a fundação visual (ver `fundacao-visual.md`) e correções pontuais encontradas olhando os prints de cada tela:

| Módulo | Ajuste |
| --- | --- |
| Pedidos | pedido novo destacado por selo e borda, sem contorno laranja; total do detalhe em preto |
| Cardápio › Produtos e Sabores | "Filtrar"/"Buscar" como botão secundário; links e preços promocionais neutros |
| Configurações | setas e links neutros; "Como seu restaurante trabalha": opção escolhida em escuro |
| Produção | estação escolhida em escuro (o botão ficava laranja como se fosse a ação principal) |
| Salão | etapa atual do atendimento em escuro |
| Entregas › Minhas entregas | explicação no lugar da tela de erro para quem não é entregador |
| Clientes, Estoque, Financeiro, Compras | links "Abrir →" e valores neutros |
| Plano e expansão | nomes em português no lugar de "Domains custom" e "Scale multiunit" |
| Todas (celular) | barras "Salvar" e cabeçalhos voltaram a ficar presos à tela |

## O que foi conferido
- 59 telas do painel em 1366 px e 360 px, temas claro e escuro, mais print rolado no celular.
- Nenhuma tela com rolagem lateral. Nenhuma tela com erro próprio do sistema (as falhas restantes são do banco local — B-06).

## O que não foi feito
- **Conversas**: a loja fictícia não tem conversa nem WhatsApp conectado; só a tela vazia foi vista. A tela com conversas reais não foi auditada (B-04).
- **Detalhe do pedido**: visto só no estado "aguardando confirmação".
- Nenhum fluxo foi executado até o fim (aceitar pedido, abrir e fechar mesa, abrir e fechar caixa, lançar no financeiro).
- Redesenho de estrutura dessas telas (menos campos por tela, passos guiados) não foi feito: exige decisão sobre o que esconder, e a regra do UX2 é não remover função.

## Atualização de 15/11/2026 — formulários cortados no celular
A página do painel não rola de lado no celular; campos que passam da borda ficam inalcançáveis. A auditoria passou a contar campos, botões e links cortados em cada tela (campo `clipped` em `results.json`).

- **Financeiro › Lançamentos**: "Novo lançamento" e "Transferir entre contas" tinham duas colunas que não encolhiam; "Valor", "Vencimento" e "Destino" ficavam fora da tela. Corrigido.
- **Compras › Novo pedido de compra** e **Fiscal**: mesmo problema, mesma correção.
- **Estoque › Fichas técnicas**: a linha de insumo exigia 340 px e alargava a página inteira. Corrigido.
- Resta: em **Modo Movimento**, o filtro "Tudo / Atendimento / Cozinha / Expedição" passa da borda (rola de lado dentro da própria faixa).

Conferido em 360 px depois da correção: nenhum campo de formulário cortado nas 59 telas do painel.
