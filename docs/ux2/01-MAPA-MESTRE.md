# Mapa Mestre do PedeAqui (UX2)

Gerado a partir do código no commit de referência `534c3091` (main, 14/11/2026). Inventário estrutural: o que existe no código. **Não** significa que cada item foi aberto e testado — a coluna de verificação fica em `ESTADO.md`.

## 1. Números

| Item | Quantidade |
| --- | --- |
| Páginas (rotas com tela) | 119 |
| — Site institucional | 10 |
| — Acesso e primeiro uso | 8 |
| — Painel da loja | 59 |
| — Cardápio público e pedido do cliente | 10 |
| — Administração SaaS (/platform) | 32 |
| Rotas de API / webhooks / retornos | 37 |
| Módulos do painel (module-catalog) | 21 |
| Arquivos de teste (tests/) | 480 |
| Arquivos SQL canônicos (supabase/sql) | 234 |
| Migrações versionadas (supabase/migrations) | 81 |
| Documentos em docs/ | 150 |

## 2. Módulos do painel

| Chave | Nome | Grupo | Para que serve |
| --- | --- | --- | --- |
| `dashboard` | Dashboard | Gestão | Resumo operacional da unidade |
| `orders` | Pedidos | Operação | Núcleo de pedidos e acompanhamento |
| `conversations` | Conversas | Relacionamento | Atendimento e WhatsApp |
| `dining` | Salão | Operação | Mesas e comandas |
| `catalog` | Cardápio | Administração | Produtos, categorias e opções |
| `pdv` | PDV | Operação | Venda direta no balcão |
| `cash` | Caixa | Operação | Abertura, movimentação e fechamento |
| `finance` | Financeiro | Gestão | Contas, relatórios e visão financeira |
| `fiscal` | Fiscal | Administração | Operações e integrações fiscais |
| `production` | Produção | Operação | Fila de preparo |
| `deliveries` | Entregas | Operação | Gestão das entregas |
| `driver` | Meu roteiro | Operação | Execução pelo entregador |
| `inventory` | Estoque | Suprimentos | Saldos e movimentos |
| `gas_containers` | Vasilhames | Suprimentos | Trocas e saldo de vasilhames (gás/água) |
| `suppliers` | Fornecedores | Suprimentos | Cadastro de fornecedores |
| `purchases` | Compras | Suprimentos | Pedidos de compra e recebimento |
| `customers` | Clientes | Relacionamento | Cadastro, endereços e histórico |
| `growth` | Crescimento | Relacionamento | Fidelidade, cupons e campanhas |
| `scale` | Plano e expansão | Administração | Plano, várias unidades, marca própria |
| `team` | Equipe | Administração | Usuários, papéis e acesso |
| `settings` | Configurações | Administração | Configuração da unidade |

Acesso: cada módulo depende de (a) estar ligado para a loja (`store_modules`), (b) plano contratado (entitlements) e (c) permissão do papel (RBAC por módulo, com escopo global/organização/loja). Papéis de sistema criados no cadastro: `owner`, `manager`, `cashier`, `attendant`, `kitchen`, `waiter`, `driver`. Administração SaaS usa papéis próprios: `super_admin`, `support`.

## 3. Páginas por área

### Site institucional (10)

- `/`
- `/como-funciona`
- `/empresa`
- `/entrega-e-fidelizacao`
- `/pedidos-e-atendimento`
- `/planos`
- `/politica-de-privacidade`
- `/privacidade`
- `/recursos`
- `/termos-de-uso`

### Acesso e primeiro uso (8)

- `/acesso-entregador`
- `/cadastro`
- `/convite`
- `/login`
- `/nova-senha`
- `/onboarding`
- `/primeiro-acesso-entregador`
- `/recuperar-senha`

### Painel da loja (59)

