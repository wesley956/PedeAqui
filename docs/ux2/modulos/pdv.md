# UX2 — PDV

Estado: **Parcialmente validado**.

## O que mudou
- **Celular: total e "Finalizar" sempre à vista.** Ao rolar a lista de produtos, a barra de pagamento e o seletor "Itens / Venda" sumiam (ver "base do celular" em `fundacao-visual.md`). Agora ficam presos: etapas logo abaixo do topo, pagamento logo acima do menu inferior. Medido no print: barra em 605–672 px numa tela de 740 px, menu inferior a partir de 672 px.
- **Celular: forma de pagamento visível na barra recolhida** ("Dinheiro · Alterar"). Antes aparecia só "Pagamento … Alterar".
- Categoria e forma de pagamento escolhidas em escuro; total em preto; "Detalhes / Dividir" como link sublinhado.
- Cartão de produto em foco e barra de pagamento com borda neutra; o único laranja é "Finalizar".
- O botão flutuante do guia não cobre mais "Finalizar".

Nenhuma regra de venda, preço, pagamento, troco, caixa ou benefício foi alterada.

## O que foi conferido
- CI completo verde.
- Prints (claro e escuro, 1366 px e 360 px): PDV vazio, com item, produto com opções aberto, etapa "Venda" no celular e pagamento detalhado no computador.

## O que falta para "Validado"
- **Finalizar uma venda de ponta a ponta** (dinheiro com troco, cartão, pagamento dividido, cliente e benefício). A auditoria não finaliza vendas; precisa de uma pessoa na homologação local.
- Abrir "Detalhes / Dividir" no celular (o roteiro automático não encontrou o botão com a barra recolhida).
- Leitor de código de barras e impressão do comprovante (sem equipamento na homologação).
