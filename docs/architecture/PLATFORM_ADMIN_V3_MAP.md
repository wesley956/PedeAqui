# PedeAqui — Mapa seguro do ADM v3 e arquitetura comercial

Data: 2026-08-29

## Objetivo

Padronizar o Painel do Proprietário (`/platform`) com a experiência visual v3 sem alterar silenciosamente regras de produção e evoluir a venda do PedeAqui para três modelos comerciais compatíveis entre si:

1. pacote pronto;
2. pacote + módulos adicionais;
3. plano personalizado ("Monte seu plano").

A regra central é: **o pacote é uma composição comercial; a autorização operacional continua sendo decidida por RBAC + configuração de módulos + entitlements**.

## Invariantes de segurança

- Nenhuma empresa, unidade, usuário, pedido, assinatura ou integração existente é apagada pela migração visual.
- Planos que já possuem histórico não sofrem hard delete; saem de venda por `active=false` e preservam versões.
- Preços protegidos (`price_locked`) e Plano Fundadores permanecem intactos.
- Alterações comerciais continuam auditadas com motivo, protocolo, ator, aceite e vigência.
- Desativação operacional de módulos continua passando pelos bloqueios já existentes (ex.: caixa aberto, comanda aberta, entrega em andamento e vasilhames em rota).
- O fallback de compatibilidade de restaurantes legados em `ModuleAccessService` permanece preservado para impedir sumiço acidental de telas.
- Suporte não recebe permissões de `super_admin` por mudança visual.
- Mercado Pago, WhatsApp, impressão, checkout e operação do restaurante não são reescritos por esta iniciativa.
- Mudança de navegação não altera URLs funcionais; rotas antigas devem continuar resolvendo ou redirecionar para uma rota canônica.

## Mapa atual do `/platform`

| Área atual | Rota | Fonte principal | Mutação | Destino v3 |
| --- | --- | --- | --- | --- |
| Visão geral | `/platform` | `PlatformAdminService`, `PlatformOwnerOverviewService` | não | Início |
| Apresentação | `/platform/apresentacao` | apresentação comercial | não | Início |
| Empresas/unidades | `/platform#empresas`, `/platform/empresas/[organizationId]/unidades/[storeId]` | overview + `PlatformRestaurant360Service` | suporte modular | Clientes |
| Novo restaurante | `/platform/novo-restaurante` | `PlatformCommercialOnboardingService` | sim, super_admin | Clientes / onboarding |
| Assinaturas | `/platform/assinaturas` | `PlatformCommercialBillingService` | sim, super_admin | Comercial |
| Integrações | `/platform/integracoes` | saúde/configuração de integrações | controlada | Operação |
| Operação | `/platform/operacao` | observabilidade | diagnóstico | Operação |
| Incidentes | `/platform/incidentes` | incident service | controlada | Operação |
| Alertas | `/platform/alertas` | alert service | controlada | Operação |
| Suporte | `/platform/suporte` | support services | controlada | Suporte e Plataforma |
| Modo suporte | `/platform/suporte/modo` | support mode service | controlada | Suporte e Plataforma |
| Integridade | `/platform/integridade` | integrity service | diagnóstico | Suporte e Plataforma |
| Configuração | âncora em `/platform` | múltiplos serviços | dispersa | Produto/Módulos + Configuração |

## Componentes técnicos preservados

### Assinaturas e cobrança

`PlatformCommercialBillingService` já cobre:

- planos e versões;
- preço acordado e preço protegido;
- trial e tolerância;
- cancelamento imediato/agendado;
- suspensão de acesso;
- Plano Fundadores;
- descontos/créditos;
- mensalidades e pagamentos;
- add-ons;
- propostas de upgrade/downgrade/add-on;
- receita prevista por plano e por módulo;
- trilha financeira imutável.

Essa base será **evoluída, não substituída**.

### Módulos

`MODULE_CATALOG` já possui módulos, dependências, tipos de negócio, presets `essential`, `complete` e `custom`.

`ModuleConfigurationService` já protege mudanças com preview, dependências, revisão concorrente e bloqueios operacionais.

`ModuleAccessService` combina:

1. contexto da unidade;
2. RBAC;
3. configuração em `store_modules`;
4. entitlement comercial quando mapeado.

### Entitlements

`organization_entitlement_internal` é o gate comercial server-side. A arquitetura v3 não deve liberar funcionalidades apenas escondendo/mostrando menu no navegador.