- `/acesso-negado`
- `/assinatura`
- `/assinatura/contrato`
- `/assinatura/contrato/comprovante`
- `/caixa`
- `/cardapio/adicionais`
- `/cardapio/categorias`
- `/cardapio/disponibilidade`
- `/cardapio/produtos`
- `/cardapio/produtos/[id]`
- `/cardapio/produtos/novo`
- `/cardapio/promocoes`
- `/cardapio/sugestoes`
- `/clientes`
- `/clientes/[id]`
- `/compras`
- `/configuracoes`
- `/configuracoes/caixa`
- `/configuracoes/cardapio`
- `/configuracoes/conversas`
- `/configuracoes/entrega`
- `/configuracoes/entregadores`
- `/configuracoes/fluxo-pedidos`
- `/configuracoes/horarios`
- `/configuracoes/impressoes`
- `/configuracoes/impressoes/formato`
- `/configuracoes/impressoes/gerenciar`
- `/configuracoes/integracoes`
- `/configuracoes/loja`
- `/configuracoes/modulos`
- `/configuracoes/operacao`
- `/configuracoes/pagamentos`
- `/configuracoes/salao`
- `/conversas`
- `/crescimento`
- `/crescimento/campanhas`
- `/dashboard`
- `/entregador`
- `/entregas`
- `/equipe`
- `/escala`
- `/estoque`
- `/estoque/fichas`
- `/financeiro`
- `/fiscal`
- `/fornecedores`
- `/mais-ferramentas`
- `/meu-menu`
- `/movimento`
- `/operacao`
- `/pdv`
- `/pedidos`
- `/pedidos/[id]`
- `/pedidos/historico`
- `/producao`
- `/recurso-indisponivel`
- `/salao`
- `/salao/[tableId]`
- `/vasilhames`

### Cardápio público e pedido do cliente (10)

- `/m/[slug]`
- `/m/[slug]`
- `/m/[slug]/(.)produto/[id]`
- `/m/[slug]/[...rest]`
- `/m/[slug]/carrinho`
- `/m/[slug]/checkout`
- `/m/[slug]/meus-pedidos`
- `/m/[slug]/pedido/[id]`
- `/m/[slug]/produto/[id]`
- `/mesa/[code]`

### Administração SaaS (/platform) (32)

- `/platform`
- `/platform/alertas`
- `/platform/apresentacao`
- `/platform/assinaturas`
- `/platform/auditoria`
- `/platform/comercial`
- `/platform/comunicacao`
- `/platform/configuracoes`
- `/platform/demo`
- `/platform/empresas/[organizationId]`
- `/platform/empresas/[organizationId]/unidades/[storeId]`
- `/platform/equipe`
- `/platform/financeiro`
- `/platform/fundadores`
- `/platform/incidentes`
- `/platform/integracoes`
- `/platform/integridade`
- `/platform/novo-restaurante`
- `/platform/onboarding`
- `/platform/operacao`
- `/platform/operacao/pedidos/[orderId]`
- `/platform/operacao/praticidade`
- `/platform/pendencias`
- `/platform/privacidade`
- `/platform/produto`
- `/platform/restaurantes/[storeId]`
- `/platform/suporte`
- `/platform/suporte/modo`
- `/platform/unidades/[storeId]`
- `/platform/unidades/[storeId]/configuracao-operacional`
- `/platform/unidades/[storeId]/whatsapp`
- `/platform/unidades/[storeId]/whatsapp/notificacoes`

## 4. APIs, webhooks e tarefas agendadas

