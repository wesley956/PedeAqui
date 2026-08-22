# PedeAqui — Índice Mestre do Projeto

Este documento é a **fonte canônica para retomar o projeto PedeAqui**. Antes de implementar ou alterar qualquer módulo, consulte este índice e os documentos especializados citados abaixo.

## Identidade técnica e de produto

- Produto oficial: **PedeAqui**
- Tagline: **Seu pedido começa aqui.**
- Repositório oficial: **`wesley956/PedeAqui`**
- Repository ID preservado no rename: `1329524264`
- Package técnico: **`pedeaqui`**
- Branch principal: `main`
- GitHub Pages: `https://wesley956.github.io/PedeAqui/`
- Supabase oficial: project ref `zsbsczjhiujnhdznrzck`, região `sa-east-1`
- Observação: o display name do projeto Supabase ainda aparece como `Cruz`; isso é somente um rótulo administrativo legado. **Não recriar o projeto nem trocar o project ref por causa desse nome.**

## Ciclo de prontidão comercial — 22/08/2026

O inventário live, a classificação funcional, o mapa de rotas/módulos/papéis e a política
de massa demonstrativa isolada estão em:

- `qa/PRESENTATION_READINESS_BASELINE_20260822.md`;
- `qa/PRESENTATION_TEST_DATA_20260822.md`.

Esse addendum registra o estado observado antes dos lotes de diagnóstico iniciados no
master GitHub #539. O domínio público canônico para a demonstração é
`https://www.pedeaqui.pp.ua`; a URL antiga `vercel.app` protegida por SSO não deve ser
usada com clientes.

## Objetivo do produto

Construir um SaaS multiempresa/multiunidade para restaurantes e operações de alimentação, centralizando cardápio digital, pedidos, PDV, produção/KDS, impressão, salão, delivery, pagamentos, caixa, clientes/CRM, fidelidade, estoque, compras, financeiro, fiscal, relatórios, marketing, integrações e escala SaaS.

## Princípio arquitetural

Os módulos compartilham entidades e eventos, mas cada domínio preserva sua própria fonte de verdade. Exemplo: `order.completed` pode alimentar estoque, financeiro, CRM e integrações sem transformar o pedido em ledger financeiro, saldo de estoque ou documento fiscal.

A visibilidade de navegação nunca substitui autorização. RLS/RBAC e verificações server-side continuam sendo a fronteira de segurança.

## Identidade visual oficial

Assets canônicos:

- `public/brand/pedeaqui-logo.svg` — lockup horizontal para fundo claro
- `public/brand/pedeaqui-logo-on-dark.svg` — lockup para fundo escuro
- `public/brand/pedeaqui-symbol.svg` — símbolo isolado

Documentação:

- `BRAND_IDENTITY.md` — manual de identidade
- `DESIGN_TOKENS.md` — tokens semânticos
- `STRUCTURAL_TOKENS.md` — tipografia, espaçamento, raios, sombras, motion e densidade
- `BUTTON_SYSTEM.md`, `FORM_SYSTEM.md`, `CARD_SYSTEM.md`, `FEEDBACK_SYSTEM.md`, `DATA_LIST_SYSTEM.md`, `STATUS_LANGUAGE.md` — primitives e padrões de UI
- `COMPONENT_ACCESSIBILITY.md` — regras de acessibilidade dos componentes

A marca da plataforma PedeAqui e o white-label do restaurante são camadas diferentes. O restaurante pode personalizar sua presença pública conforme o contrato de branding, mas isso não redefine os assets canônicos da plataforma.

## Navegação e contextos operacionais

A navegação é contextual e baseada nas permissões existentes. Os contextos operacionais documentados são gestor, gerente, caixa, atendimento, salão, cozinha, entregador e administrativo.

Documentos principais:

- `OPERATIONAL_CONTEXTS.md`
- `CONTEXTUAL_NAVIGATION.md`
- `DESKTOP_NAVIGATION.md`
- `MOBILE_NAVIGATION.md`
- `CONTEXT_START_ROUTE.md`
- `OPERATIONAL_TOPBAR.md`

Deep links explícitos são preservados. A tela inicial sem `next` é escolhida de forma determinística conforme os contextos/permissões disponíveis.

## Módulos consolidados

