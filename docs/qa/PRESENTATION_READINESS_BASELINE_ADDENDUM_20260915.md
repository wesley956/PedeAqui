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
