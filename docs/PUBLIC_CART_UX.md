# Carrinho público — hierarquia operacional

Issue lógica: **[300]**.

O carrinho mostra primeiro itens e alterações detectadas na revalidação, depois quantidade, remoção, observação/opções já salvas e o resumo financeiro. Subtotal, descontos, entrega e total são exclusivamente os valores retornados por `CartService`; a interface não recalcula preços.

Quantidade e exclusão continuam nas server actions existentes. Como não existe API autoritativa para editar opções ou observação em um item já criado, a interface oferece retorno ao produto para refazer a configuração em vez de criar uma atualização client-side não suportada.

Itens inválidos bloqueiam o CTA de checkout até serem removidos ou refeitos. Cupom, cashback e pontos aparecem somente quando já estão aplicados ao carrinho. O layout mobile usa controles com altura de toque e evita tabelas ou rolagem horizontal.