O núcleo funcional original #001–#253 permanece documentado pelos status abaixo:

- `FOUNDATION_STATUS.md` — #001–#016
- `CATALOG_STATUS.md` — #017–#024
- `MENU_STATUS.md` — #025–#032
- `DELIVERY_STATUS.md` — #033–#035
- `CART_STATUS.md` — #036–#040
- `CHECKOUT_STATUS.md` — #041–#046
- `ORDER_ENGINE_STATUS.md` — #047–#057
- `PRINTING_STATUS.md` — #058–#082
- `ORDER_MANAGER_STATUS.md` — #083–#091
- `KITCHEN_STATUS.md` — #092–#095
- `PAYMENTS_STATUS.md` — #096–#101
- `PDV_STATUS.md` — #102–#110
- `CUSTOMERS_DASHBOARD_STATUS.md` — #111–#115
- `QUALITY_HARDENING_STATUS.md` — #116–#126
- `DINING_STATUS.md` — #127–#139
- `CRM_GROWTH_STATUS.md` — #140–#151
- `CONVERSATIONS_STATUS.md` — #152–#163
- `CASH_STATUS.md` — #164–#174
- `DELIVERY_OPERATIONS_STATUS.md` — #175–#185
- `INVENTORY_RECIPES_STATUS.md` — #186–#198
- `PURCHASES_SUPPLIERS_STATUS.md` — #199–#210
- `FINANCE_STATUS.md` — #211–#224
- `FISCAL_INTEGRATIONS_STATUS.md` — #225–#238
- `PLANS_SCALE_STATUS.md` — #239–#253

Operação atual também inclui as superfícies redesenhadas de Pedidos, KDS/Produção, PDV, Salão/Mesas, Caixa, Entregas/Entregador, Dashboard, Catálogo, Estoque/Fichas, Compras, Financeiro, Fiscal, Configurações, cardápio público, carrinho, checkout e acompanhamento de pedido.

## Ciclo de consolidação visual/técnica [254]–[323]

As issues lógicas `[254]`–`[323]` correspondem às GitHub issues `#284`–`#353`. **Todas estão concluídas.**

| Faixa | Resultado consolidado |
| --- | --- |
| [254]–[261] | identidade oficial PedeAqui, SVGs, manual, componentes de marca, tokens e guardrails |
| [262]–[269] | design system: botões, formulários, cards, feedback, listagens, status, acessibilidade e migração de estilos |
| [270]–[277] | contextos operacionais, matriz de navegação, desktop/mobile, topbar e rotas iniciais |
| [278]–[287] | operação do restaurante: pedidos, KDS, PDV, salão, caixa e entregas |
| [288]–[295] | gestão/admin: dashboard, catálogo, produto, estoque, compras, financeiro, fiscal e configurações |
| [296]–[303] | experiência pública: marca/white-label, menu, produto, adicionais, carrinho, checkout e timeline |
| [304]–[311] | migrations/drift, RLS/RBAC, auth, integrações, legado, performance e observabilidade |
| [312]–[318] | homologação desktop/tablet/mobile, acessibilidade, performance frontend, E2E e segurança final |
| [319] | revisão final do ciclo |
| [320]–[322] | mapa técnico, rename do repositório e validação pós-rename |
| [323] | documentação e baseline final |

Evidências finais:

- `CYCLE_REVIEW_319.md`
- `TECHNICAL_RENAME_MAP_320.md` — **snapshot histórico pré-rename**
- `REPOSITORY_RENAME_321.md`
- `POST_RENAME_INTEGRATIONS_322.md`
- `FINAL_BASELINE_323.md`

## Banco e migrations — baseline final

- Supabase project ref: `zsbsczjhiujnhdznrzck`
- Migrations oficiais reconciliadas: **89**
- Cauda conhecida: `20260813065546 | onboarding_role_permission_conflict_hotfix`
- Baseline versionado: `supabase/production-migrations.json`
- Tabelas públicas verificadas: **113**
- RLS habilitado: **113/113**
- Grants diretos de tabela para `anon`: **0**
- Resíduo dos fixtures E2E na homologação final: **0**
- Órfãos verificados em relações críticas: **0**

O CI executa `npm run db:drift`; quando `SUPABASE_DB_URL` está disponível, também compara o histórico remoto em modo somente leitura.