## Lacunas confirmadas

### P0 — corrigir antes de escalar venda

1. ADM ainda possui shell visual próprio e não segue completamente o UX v3.
2. Navegação tem muitas entradas planas e mistura negócio, operação e suporte.
3. Não existe uma tela própria "Produto e Módulos" que explique catálogo, dependências e relação com planos.
4. Não existe primeiro nível de visão 360 da **empresa**; hoje a 360 mais rica é da unidade.
5. `/platform/restaurantes/[storeId]` é uma rota intermediária confusa e deve convergir para uma rota canônica.
6. Add-ons possuem contrato/preço, porém o vínculo entre item comercial e módulo operacional precisa ser explícito antes de automatizar ativação/desativação em massa.
7. "Monte seu plano" precisa ser tratado como composição comercial, nunca como `if plan === custom` espalhado pelo produto.

### P1 — backoffice de crescimento

- Central de Pendências;
- CRM/funil comercial;
- gestão completa de usuários/sessões;
- auditoria global pesquisável;
- administração da equipe interna PedeAqui;
- onboarding administrativo com checklist;
- comunicação com clientes;
- indicadores SaaS (MRR, churn, ARPU, conversão de trial etc.).

### P2 — escala/compliance

- LGPD/exportação/anônimização;
- retenção de dados;
- configurações globais/defaults do produto.

## Arquitetura comercial v3

### Modos

`package`
: pacote pronto com conjunto versionado de recursos.

`package_plus_addons`
: pacote pronto + módulos contratados separadamente.

`custom`
: composição montada para o cliente. Deve ter um contrato-base/versionado e módulos selecionados, sem criar regras de acesso especiais no front-end.

### Cálculo

`valor mensal = preço-base acordado + add-ons ativos - ajustes/descontos vigentes`

O preço-base pode vir do plano/versionamento ou de `agreed_price_cents`. Preços vitalícios continuam representados por `price_locked` + motivo.

### Regras comerciais

- Pacote equivalente deve poder ter preço melhor que módulos avulsos.
- Módulo pode ter dependências; a proposta deve exibir o impacto antes do aceite.
- Módulos core não podem ser removidos por composição comercial.
- Módulo indisponível para o tipo de negócio não pode ser vendido.
- Downgrade não pode desligar uma operação em andamento sem resolver bloqueadores.
- Toda mudança de contrato é proposta -> aceite -> vigência/aplicação.
- Alterar catálogo/preço de um plano não reescreve contratos passados.

## Navegação alvo

### Início
- Visão geral
- Apresentação
- Pendências (fase seguinte)

### Clientes
- Empresas e unidades
- Novo cliente
- Onboarding

### Comercial
- Assinaturas
- Propostas e mudanças
- Financeiro PedeAqui

### Produto e módulos
- Pacotes
- Catálogo de módulos
- Monte seu plano
- Dependências e disponibilidade

### Operação
- Operação
- Integrações
- Incidentes
- Alertas

### Suporte e plataforma
- Suporte
- Modo suporte
- Integridade
- Configuração

## Estratégia de rollout

1. **Shell e informação:** padronizar navegação/visual e adicionar Produto e Módulos sem mudar dados de clientes.
2. **Composição comercial:** expor no ADM os três modos de venda usando o motor financeiro existente.
3. **Vínculo comercial-operacional:** automatizar aplicação de módulos somente depois de preview e aceite, preservando bloqueios operacionais.
4. **Cliente 360:** consolidar empresa, unidades, assinatura, módulos, usuários, pendências e auditoria.
5. **Backoffice de escala:** pendências, CRM, auditoria global, equipe interna, LGPD e defaults.

## Critérios de aceite da iniciativa

- `/platform` fica visualmente coerente com o painel operacional v3 em desktop, tablet e celular.
- Nenhuma rota atual deixa de resolver.
- `support` continua somente com capacidades autorizadas.
- Um plano antigo pode ser retirado de novas vendas sem afetar assinantes existentes.
- ADM diferencia claramente pacote, pacote + add-ons e personalizado.
- Catálogo mostra dependências e módulos core/optional/segmentados.
- Nenhuma alteração de composição é aplicada silenciosamente.
- Mudanças comerciais continuam auditáveis e idempotentes.
- Testes/lint/typecheck/build devem passar antes de merge.
