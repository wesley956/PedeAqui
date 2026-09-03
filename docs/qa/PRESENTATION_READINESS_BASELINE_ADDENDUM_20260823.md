# PedeAqui — adendo ao inventário de prontidão em 23/08/2026

Este adendo preserva o baseline congelado de 22/08/2026 e registra superfícies adicionadas posteriormente.

## Institucional e jurídico

- `/empresa` — página institucional pública do PedeAqui.
- `/politica-de-privacidade` — política de privacidade pública.
- `/termos-de-uso` — termos de uso públicos.

## Site comercial público

- `/` — entrada comercial pública para visitantes anônimos; usuários já autenticados preservam o resolvedor contextual do painel.
- `/como-funciona` — jornada comercial do cardápio à confirmação e acompanhamento do pedido.
- `/pedidos-e-atendimento` — explicação do fluxo operacional após a confirmação, incluindo preparo e impressão quando configurados.
- `/entrega-e-fidelizacao` — explicação integrada de bairros, taxas, entregador e benefícios de fidelização conforme módulos ativos.
- `/recursos` — visão comercial dos recursos agrupados pelo problema que resolvem, sem expor detalhes técnicos internos.
- `/planos` — apresentação dos planos e condições comerciais usando apenas preços e regras confirmados no produto.

## Configurações da unidade

- `/configuracoes/loja` — perfil oficial da unidade para identificação, contato, endereço e metadados públicos autorizados. Mantém RBAC, isolamento por organização/unidade e não cria cadastro paralelo de endereço ou telefone.
- `/configuracoes/fluxo-pedidos` — configuração do fluxo operacional da unidade com modos completo, simplificado ou personalizado. No modo personalizado, entrega e retirada possuem checkpoints visuais independentes; ocultar um checkpoint não remove nem enfraquece as máquinas de estado internas de pedido, pagamento, produção ou fulfillment.
- `/configuracoes/operacao` — configuração operacional guiada pelo próprio restaurante. Mostra o impacto antes de salvar, preserva o estado existente, não ativa módulos e mantém delivery manual possível quando a gestão de motoboy está desligada.
- `/configuracoes/impressoes/formato` — configuração de vias e conteúdo do comprovante comercial. Mantém detalhes operacionais obrigatórios na impressão de cozinha e não permite ocultar campos fiscais obrigatórios.

## Painel autenticado do cliente

- `/assinatura` — central de assinatura do cliente, com plano comercial, equivalência funcional, mensalidade, vencimento, histórico e estado da cobrança PIX. Exige `subscription.view` e não expõe credenciais do provedor.
- `/assinatura/contrato` — leitura da versão contratual aplicável e do Anexo Comercial; após o aceite, renderiza o snapshot preservado e permite impressão/salvamento em PDF sem reescrever o documento histórico.
- `/assinatura/contrato/comprovante` — comprovante eletrônico do aceite com protocolo, versão, responsável, condição comercial e hash SHA-256; IP, user-agent e documento opcional do representante permanecem protegidos no registro server-only e não são exibidos nesta superfície.

## Painel do Proprietário

- `/mais-ferramentas` — hub das funções avançadas que saíram da navegação principal simplificada. Mantém acesso às superfícies permitidas por RBAC e disponibilidade de módulos sem remover funcionalidades do sistema.
- `/platform/unidades/[storeId]/configuracao-operacional` — tela dedicada, exclusiva de `super_admin`, para configurar o comportamento operacional dos módulos já habilitados em uma unidade. Não ativa módulos nem altera contrato comercial.
- `/platform/produto` — central comercial do proprietário para visualizar pacotes, catálogo técnico de módulos, aplicar composições transacionais e conferir a prontidão da cobrança SaaS.
- `/platform/pendencias` — central consolidada de pendências operacionais, financeiras e técnicas com filtragem por papel administrativo.
- `/platform/comercial` — CRM e funil de propostas do PedeAqui; superfície exclusiva do proprietário para dados comerciais.
- `/platform/financeiro` — visão financeira SaaS com contratos, mensalidades e indicadores agregados da plataforma.
- `/platform/fundadores` — gestão do Clube Fundadores, mantendo contrato, nível, PedeCoins, benefícios e resgates em trilhas separadas e auditáveis.
- `/platform/auditoria` — auditoria global das mutações administrativas e financeiras da plataforma.
- `/platform/onboarding` — checklist administrativo de implantação de clientes e unidades.
- `/platform/comunicacao` — central administrativa de mensagens e comunicações planejadas para clientes.
- `/platform/equipe` — gestão da equipe interna PedeAqui, incluindo papéis de plataforma e revogação de sessões.
- `/platform/privacidade` — fila administrativa de solicitações de privacidade/LGPD e respectivos protocolos.
- `/platform/configuracoes` — defaults globais não secretos e controle dedicado, auditado e protegido da cobrança SaaS.
- `/platform/operacao/praticidade` — baseline comparativo dos clientes-piloto com métricas técnicas agregadas, sem conteúdo de pedidos, endereços, conversas ou dados financeiros.
- `/platform/empresas/[organizationId]` — visão 360 da empresa, reunindo contrato, unidades, usuários, módulos adicionais, mensalidades, Clube Fundadores, CRM e incidentes sem misturar os domínios técnicos.

## Gestão do cardápio

