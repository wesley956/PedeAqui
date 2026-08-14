# Documentos e status — painel operacional

Issue lógica: **[294]**.

O painel separa a operação em três filas: pendentes (`draft`, `queued`, `processing`), atenção (`rejected`, `contingency`) e concluídos (`authorized`, `cancelled`). Status é exibido por texto, símbolo e tom semântico.

Pedidos elegíveis ficam antes das filas porque representam trabalho a iniciar. Configuração de perfil, provider e classificação de produtos fica recolhida em uma área própria e não compete com a fila diária.

Criação de rascunho, enfileiramento e cancelamento continuam usando os formulários e serviços existentes; nenhuma state machine, regra de emissão, provider, snapshot ou autorização foi alterada.
