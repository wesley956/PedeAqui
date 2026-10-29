# PedeAqui — adendo ao inventário de prontidão em 15/09/2026

Este adendo preserva os baselines históricos e registra superfícies adicionadas posteriormente.

## Configurações da unidade

- `/configuracoes/impressoes/gerenciar` — gestão das conexões de impressora da unidade, com ativação/desativação reversível e desvínculo confirmado. A operação preserva configuração, quantidade de vias e histórico; as mutações exigem `PRINTING_MANAGE` e permanecem isoladas por organização e unidade.

## Conversas / Inbox

- `/api/conversations/[conversationId]/messages` — endpoint autenticado e tenant-scoped para paginação e catch-up incremental do histórico da conversa. Exige permissão de visualização de Conversas, reutiliza a fonte canônica `messages`, não expõe credenciais Meta e não cria armazenamento paralelo.
- `/api/conversations/[conversationId]/media/[mediaId]` — endpoint autenticado e tenant-scoped para projetar mídia privada da conversa por URL assinada curta; valida organização, unidade e conversa antes de redirecionar e não expõe caminho de storage nem credencial Meta.

## Cardápio público — gaveta do produto (Expresso)

- `/m/[slug]/@sheet/produto/[id]` — rota interceptada que abre a montagem do produto como gaveta por cima do cardápio (ou do checkout, ao editar um item). Reaproveita a mesma montagem e as mesmas ações de `/m/[slug]/produto/[id]`, que continua existindo quando o link é aberto direto.
- `/m/[slug]/@sheet` — mantém a gaveta fechada no cardápio, inclusive depois de adicionar um item.
- `/m/[slug]/@sheet/[...rest]` — mantém a gaveta fechada no carrinho, no checkout e no acompanhamento do pedido.

## Painel — menu personalizável

- `/meu-menu` — cada usuário escolhe quais itens ficam no grupo "Principal" do menu lateral e arrasta para definir a ordem (setas para toque e teclado). Salva por usuário e unidade em `user_store_preferences.navigation_pins`, aceita só itens que o usuário já pode ver por RBAC e módulos, e "Restaurar padrão" volta ao menu da função.

## Painel — Fase 2 da reorganização

- `/cardapio/disponibilidade` — aba padrão do Cardápio: uma busca para produtos, sabores e adicionais. Sabores com o mesmo nome em vários grupos aparecem uma vez e o interruptor vale para todos; quando a pausa deixaria produtos à venda sem escolhas suficientes, a tela lista esses produtos e oferece marcá-los como esgotados. Produtos desligados viram "Esgotado". Atalho "Buscar item" na barra superior.

## Pagamentos — InfinitePay (20/10/2026)

- `/api/webhooks/payments/infinitepay/[storeId]` — notificação com token privado por unidade, hash do payload e consulta autenticada à InfinitePay antes de confirmar o pagamento.
- `/m/[slug]/pedido/[id]/infinitepay/retorno` — retorno do checkout; exige cookie de acesso ao pedido e confere referência, unidade e valor na API. A URL de retorno sozinha não confirma pagamento.
# Acompanhamento de pedidos — atualização de 29/10/2026

- `/m/[slug]/meus-pedidos`: lista os últimos cinco pedidos autorizados neste navegador, com número, status e acesso ao acompanhamento.
- `/m/[slug]/pedido-atual`: valida o histórico HttpOnly e o token individual do pedido antes de restaurar o cookie de acompanhamento e redirecionar para a URL limpa. Sem credencial válida, retorna à lista; não consulta pedidos por telefone.

