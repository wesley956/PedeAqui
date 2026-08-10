# Cruz — Backlog Técnico Mestre

Versão 1.1 — Fase 0 + Fase 1, incluindo impressão profissional.

## Definition of Done

Uma tarefa só está pronta quando contempla, quando aplicável: implementação, validação server-side, tratamento de erro, loading/sucesso/retry, autorização, auditoria, responsividade, testes e staging.

Uma feature precisa validar happy path, erros, permissões, mobile, desktop, auditoria, testes e performance.

## Prioridades

- P0 — bloqueia o sistema / integridade / segurança.
- P1 — essencial ao MVP.
- P2 — importante após o caminho crítico.
- P3 — evolução.

# Milestone 0 — Fundação (#001–#016)

001. **[CORE] Inicializar projeto — P0**: Next.js App Router, TypeScript estrito, lint, build, testes, aliases, ambientes e estrutura por domínio.
002. **[DATABASE] Configurar banco e migrations — P0**: PostgreSQL/Supabase, migrations versionadas, seed, RLS e ambientes separados.
003. **[AUTH] Implementar autenticação — P0**: cadastro, login, logout, recuperação de senha, sessão SSR e rotas protegidas.
004. **[AUTH] Criar profiles — P0**: perfil 1:1 com usuário Auth, status e dados públicos da aplicação.
005. **[ORG] Criar organizations — P0**: organizações e memberships; criador vira owner.
006. **[STORE] Criar stores — P0**: CRUD/base de unidades vinculadas à organização.
007. **[STORE] Criar contexto de unidade — P0**: organização/loja atual resolvidas server-side.
008. **[ACCESS] Criar sistema de roles — P0**: roles, permissions, role_permissions e vínculo por loja.
009. **[ACCESS] Implementar autorização server-side — P0**: `authorize()` e checagem explícita de organização/unidade/permissão.
010. **[TEAM] Convite de funcionários — P1**: convites expiráveis, role e lojas permitidas.
011. **[AUDIT] Implementar audit_logs — P0**: quem/quando/o quê/before/after/contexto.
012. **[UI] Criar Design System — P1**: componentes básicos e estados comuns.
013. **[UI] Criar layout administrativo — P1**: shell desktop/mobile, sidebar/topbar/navegação.
014. **[CORE] Criar sistema de eventos — P0**: DomainEvent, event store/outbox inicial e dispatch interno.
015. **[CORE] Implementar idempotência — P0**: infraestrutura reutilizável para checkout, pedidos, pagamentos e impressão.
016. **[OBSERVABILITY] Logs e monitoramento — P1**: logs estruturados, correlation/request id, sanitização e health endpoint.

# Milestone 1 — Catálogo

017. [CATALOG] Criar categories — P1.
018. [CATALOG] Criar products — P1.
019. [CATALOG] Upload de imagens — P1.
020. [CATALOG] Criar modifier_groups — P1.
021. [CATALOG] Criar modifiers — P1.
022. [CATALOG] Vincular adicionais aos produtos — P1.
023. [CATALOG] Duplicar produto — P2.
024. [CATALOG] Disponibilidade de produto — P1.

# Milestone 2 — Loja e Cardápio

025. [STORE] Configuração do cardápio — P1.
026. [STORE] Horários de funcionamento — P1.
027. [STORE] Pausar recebimento de pedidos — P1.
028. [MENU] Criar cardápio público — P0.
029. [MENU] Criar página de produto — P0.
030. [MENU] Busca do cardápio — P1.
031. [MENU] Navegação por categorias — P1.

# Milestone 3 — Cliente e Entrega

032. [CUSTOMER] Criar customers — P1.
033. [CUSTOMER] Criar endereços — P1.
034. [DELIVERY] Configuração básica de entrega — P1.
035. [DELIVERY] Taxa por bairro — P1.

# Milestone 4 — Carrinho

036. [CART] Criar carts — P0.
037. [CART] Criar cart_items — P0.
038. [CART] Adicionais do carrinho — P0.
039. [PRICING] Criar PricingService — P0.
040. [CART] Validar alterações de preço — P0.

# Milestone 5 — Checkout

041. [CHECKOUT] Criar fluxo de identificação — P0.
042. [CHECKOUT] Entrega ou retirada — P0.
043. [CHECKOUT] Seleção de endereço — P0.
044. [CHECKOUT] Forma de pagamento — P0.
045. [CHECKOUT] Dinheiro e troco — P1.
046. [CHECKOUT] Revisão final — P0.

# Milestone 6 — Motor de Pedidos

047. [ORDER] Criar orders — P0.
048. [ORDER] Criar order_items — P0.
049. [ORDER] Criar snapshots de adicionais — P0.
050. [ORDER] Gerar número amigável — P1.
051. [ORDER] Criar State Machine — P0.
052. [ORDER] Criar histórico de status — P0.
053. [ORDER] Criar OrderService — P0.
054. [ORDER] Criar pedido pelo checkout — P0.
055. [ORDER] Implementar cancelamento — P1.
056. [ORDER] Eventos de pedido — P0.
057. [ORDER] Realtime de pedidos — P0.

# Milestone 7 — Central de Impressão