- `/cardapio/sugestoes` — configuração de categorias complementares sugeridas durante a montagem do pedido. É merchandising da unidade, permanece isolada por organização/loja, não ativa módulos e não altera contrato comercial. Para restaurantes, uma única categoria ativa chamada `Bebidas` pode ser sugerida como bootstrap seguro; depois a configuração é persistida e administrada por ID.

## Operação de pedidos

- `/operacao` — central guiada para conferir prontidão antes da abertura, pausar ou retomar novos pedidos e revisar pendências antes do encerramento. A pausa preserva pedidos existentes e não altera horários; módulos desativados não criam etapas obrigatórias.
- `/movimento` — fila operacional única, atualizada incrementalmente, que prioriza falhas críticas e oferece uma ação principal por pedido conforme atendimento, cozinha ou expedição, sem criar estados paralelos.

- No fluxo simplificado, o quadro operacional possui `Iniciar`, `Pronto` e `Finalizados`. A coluna `Finalizados` representa a etapa em que o restaurante terminou sua operação e o pedido de delivery já iniciou rota (`out_for_delivery`), exibindo `Aguardando confirmação de entrega` até o entregador confirmar.
- No fluxo personalizado, a unidade escolhe checkpoints visuais predefinidos separadamente para entrega e retirada. `Novo` e `Finalizado` permanecem obrigatórios; etapas intermediárias ocultas são agrupadas visualmente sem burlar as transições internas seguras. A operação de rota continua na Central de Entregas.
- Ao confirmar uma entrega com pagamento pendente, o entregador confirma o recebimento por padrão e o PedeAqui liquida o único pagamento pendente de forma atômica junto com a entrega. Pedidos já pagos não recebem uma segunda baixa.
- Se o cliente não pagar ou houver eventualidade, o entregador pode selecionar `Não recebi / houve problema` e deve registrar uma observação. A entrega fica confirmada, o pagamento permanece pendente e a exceção é gravada no histórico/auditoria para não falsificar o financeiro.
- Quando a entrega é confirmada e o pagamento está liquidado, o backend conclui o pedido automaticamente; o pedido terminal deixa o quadro operacional e permanece consultável no histórico.
- `/pedidos/historico` — histórico separado de pedidos realmente concluídos, cancelados e recusados, sem disputar espaço com pedidos em andamento.

## APIs e agentes adicionados posteriormente

- `/api/order-alert/presence` — heartbeat autenticado do painel para o fallback nativo distinguir painel ativo de navegador fechado e respeitar a preferência explícita de som.
- `/api/product-experience/events` — captura autenticada e não bloqueante de eventos de praticidade allowlisted, isolados por organização/unidade e sem dados pessoais desnecessários.
- `/api/print-agent/order-alerts` — endpoint autenticado pelo token do Print Agent para consumir eventos imutáveis de novos pedidos quando o painel não está ativo; não substitui nem bloqueia o alerta web.
- `/api/print-agent/job-style` — endpoint autenticado e restrito ao job atribuído ao Print Agent para recuperar o espaçamento entre linhas preservado no próprio job de impressão.
- `/api/integrations/mercado-pago/oauth/start` — inicia a autorização OAuth do Mercado Pago para a unidade autenticada, usando state e PKCE; conectar a conta não habilita Pix automaticamente.
- `/api/integrations/mercado-pago/oauth/callback` — valida o retorno OAuth, reconfirma organização/unidade e persiste as credenciais somente no servidor/Vault, mantendo o Pix desativado até ativação explícita.
- `/api/internal/payment-reconciliation` — job interno autenticado que reconcilia em lote limitado apenas cobranças Mercado Pago pendentes e atrasadas de unidades com Pix online habilitado, recuperando notificações perdidas sem expor credenciais ou payload bruto do provedor.
- `/api/internal/subscription-renewals` — job interno autenticado de renovação das assinaturas PedeAqui. É invocado pelo scheduler do Supabase e não depende de Vercel Cron.
- `/api/webhooks/subscription-billing/mercado-pago` — webhook dedicado à cobrança SaaS, com assinatura validada e reconciliação idempotente.
- `/api/webhooks/payments/mercado-pago/[storeId]` — continua atendendo pagamentos de pedidos; na unidade que hospeda a autorização OAuth da plataforma, identifica primeiro cobranças de assinatura e preserva o fluxo normal do restaurante para os demais pagamentos.

## Registro de rollout

- 29/08/2026 — novo gatilho de deploy de produção disparado após o merge do UX v3. Alteração exclusivamente documental, sem impacto funcional no painel.
- 29/08/2026 — segundo gatilho de redeploy sem alteração funcional, usado apenas para testar a liberação da cota de builds da Vercel.
- 29/08/2026 — adicionada a superfície `/platform/produto` ao inventário do ADM v3; nesta etapa a composição personalizada era apenas uma simulação administrativa e não modificava contratos reais.
- 30/08/2026 — ADM comercial/backoffice, Clube Fundadores e cobrança SaaS foram estruturados em branch de homologação. O scheduler de renovação fica no Supabase e nasce pausado; não houve publicação na Vercel nem ativação automática de cobrança nesta etapa.
- 30/08/2026 — adicionada a formalização eletrônica da assinatura com contrato versionado, Anexo Comercial imutável, protocolo e SHA-256. O aceite permanece bloqueado enquanto a identificação jurídica da CONTRATADA não estiver completa e ativa; nenhum cliente é marcado como aceito automaticamente.
- 30/08/2026 — adicionadas as superfícies comerciais públicas multipágina e o novo login visual, preservando o roteamento contextual de usuários autenticados e sem alterar cardápio, checkout ou painel operacional.
