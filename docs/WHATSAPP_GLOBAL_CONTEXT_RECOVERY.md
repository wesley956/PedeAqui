# WhatsApp global context recovery

Este lote fecha duas lacunas encontradas em conversas reais sem alterar os contratos centrais de pedido, catálogo, pagamento, entrega ou rastreamento.

## Endereço salvo fora do checkout
- Só responde quando a mensagem contém intenção explícita sobre endereço já salvo/cadastrado.
- Busca por `customer_id` vinculado ao contato quando disponível; caso contrário, só aceita correspondência telefônica única.
- Nunca mistura organizações/lojas.
- Se a consulta falhar, não inventa endereço e não avança o pedido.
- Se houver pedido em montagem, preserva exatamente o passo e o contexto atuais.

## Cliente não sabe o número do pedido
- Só pesquisa pedidos recentes da mesma organização/loja.
- Filtra os resultados por correspondência segura do telefone do WhatsApp com o telefone do pedido.
- Fora de um pedido em montagem, prepara a sessão para receber o número e reutiliza o fluxo de rastreamento já existente.
- Durante um pedido em montagem, não muda a sessão para rastreamento para evitar que um número isolado seja confundido com quantidade. Orienta o cliente a escrever `pedido N` e preserva a montagem.
- Se nenhum pedido puder ser associado com segurança, não revela números e oferece a continuidade segura.

## Fluxos explicitamente preservados
- criação/edição de carrinho;
- confirmação final do pedido;
- composição de sabores;
- pagamento e Pix;
- entrega/retirada;
- handoff humano;
- benefícios/cashback;
- rastreamento com verificação de propriedade;
- idempotência das respostas automáticas.