058. [PRINT] Criar tabela printers — P0.
059. [PRINT] Criar production_stations — P0.
060. [PRINT] Vincular impressora à estação — P0.
061. [PRINT] Vincular produtos às estações — P0.
062. [PRINT] Criar PrintService — P0.
063. [PRINT] Criar PrintRoutingService — P0.
064. [PRINT] Criar print_jobs — P0.
065. [PRINT] Criar PrintQueueService — P0.
066. [PRINT] Criar retry automático — P0.
067. [PRINT] Criar template de cozinha — P0.
068. [PRINT] Criar template de expedição — P0.
069. [PRINT] Criar template de balcão — P1.
070. [PRINT] Implementar reimpressão — P0.
071. [PRINT] Auditoria de reimpressão — P0.
072. [PRINT] Configurar número de cópias — P1.
073. [PRINT] Criar monitor de fila — P0.
074. [PRINT] Exibir status da impressora — P1.
075. [PRINT] Implementar fallback de impressora — P1.
076. [PRINT] Garantir idempotência de impressão — P0.
077. [PRINT] Criar interface do Print Agent — P1.
078. [PRINT] Criar MVP do Print Agent — P1.
079. [PRINT] Heartbeat do Print Agent — P1.
080. [PRINT] Alertar impressora offline — P1.
081. [PRINT] Testar impressão ESC/POS — P0.
082. [PRINT] Imprimir automaticamente ao confirmar pedido — P0.

# Milestone 8 — Gestor de Pedidos

083. [ORDER UI] Criar Kanban de pedidos — P0.
084. [ORDER UI] Criar card do pedido — P0.
085. [ORDER UI] Criar detalhe do pedido — P0.
086. [ORDER UI] Aceitar/rejeitar pedido — P0.
087. [ORDER UI] Iniciar produção — P0.
088. [ORDER UI] Marcar pronto — P0.
089. [ORDER UI] Concluir pedido — P0.
090. [ORDER UI] Alerta sonoro de novo pedido — P1.
091. [ORDER UI] Botão de reimpressão — P0.

# Milestone 9 — Produção

092. [KITCHEN] Criar painel de produção — P0.
093. [KITCHEN] Filtrar pedido por estação — P1.
094. [KITCHEN] Exibir tempo de pedido — P1.
095. [KITCHEN] Destaque para atraso — P1.

# Milestone 10 — Pagamentos

096. [PAYMENT] Criar payments — P0.
097. [PAYMENT] Criar PaymentService — P0.
098. [PAYMENT] Pagamento em dinheiro — P1.
099. [PAYMENT] Pix manual — P1.
100. [PAYMENT] Cartão presencial — P1.
101. [PAYMENT] Preparar pagamento dividido — P1.

# Milestone 11 — PDV

102. [PDV] Criar tela principal — P0.
103. [PDV] Navegação de categorias — P1.
104. [PDV] Busca rápida — P1.
105. [PDV] Carrinho lateral — P0.
106. [PDV] Seleção de adicionais — P0.
107. [PDV] Identificar cliente — P1.
108. [PDV] Finalizar pagamento — P0.
109. [PDV] Enviar para produção — P0.
110. [PDV] Imprimir pedido — P0.

# Milestone 12 — Clientes e Dashboard

111. [CUSTOMER UI] Lista de clientes — P1.
112. [CUSTOMER UI] Perfil do cliente — P1.
113. [DASHBOARD] Indicadores principais — P1.
114. [DASHBOARD] Vendas por hora — P2.
115. [DASHBOARD] Produtos mais vendidos — P2.

# Milestone 13 — Qualidade

116. [TEST] Testar PricingService — P0.
117. [TEST] Testar Order State Machine — P0.
118. [TEST] Testar isolamento multiempresa — P0.
119. [TEST] Testar checkout duplicado — P0.
120. [TEST] Testar concorrência de pedido — P0.
121. [TEST] Testar fila de impressão — P0.
122. [TEST] E2E Cardápio → Cozinha — P0.
123. [TEST] E2E PDV → Cozinha — P0.
124. [SECURITY] Hardening de segurança — P0.
125. [PERFORMANCE] Otimização do MVP — P1.
126. [UX] Validação mobile — P0.

## Jornada crítica 1 — Cardápio

Proprietário cria conta/loja → cadastra categoria/produto/adicional → publica → cliente abre no celular → monta pedido → informa endereço → taxa → pagamento → restaurante recebe → aceita → imprime → produção → pronto → entrega/retirada → concluído → cliente e dashboard atualizam.

## Jornada crítica 2 — PDV

Atendente abre PDV → pesquisa produto → adicionais/quantidades → identifica cliente se necessário → seleciona pagamento → cria pedido → imprime/produção → conclui → dashboard atualiza.

## Jornada crítica 3 — Segurança multiempresa

Usuário da Empresa B tenta acessar recurso da Empresa A → servidor/banco negam → nenhum dado é exposto.

## Jornada crítica 4 — Idempotência

Cliente confirma duas vezes ou request é repetida → exatamente um pedido e exatamente um conjunto lógico de impressões.

## Jornada crítica 5 — Preço

Preço muda entre carrinho e checkout → servidor recalcula → cliente recebe informação e confirma valor válido; preço vindo do navegador nunca é autoridade.
