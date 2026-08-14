# Central de configurações

Issue lógica: **[295]**.

O hub não cria novas fontes de verdade. Ele organiza as rotas existentes em quatro responsabilidades: Estabelecimento, Operação, Canais e integrações e Equipe/cadastros/estrutura.

Cada cartão só é exibido quando uma permissão já resolvida por `NavigationAccessService` permite acesso. A autorização da rota de destino continua sendo a proteção efetiva; ocultar cartão não substitui RBAC.

A identidade do restaurante permanece na configuração de cardápio/loja, horários continuam na rota de horários, entrega na rota de entrega, pagamentos na rota própria, e assim por diante. Não há replicação de formulários nem gravação paralela de configuração.
