# KDS / Produção — interface operacional

A tela de produção prioriza leitura à distância e uso por toque.

- número, cliente, modalidade e tempo ficam no cabeçalho do card;
- itens usam quantidade e nome em tipografia maior;
- adicionais aparecem individualmente;
- observações recebem contraste próprio;
- estações continuam sendo o filtro autoritativo já fornecido por `KitchenService`;
- `Iniciar preparo` e `Marcar como pronto` continuam passando pelo mesmo `OrderActionForm` e pelas state machines existentes;
- atualização realtime continua ouvindo alterações de pedidos da unidade atual.

Os limiares de 12 e 20 minutos já existentes em `kitchen-model.ts` são **heurísticas visuais de atenção**, não SLA comercial. Nenhum prazo de restaurante foi inventado nesta etapa.

No mobile o board usa uma coluna; em monitor amplia cards automaticamente. Controles compartilhados usam o tamanho grande do design system e o CSS reforça alvos em dispositivos `pointer: coarse`.
