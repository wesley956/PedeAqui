# PedeAqui — adendo ao inventário de prontidão em 15/09/2026

Este adendo preserva os baselines históricos e registra superfícies adicionadas posteriormente.

## Configurações da unidade

- `/configuracoes/impressoes/gerenciar` — gestão das conexões de impressora da unidade, com ativação/desativação reversível e desvínculo confirmado. A operação preserva configuração, quantidade de vias e histórico; as mutações exigem `PRINTING_MANAGE` e permanecem isoladas por organização e unidade.

## Conversas / Inbox

- `/api/conversations/[conversationId]/messages` — endpoint autenticado e tenant-scoped para paginação e catch-up incremental do histórico da conversa. Exige permissão de visualização de Conversas, reutiliza a fonte canônica `messages`, não expõe credenciais Meta e não cria armazenamento paralelo.