| Rota | Métodos | Tipo |
| --- | --- | --- |
| `/api/conversations/[conversationId]/media/[mediaId]` | GET | Painel |
| `/api/conversations/[conversationId]/messages` | GET | Painel |
| `/api/health` | GET | Painel |
| `/api/integrations/mercado-pago/oauth/callback` | GET | Retorno de autenticação/OAuth |
| `/api/integrations/mercado-pago/oauth/start` | GET | Retorno de autenticação/OAuth |
| `/api/integrations/pagbank/oauth/callback` | GET | Retorno de autenticação/OAuth |
| `/api/integrations/pagbank/oauth/start` | GET | Retorno de autenticação/OAuth |
| `/api/internal/campaign-messages` | GET | Tarefa agendada (CRON_SECRET) |
| `/api/internal/conversation-auto-close` | GET | Tarefa agendada (CRON_SECRET) |
| `/api/internal/ifood-order-intake` | GET | Tarefa agendada (CRON_SECRET) |
| `/api/internal/order-notifications` | GET | Tarefa agendada (CRON_SECRET) |
| `/api/internal/payment-reconciliation` | GET | Tarefa agendada (CRON_SECRET) |
| `/api/internal/route-retention` | GET | Tarefa agendada (CRON_SECRET) |
| `/api/internal/subscription-renewals` | GET | Tarefa agendada (CRON_SECRET) |
| `/api/order-alert/events` | GET | Painel |
| `/api/order-alert/presence` | POST | Painel |
| `/api/print-agent/ack` | POST | Agente de impressão |
| `/api/print-agent/claim` | POST | Agente de impressão |
| `/api/print-agent/config` | POST | Agente de impressão |
| `/api/print-agent/diagnostics/result` | POST | Agente de impressão |
| `/api/print-agent/fail` | POST | Agente de impressão |
| `/api/print-agent/heartbeat` | POST | Agente de impressão |
| `/api/print-agent/job-style` | POST | Agente de impressão |
| `/api/print-agent/order-alerts` | POST | Agente de impressão |
| `/api/printing/health` | GET | Agente de impressão |
| `/api/product-experience/events` | POST | Painel |
| `/api/webhooks/billing/[providerKey]` | POST | Webhook externo (entrada) |
| `/api/webhooks/fiscal/[integrationId]` | POST | Webhook externo (entrada) |
| `/api/webhooks/payments/infinitepay/[storeId]` | POST | Webhook externo (entrada) |
| `/api/webhooks/payments/mercado-pago/[storeId]` | POST | Webhook externo (entrada) |
| `/api/webhooks/payments/pagbank/[storeId]` | POST | Webhook externo (entrada) |
| `/api/webhooks/subscription-billing/mercado-pago` | POST | Webhook externo (entrada) |
| `/api/webhooks/whatsapp` | GET,POST | Webhook externo (entrada) |
| `/auth/callback` | GET | Retorno de autenticação/OAuth |
| `/m/[slug]/pedido-atual` | GET | Cardápio público (retorno/acesso) |
| `/m/[slug]/pedido/[id]/acesso` | GET | Cardápio público (retorno/acesso) |
| `/m/[slug]/pedido/[id]/infinitepay/retorno` | GET | Cardápio público (retorno/acesso) |

## 5. Integrações externas (efeitos fora do sistema)

| Integração | Onde aparece | Risco em teste |
| --- | --- | --- |
| WhatsApp / Meta Cloud API | `/api/webhooks/whatsapp`, conversas, notificações de pedido, campanhas | Envia mensagem real e gera custo |
| Mercado Pago | OAuth, webhook de pagamento por loja, cobrança de assinatura | Cobrança real |
| PagBank | OAuth, webhook (homologação externa pendente, issue #1259) | Cobrança real |
| InfinitePay | Webhook e retorno do checkout | Cobrança real |
| iFood | `/api/internal/ifood-order-intake` | Cria pedido real |
| Fiscal (Focus NFe, PR #1248 aberto) | `/api/webhooks/fiscal/...` | Emite documento fiscal |
| Agente de impressão (Windows) | `/api/print-agent/*` | Imprime em impressora física da loja |
| Supabase (banco, auth, storage, realtime) | Todo o sistema | Dados reais de lojas |
| Tarefas agendadas | 7 rotas `/api/internal/*` | Notificações, renovações, conciliação |

## 6. Áreas ainda não verificadas em uso real

Tudo o que depende de integração externa ou de papel diferente de dono: WhatsApp e robô, pagamentos online, iFood, fiscal, impressão, app do entregador logado como entregador, administração SaaS (`/platform`, 32 telas), convite e primeiro acesso. A verificação anterior (out/2026) cobriu 67 telas no celular com uma loja fictícia; desde então a main recebeu 33 commits (197 arquivos alterados, até o PR #1320).