Advisors: não havia novo alerta crítico no fechamento do ciclo. Permanece conhecido o WARN de **Leaked Password Protection desabilitada** no Supabase Auth. As tabelas server-only com RLS e sem policy/grant de browser continuam documentadas; não criar policies públicas apenas para silenciar INFO do advisor.

## Segurança e autorização

Regras canônicas:

1. tenant/unidade sempre derivados do contexto autorizado, nunca apenas de input do cliente;
2. RLS e RBAC server-side são obrigatórios para dados sensíveis;
3. `service_role` é server-only;
4. navegação contextual é apresentação, não controle de acesso;
5. redirects de auth aceitam somente destinos internos validados;
6. logs usam sanitização/correlação e não devem registrar segredos;
7. fixtures e E2E devem terminar sem resíduos no banco.

Documentos de referência: `FINAL_DB_SECURITY_QA_318.md`, `ACCESS_ISOLATION.md`, `AUTH_HARDENING.md`, `INTEGRATION_INVENTORY.md`, `MONITORING.md` e `LEGACY_EDGE_FUNCTIONS.md` quando aplicáveis.

## CI e homologação

O workflow `.github/workflows/ci.yml` valida, nesta ordem:

1. nome técnico do repositório (`wesley956/PedeAqui`);
2. histórico local de migrations;
3. comparação remota opcional de migrations;
4. lint;
5. typecheck;
6. testes automatizados;
7. E2E por contexto;
8. Print Agent;
9. build Next.js.

A homologação de layout possui contratos para desktop, tablet e celular, além de acessibilidade e performance frontend. O E2E contextual é determinístico e não depende de escrever dados no banco oficial.

## Integrações após o rename

- GitHub: `wesley956/PedeAqui`, mesmo Repository ID histórico.
- GitHub Pages: workflow pós-rename validado; URL `https://wesley956.github.io/PedeAqui/`.
- Supabase: integração continua pelo ref `zsbsczjhiujnhdznrzck`; o display name legado `Cruz` é exceção administrativa conhecida.
- Vercel: o conector disponível ao final do ciclo não expôs nenhum projeto associado; não inventar vínculo.
- Remotes antigos: o GitHub resolve a URL anterior para o repositório renomeado, mas novos clones/configurações devem usar a URL canônica.

Detalhes: `POST_RENAME_INTEGRATIONS_322.md`.

## Homologações externas ainda dependentes de ambiente/fornecedor

Não são falhas de arquitetura, mas dependem de infraestrutura externa real:

- provider fiscal/SEFAZ, certificado e regras específicas por estabelecimento/UF/regime;
- provider real de cobrança para fluxos que exigem adquirente externo;
- provisionamento final de TLS/edge para domínios customizados;
- teste físico final de impressão ESC/POS/hardware;
- proteção contra senhas vazadas deve ser habilitada no painel Supabase Auth quando disponível para o projeto/plano;
- integrações externas não visíveis aos conectores precisam usar as URLs/nome canônicos ao serem configuradas.

## Como retomar o projeto

Antes de começar qualquer nova issue:

1. confirmar que está em `wesley956/PedeAqui` e `main` atualizada;
2. ler este `PROJECT_INDEX.md`;
3. consultar `ARCHITECTURE_DECISIONS.md`, `BRAND_IDENTITY.md` e o status do domínio envolvido;
4. verificar se já existe primitive/componente no design system antes de criar CSS/componente novo;
5. preservar fontes de verdade e boundaries de domínio;
6. criar branch atômica, implementar, rodar CI completo e só então mesclar;
7. para alterações de banco, reconciliar migration local/remota e revisar RLS/advisors;
8. não reintroduzir `cruz` como nome ativo. Referências antigas só são válidas em documentos históricos/rollback explicitamente marcados.

## Perguntas obrigatórias para novos módulos

1. Que entidade existente ele utiliza?
2. Que eventos ele consome?
3. Que eventos ele produz?
4. Quais permissões precisa?
5. Quais dados pertencem à organização e à unidade?
6. Quais ações precisam de auditoria?
7. Qual é a fonte de verdade de cada valor exibido?
8. Qual cenário E2E prova que a mudança não rompe a operação?
