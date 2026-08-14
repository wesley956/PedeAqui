# PedeAqui — Contextos operacionais do restaurante

> Issue lógica: **[270]** · Entrada objetiva para [271]–[277].

## Objetivo

A navegação do PedeAqui deve refletir o trabalho real de cada pessoa durante o expediente. Este documento não define autorização e não substitui RBAC: ele descreve **contextos de uso**, frequência de tarefas e prioridade de informação.

## Princípios de classificação

1. **Principal** = tarefa recorrente durante o turno; precisa estar a um ou poucos passos da entrada.
2. **Secundário** = usado durante a operação, mas não continuamente.
3. **Raro/configuração** = cadastro, parâmetro ou análise eventual; não deve competir com a operação diária.
4. Um usuário pode acumular papéis. A navegação futura deve combinar contextos de forma determinística sem conceder permissão nova.
5. Dispositivo provável orienta densidade e navegação, mas não remove recursos disponíveis em outro dispositivo.
6. A tela inicial ideal é a primeira superfície útil do turno, não necessariamente o Dashboard.

---

## 1. Proprietário / Gestor

**Objetivo do turno:** entender a saúde da operação e tomar decisões de gestão.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | acompanhar vendas, pedidos, caixa, financeiro, desempenho, estoque crítico e equipe |
| Informação necessária | faturamento, ticket médio, pedidos pendentes/atrasados, caixa aberto/fechado, ruptura de estoque, indicadores de crescimento |
| Ações principais | abrir Dashboard, analisar pedidos, consultar caixa/financeiro, revisar estoque e resultados |
| Módulos principais | Dashboard, Pedidos, Caixa, Financeiro |
| Módulos secundários | Estoque, Cardápio, Clientes, Crescimento, Fiscal, Compras, Equipe |
| Módulos raros | Fornecedores, Escala, Configurações, Plataforma/white-label quando aplicável |
| Dispositivo provável | notebook/desktop; celular para acompanhamento rápido |
| Tela inicial ideal | **Dashboard** com resumo operacional e alertas acionáveis |

**Não priorizar na entrada:** operação detalhada de KDS, roteiro do entregador ou cadastro técnico.

---

## 2. Gerente

**Objetivo do turno:** manter a operação fluindo e resolver exceções.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | acompanhar fila de pedidos, salão, produção, entregas, caixa e equipe de turno |
| Informação necessária | pedidos novos/em preparo/atrasados, mesas abertas, produção parada, entregas pendentes, estado do caixa |
| Ações principais | intervir em pedido, acompanhar salão, direcionar produção/entrega, consultar caixa |
| Módulos principais | Pedidos, Salão, Produção, Entregas |
| Módulos secundários | Dashboard, Caixa, PDV, Conversas, Estoque, Equipe |
| Módulos raros | Financeiro completo, Fiscal, Compras, Fornecedores, Crescimento, Configurações |
| Dispositivo provável | tablet/notebook; celular durante circulação |
| Tela inicial ideal | **Pedidos** ou resumo operacional com atalho imediato para pedidos críticos |

**Não priorizar na entrada:** relatórios de longo prazo e cadastros administrativos.

---

## 3. Caixa

**Objetivo do turno:** registrar vendas e manter o caixa correto.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | abrir/fechar caixa, lançar venda, receber pagamento, consultar pedido, registrar sangria/suprimento quando permitido |
| Informação necessária | estado do caixa, total da venda, forma de pagamento, pedidos aguardando cobrança/retirada |
| Ações principais | abrir **PDV**, cobrar, concluir venda, acessar Caixa |
| Módulos principais | PDV, Caixa, Pedidos |
| Módulos secundários | Clientes, Conversas, Salão quando o caixa atende mesas |
| Módulos raros | Dashboard gerencial, Financeiro, Fiscal detalhado, Estoque, Compras, Crescimento, Configurações |
| Dispositivo provável | desktop/touchscreen no balcão; tablet em operação móvel |
| Tela inicial ideal | **PDV** quando caixa estiver operacional; **Caixa** quando exigir abertura/regularização |

**Regra de UX:** ações de venda e cobrança não podem ficar escondidas atrás de telas analíticas.

---

## 4. Atendimento / Balcão / Conversas

**Objetivo do turno:** transformar contato do cliente em pedido correto e acompanhar exceções.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | responder conversas, localizar cliente, criar/consultar pedido, confirmar retirada/entrega, orientar sobre andamento |
| Informação necessária | conversa atual, cliente, carrinho/pedido, status e previsão operacional disponível |
| Ações principais | abrir Conversas, consultar/criar Pedido, buscar Cliente, acessar PDV quando atendimento vira venda de balcão |
| Módulos principais | Conversas, Pedidos, Clientes |
| Módulos secundários | PDV, Entregas, Cardápio |
| Módulos raros | Financeiro, Fiscal, Compras, Fornecedores, Escala, Configurações |
| Dispositivo provável | desktop/notebook; celular corporativo |
| Tela inicial ideal | **Conversas** quando o canal digital é predominante; **Pedidos** como fallback |

**Não priorizar na entrada:** configuração de WhatsApp/integrador; isso pertence à administração/configuração.

