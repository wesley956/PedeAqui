# Card público de produto

Issue lógica: **[298]**.

O card apresenta nome, descrição curta, preço vigente, preço anterior quando houver promoção, imagem e disponibilidade. Descrições são limitadas visualmente a duas linhas; imagens usam proporção quadrada e `object-fit: cover`; ausência de imagem gera placeholder neutro do restaurante, nunca marca PedeAqui improvisada.

Itens esgotados continuam consultáveis para o cliente entender o catálogo, mas o card comunica explicitamente que não podem ser adicionados. A regra efetiva de disponibilidade continua sendo revalidada no fluxo de produto/checkout server-side.
