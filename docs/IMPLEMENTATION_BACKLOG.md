# PedeAqui — Backlog Técnico Mestre

Versão 1.8 — execução consolidada até Planos, Escala e White-label (#253).

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

# Milestone 14 — Salão

127. [DINING] Criar mesas — P0.
128. [DINING] Criar TableService e estados — P0.
129. [DINING] Criar comandas — P0.
130. [DINING] Criar participantes da comanda — P1.
131. [DINING] Abrir, transferir e encerrar comanda — P0.
132. [DINING] Vincular pedidos e itens à comanda — P0.
133. [DINING] Lançar rodada pelo garçom — P0.
134. [DINING] Integrar rodada com produção e impressão — P0.
135. [DINING UI] Criar painel de mesas — P0.
136. [DINING UI] Criar detalhe da mesa/comanda — P0.
137. [DINING] Gerar conta da comanda — P0.
138. [DINING] Dividir conta e integrar pagamentos — P0.
139. [DINING] QR público da mesa — P1.

# Milestone 15 — CRM e Crescimento

140. [CRM] Criar cupons e regras de elegibilidade — P1.
141. [PRICING] Integrar cupons ao preço autoritativo — P0.
142. [CRM] Criar contas e ledger de cashback — P0.
143. [CRM] Implementar acúmulo e resgate de cashback — P0.
144. [LOYALTY] Criar contas e ledger de pontos — P0.
145. [LOYALTY] Implementar regras de acúmulo e resgate de pontos — P1.
146. [CRM] Criar segmentação dinâmica de clientes — P1.
147. [MARKETING] Criar campaigns — P1.
148. [MARKETING] Criar campaign_recipients e snapshots de público — P1.
149. [AUTOMATION] Criar automation_rules e automation_runs — P1.
150. [CRM UI] Criar painel de crescimento e fidelidade — P1.
151. [CRM] Consumir order.completed no motor de crescimento — P0.

# Milestone 16 — Conversas / WhatsApp / IA

152. [CONVERSATIONS] Criar contacts omnichannel e vínculo com customers — P0.
153. [CONVERSATIONS] Criar conversations — P0.
154. [CONVERSATIONS] Criar messages — P0.
155. [CONVERSATIONS] Criar State Machine e histórico de atendimento — P0.
156. [CONVERSATIONS UI] Criar Inbox `/conversas` — P0.
157. [WHATSAPP] Criar provider adapter desacoplado — P1.
158. [WHATSAPP] Criar webhook seguro e idempotente — P0.
159. [WHATSAPP] Implementar resposta humana outbound — P0.
160. [AUTOMATION] Criar automation_sessions de conversa — P1.
161. [CONVERSATIONS] Implementar handoff Bot → Fila → Humano → Encerrado — P0.
162. [AI] Criar IA com allowlist de ferramentas autorizadas — P0.
163. [TEST] E2E Conversa/WhatsApp → atendimento → cliente/pedido — P0.

# Milestone 17 — Caixa

164. [CASH] Criar caixas configuráveis por unidade — P0.
165. [CASH] Criar sessões de caixa por turno — P0.
166. [CASH] Criar ledger imutável de movimentos — P0.
167. [CASH] Implementar abertura de caixa — P0.
168. [CASH] Implementar suprimento e sangria — P0.
169. [CASH] Integrar pagamentos em dinheiro ao caixa — P0.
170. [CASH] Integrar estornos e compensações — P0.
171. [CASH] Calcular saldo esperado e conciliação — P0.
172. [CASH] Implementar fechamento e conferência de caixa — P0.
173. [CASH] Criar histórico e relatório de sessões — P1.
174. [CASH UI] Criar painel `/caixa` e E2E operacional — P0.

# Milestone 18 — Entregas operacionais / Entregadores

175. [DELIVERY] Criar cadastro de entregadores — P0.
176. [DELIVERY] Implementar disponibilidade e capacidade do entregador — P0.
177. [DELIVERY] Criar execução logística por pedido — P0.
178. [DELIVERY] Criar histórico de atribuição e execução — P0.
179. [DELIVERY] Implementar atribuição e reatribuição atômicas — P0.
180. [DELIVERY] Integrar ciclo do entregador ao fulfillment do pedido — P0.
181. [DELIVERY] Centralizar cotação autoritativa por endereço — P0.
182. [DELIVERY] Criar fila operacional e SLA em tempo real — P1.
183. [DELIVERY UI] Criar painel `/entregas` — P0.
184. [DRIVER UI] Criar visão mobile `/entregador` — P0.
185. [DELIVERY] Hardening, eventos, segurança e E2E — P0.

# Milestone 19 — Estoque e Fichas Técnicas

186. [INVENTORY] Criar catálogo de insumos e vínculo por unidade — P0.
187. [INVENTORY] Criar ledger imutável de movimentos — P0.
188. [INVENTORY] Criar projeção de saldo por unidade — P0.
189. [INVENTORY] Implementar entradas, perdas, ajustes e transferências — P0.
190. [RECIPE] Criar fichas técnicas versionadas por produto — P0.
191. [RECIPE] Criar itens da ficha técnica e quantidades exatas — P0.
192. [RECIPE] Calcular custo estimado da ficha técnica — P1.
193. [INVENTORY] Baixar estoque ao concluir pedido — P0.
194. [INVENTORY] Criar estoque mínimo e alertas de reposição — P1.
195. [INVENTORY UI] Criar painel `/estoque` — P0.
196. [RECIPE UI] Criar painel de fichas técnicas — P0.
197. [INVENTORY] Implementar contagem e reconciliação de estoque — P0.
198. [INVENTORY] Hardening, segurança, concorrência e E2E — P0.

# Milestone 20 — Compras e Fornecedores

199. [SUPPLIER] Criar cadastro de fornecedores — P0.
200. [SUPPLIER] Configurar fornecedor por unidade — P1.
201. [SUPPLIER] Vincular insumos a fornecedores — P0.
202. [PURCHASE] Criar pedidos de compra — P0.
203. [PURCHASE] Criar itens do pedido de compra — P0.
204. [PURCHASE] Implementar ciclo de vida do pedido de compra — P0.
205. [PURCHASE] Criar recebimentos parciais e finais — P0.
206. [PURCHASE] Integrar recebimento ao estoque e custo médio — P0.
207. [PURCHASE] Tratar divergências e correções de recebimento — P0.
208. [PURCHASE] Criar sugestões de reposição a partir do estoque mínimo — P1.
209. [PURCHASE UI] Criar painéis de fornecedores e compras — P0.
210. [PURCHASE] Hardening, segurança, concorrência e E2E — P0.

# Milestone 21 — Financeiro / DRE

211. [FINANCE] Criar contas financeiras — P0.
212. [FINANCE] Criar categorias financeiras — P0.
213. [FINANCE] Criar ledger financeiro imutável — P0.
214. [FINANCE] Criar contas a receber a partir de vendas/pagamentos — P0.
215. [FINANCE] Criar contas a pagar a partir de compras — P0.
216. [FINANCE] Implementar liquidação de recebíveis e pagáveis — P0.
217. [FINANCE] Implementar transferências entre contas financeiras — P0.
218. [FINANCE] Criar receitas e despesas manuais — P0.
219. [FINANCE] Separar competência e regime de caixa — P0.
220. [FINANCE] Criar DRE gerencial — P0.
221. [FINANCE] Criar fluxo de caixa e projeções — P1.
222. [FINANCE] Integrar Caixa e Financeiro sem duplicar dinheiro — P0.
223. [FINANCE UI] Criar painel `/financeiro` — P0.
224. [FINANCE] Hardening, segurança, concorrência e E2E — P0.

# Milestone 22 — Fiscal e Integrações

225. [FISCAL] Criar perfil fiscal por unidade — P0.
226. [FISCAL] Criar classificação fiscal versionada por produto — P0.
227. [FISCAL] Criar documentos, itens e snapshots fiscais — P0.
228. [FISCAL] Criar State Machine e histórico fiscal independentes do pedido — P0.
229. [FISCAL] Criar fila persistente de emissão/cancelamento com lease e retry — P0.
230. [FISCAL] Criar contrato e registry de providers fiscais — P0.
231. [FISCAL] Implementar emissão, cancelamento e contingência provider-agnostic — P0.
232. [FISCAL] Persistir XML/DANFE em storage privado com integridade — P0.
233. [FISCAL] Implementar webhook fiscal assinado e idempotente — P0.
234. [FISCAL UI] Criar painel `/fiscal` — P0.
235. [FISCAL] Criar saúde, reconciliação e observabilidade — P1.
236. [INTEGRATION] Criar registry genérico e webhooks outbound duráveis — P0.
237. [INTEGRATION] Proteger secrets, assinatura e egress de integrações — P0.
238. [FISCAL] Hardening, segurança, índices e E2E — P0.

# Milestone 23 — Planos, Escala e White-label

239. [PLAN] Criar catálogo de planos e features — P0.
240. [PLAN] Vincular features aos planos com limites — P0.
241. [SUBSCRIPTION] Criar assinaturas por organização — P0.
242. [ENTITLEMENT] Criar EntitlementService e feature flags server-side — P0.
243. [ENTITLEMENT] Criar medição de uso e enforcement de limites — P0.
244. [SUBSCRIPTION] Implementar ciclo de vida da assinatura — P0.
245. [BILLING] Criar adapter de billing e webhooks de assinatura — P0.
246. [PLATFORM UI] Criar console SaaS de planos e assinaturas — P1.
247. [BRANDING] Criar branding e white-label por organização — P1.
248. [DOMAIN] Criar domínios personalizados e verificação DNS — P1.
249. [SCALE] Criar grupos de franquia e multiunidade avançada — P1.
250. [SCALE] Criar central de compras multiunidade — P1.
251. [BI] Criar BI agregado multiunidade — P1.
252. [INTEGRATION] Criar catálogo/marketplace de integrações — P1.
253. [SCALE] Hardening, segurança e E2E de escala — P0.

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

## Jornada crítica 6 — Salão

Garçom abre mesa → comanda nasce → participantes podem ser identificados → rodada waiter/QR vira pedido normal → confirmação imprime e envia à cozinha → novas rodadas acumulam na mesma comanda → conta é dividida por pessoa ou valor → pagamentos reutilizam o motor financeiro de pedidos → saldo zera → pedidos são servidos/concluídos → mesa entra em limpeza e volta a ficar disponível.

## Jornada crítica 7 — Crescimento

Cliente identificado recebe/usa benefício → servidor revalida cupom/saldo/pontos → pedido grava snapshots e ledgers → cancelamento/rejeição gera compensação → `order.completed` concede recompensas idempotentes → segmento dinâmico seleciona público → campanha congela recipients → automação cria execução única por evento/data sem acoplar provedor externo ao motor de pedidos.

## Jornada crítica 8 — Caixa

Operador abre um caixa com saldo inicial → venda em dinheiro cria movimento físico exatamente uma vez → suprimentos/sangrias ficam auditados → estorno gera movimento compensatório → saldo esperado é derivado no banco → operador informa dinheiro contado → diferença é registrada → turno é fechado → nova venda em dinheiro exige nova sessão aberta.

## Jornada crítica 9 — Entrega operacional

Cliente informa/seleciona endereço → servidor calcula elegibilidade, taxa e ETA pela unidade/zona configurada → checkout revalida o frete antes de criar o pedido → produção termina → expedição envia para fila → entregador disponível é atribuído → retirada → saiu para entrega → entregue → histórico/auditoria permanecem íntegros → pedido só conclui quando as regras de pagamento e fulfillment existentes permitirem.

## Jornada crítica 10 — Estoque

Pedido concluído → receita válida na confirmação é resolvida → produto e adicionais consomem insumos no ledger exatamente uma vez → saldo projetado atualiza → estoque mínimo pode gerar alerta → contagem física gera apenas ajuste compensatório → nenhuma tela sobrescreve o saldo diretamente.

## Jornada crítica 11 — Compras

Estoque abaixo do mínimo gera sugestão → operador escolhe fornecedor → pedido de compra guarda snapshots de embalagem/conversão/custo → pedido é enviado → recebimento parcial/final converte para unidade-base → ledger de estoque e custo médio atualizam na mesma transação → divergência gera correção compensatória imutável → Financeiro consome os fatos de compra sem acoplamento ao estoque.

## Jornada crítica 12 — Financeiro

Pedido concluído reconhece receita por competência → pagamento real liquida recebível na conta correspondente → consumo de estoque reconhece CPV → recebimento de compra gera pagável sem antecipar CPV → prazo do fornecedor fica congelado no pedido → liquidações e transferências afetam contas → DRE usa competência → fluxo usa movimentos realizados → reembolso e correção geram compensações sem apagar histórico → Caixa, Pagamentos, Compras e Estoque continuam fontes de verdade dos próprios domínios.


## Jornada crítica 13 — Fiscal

Pedido elegível → snapshot fiscal imutável → fila persistente → provider fiscal → autorizado/rejeitado/contingência → XML/DANFE privado → webhook/reconciliação → cancelamento compensatório, sem alterar a State Machine do pedido.

## Jornada crítica 14 — Planos e Escala

Organização recebe plano → RBAC valida quem pode e entitlement valida o que foi contratado → limites são aplicados no servidor → white-label/domínio/grupos respeitam quotas e isolamento → central de compras e BI agregam fontes existentes → adapters aprovados entram pelo marketplace → billing altera a assinatura por eventos idempotentes.