---

## 5. Garçom / Salão

**Objetivo do turno:** atender mesas com o mínimo de navegação possível.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | visualizar mesas, abrir atendimento, lançar item, consultar pedido da mesa, fechar/encaminhar conta, identificar cliente |
| Informação necessária | mesas livres/ocupadas, tempo de atendimento, itens/pedidos da mesa, situação da conta |
| Ações principais | abrir Mesa, criar/editar pedido da mesa, chamar fechamento conforme fluxo vigente |
| Módulos principais | Salão/Mesas, Pedidos |
| Módulos secundários | Clientes, Cardápio, PDV quando autorizado para cobrança |
| Módulos raros | Dashboard, Financeiro, Fiscal, Estoque, Compras, Fornecedores, Crescimento, Configurações |
| Dispositivo provável | **celular** e tablet; desktop é secundário |
| Tela inicial ideal | **Salão/Mesas** |

**Regra de UX:** no celular, Mesas e Novo Pedido devem estar entre as ações mais acessíveis; listas administrativas não devem competir no bottom nav.

---

## 6. Cozinha / Produção

**Objetivo do turno:** produzir na ordem correta e sinalizar avanço sem distrações administrativas.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | ler fila, identificar atraso/prioridade, iniciar preparo, marcar pronto, consultar observações e itens |
| Informação necessária | número do pedido, itens, quantidades, observações, canal/mesa, tempo decorrido, estado atual |
| Ações principais | avançar estado de produção conforme regras atuais |
| Módulos principais | Produção/KDS |
| Módulos secundários | Pedidos para consulta/exceção |
| Módulos raros | todos os módulos gerenciais, financeiros, relacionamento, suprimentos e configurações |
| Dispositivo provável | tablet/tela touch/monitor fixo na cozinha |
| Tela inicial ideal | **Produção/KDS** |

**Regra de UX:** alta legibilidade, foco em fila e tempo; navegação global deve ser mínima.

---

## 7. Entregador

**Objetivo do turno:** executar as entregas atribuídas e registrar andamento.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | ver rota/entregas atribuídas, abrir destino, consultar contato/endereço, atualizar andamento quando permitido |
| Informação necessária | sequência, endereço, cliente/telefone, pedido, forma/situação de pagamento relevante, status da entrega |
| Ações principais | abrir Meu roteiro, iniciar/navegar entrega, concluir etapa conforme fluxo vigente |
| Módulos principais | Meu roteiro/Entregador |
| Módulos secundários | Entregas e Pedidos somente para informação necessária ao trabalho |
| Módulos raros | todo o restante |
| Dispositivo provável | **celular** |
| Tela inicial ideal | **Meu roteiro** |

**Regra de UX:** não expor navegação longa; o entregador deve chegar à próxima ação em um toque após entrar.

---

## 8. Administrativo

**Objetivo do turno:** manter cadastros, suprimentos, conformidade e parâmetros organizados.

| Dimensão | Definição |
|---|---|
| Tarefas frequentes | cadastros, compras, fornecedores, estoque administrativo, fiscal, equipe, configurações e conciliações conforme atribuição |
| Informação necessária | pendências documentais, estoque, compras, fornecedores, cadastros, integrações e parâmetros |
| Ações principais | manter Cardápio/cadastros, Compras, Fornecedores, Fiscal, Estoque e Configurações |
| Módulos principais | Cardápio, Estoque, Compras, Fornecedores, Fiscal, Configurações |
| Módulos secundários | Financeiro, Equipe, Escala, Clientes, Dashboard |
| Módulos raros | PDV operacional, KDS, Salão e roteiro de entrega |
| Dispositivo provável | desktop/notebook |
| Tela inicial ideal | **Dashboard administrativo** ou Configurações/Pendências, conforme permissões acumuladas |

**Não priorizar na entrada:** ações de expediente que pertencem a caixa, salão ou cozinha.

---

## Matriz resumida de prioridade operacional

| Contexto | Entrada ideal | Núcleo diário | Dispositivo dominante |
|---|---|---|---|
| Proprietário/Gestor | Dashboard | análise + exceções | desktop |
| Gerente | Pedidos | coordenação da operação | tablet/desktop |
| Caixa | PDV/Caixa | venda + recebimento | desktop/touch |
| Atendimento | Conversas/Pedidos | contato + pedido | desktop/celular |
| Garçom/Salão | Salão/Mesas | mesa + pedido | celular/tablet |
| Cozinha | Produção/KDS | fila + preparo | tablet/tela fixa |
| Entregador | Meu roteiro | rota + entrega | celular |
| Administrativo | Dashboard/Configurações | cadastros + suprimentos | desktop |

## Limites desta issue

- Não altera RBAC.
- Não oculta itens de menu.
- Não muda redirects.
- Não altera telas iniciais em código.
- Não cria papéis persistidos novos.

A [271] traduz este mapa para uma matriz `contexto x módulo`, relacionando cada item às permissões já existentes. [272]–[277] usam essa matriz para reorganizar a experiência sem transformar visibilidade de menu em mecanismo de segurança.
