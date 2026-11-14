# UX2 — Cardápio público (o que o cliente vê)

Estado: **Parcialmente validado**.

## Parte 1 — Página inicial do cardápio (PR #1324)
- **Capa na cor da loja** no topo, com o logo grande sobreposto e o nome da loja em destaque. O botão de informações fica no canto da capa.
- **Categoria escolhida em escuro** (antes na cor da loja).
- **Foto do produto à direita e maior** (96 px; 88 px no celular), com o "+" no canto da foto. Produto sem foto não mostra mais o quadrado com o desenho de prato: o texto ocupa a linha.
- **"+" neutro** (branco com borda). A cor da loja fica na capa, no logo e na barra "Finalizar pedido".
- Descrição do produto com até 2 linhas (antes 1).

Nada mudou em preço, carrinho, regras de pedido ou textos.

## O que foi conferido
- CI completo verde (tipos, testes, build, homologação de navegador).
- Prints em 360 px e 1366 px na loja fictícia: cardápio, produto com sabores, depois de adicionar, carrinho e checkout — sem corte nem rolagem lateral.

## O que falta conferir (por isso "parcialmente")
- **Loja com fotos reais**: a loja fictícia não tem fotos; a posição da foto à direita e do "+" sobre ela não foi vista com imagem de verdade.
- Loja com logo próprio e com cor de marca escura/clara (contraste do botão de informações sobre a capa).
- Tema escuro do aparelho.

## Próximas partes
Tela do produto (sabores e adicionais), carrinho, checkout e acompanhamento do pedido.

## Parte 2 — Produto, carrinho e finalização (branch `ux2/fluxo-cliente`)
- **Produto sem foto**: o desenho de prato ocupava metade da tela do celular antes dos sabores; virou uma faixa baixa. Preço em preto.
- **− e +** neutros em todo o fluxo (produto, carrinho, finalização).
- **Carrinho**: saiu o quadro "Sem foto"; total em preto; "Editar item" como link sublinhado.
- **Finalizar pedido**: fundo sem degradê colorido; links, totais e rótulos neutros. A cor da loja fica no botão que avança e na barra de progresso.

Regras de entrega, pagamento, troco e valores não foram tocadas.
