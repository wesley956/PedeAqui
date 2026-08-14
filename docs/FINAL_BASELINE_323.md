# [323] Baseline final do PedeAqui

Data de consolidação: 2026-08-14

Este documento registra o ponto de retomada após o ciclo `[254]–[323]`. A fonte operacional principal continua sendo `PROJECT_INDEX.md`.

## Identidade final

- Produto: **PedeAqui**
- Tagline: **Seu pedido começa aqui.**
- Repositório: `wesley956/PedeAqui`
- Repository ID: `1329524264`
- Package: `pedeaqui`
- Branch canônica: `main`
- Pages: `https://wesley956.github.io/PedeAqui/`

Assets oficiais:

- `../public/brand/pedeaqui-logo.svg`
- `../public/brand/pedeaqui-logo-on-dark.svg`
- `../public/brand/pedeaqui-symbol.svg`

## Design system e UX

O baseline inclui tokens semânticos/estruturais, marca reutilizável, Button, Form Controls, Cards, Feedback, Data List, Status Language, foco/teclado/touch, reduced motion, contraste e guardrails de identidade.

A navegação está organizada por contexto operacional e permissões existentes, com desktop, mobile, topbar e rota inicial contextual. As superfícies operacionais e gerenciais foram reorganizadas para o trabalho real de restaurante, sem transferir segurança do backend para o menu.

## Produto público

O cardápio público é mobile-first e mantém separação entre marca PedeAqui e white-label do restaurante. Produto, adicionais, carrinho, checkout e acompanhamento usam contratos server-side e estados autoritativos, sem cálculo financeiro inventado no cliente.

## Banco e segurança

Supabase oficial:

- project ref: `zsbsczjhiujnhdznrzck`
- região: `sa-east-1`
- migrations reconciliadas: **89**
- migration final conhecida: `20260813065546 | onboarding_role_permission_conflict_hotfix`
- tabelas públicas: **113**
- RLS: **113/113**
- grants diretos de tabela para `anon`: **0**
- resíduos E2E na homologação final: **0**
- órfãos críticos verificados: **0**

O display name `Cruz` ainda pode aparecer no painel Supabase. É uma exceção administrativa documentada: o conector disponível não oferece rename seguro apenas do rótulo. O `project_ref` não deve ser trocado e o projeto não deve ser recriado para corrigir esse nome visual.

Advisor conhecido: Leaked Password Protection permanece desabilitada no Supabase Auth. Esse WARN deve ser resolvido por configuração apropriada no painel/plano, sem alteração de schema.

## CI e qualidade

O CI canônico valida:

1. repository name `wesley956/PedeAqui`;
2. migration drift local;
3. migration drift remoto quando a credencial de leitura existe;
4. lint;
5. typecheck;
6. testes automatizados;
7. E2E por contexto;
8. Print Agent;
9. build.

Também existem homologações automatizadas de desktop, tablet, mobile, acessibilidade e performance frontend.

## Integrações

- GitHub Actions: validado no repository object renomeado.
- GitHub Pages: deploy pós-rename validado com sucesso.
- Git remotes: novos clones devem usar `https://github.com/wesley956/PedeAqui.git`; a URL antiga redireciona para o mesmo repository object.
- Supabase: integração preservada pelo ref estável.
- Vercel: o conector disponível no fechamento do ciclo retornou zero projetos; nenhum vínculo foi inventado ou alterado.
- Integrações fiscais, cobrança, impressão e demais providers permanecem desacopladas por adapters/contratos e devem ser homologadas contra fornecedores/hardware reais quando aplicável.

## Rastreamento do ciclo

As issues lógicas `[254]–[323]` correspondem às GitHub issues `#284–#353`. O ciclo cobre:

- [254]–[261] identidade;
- [262]–[269] design system;
- [270]–[277] navegação/contextos;
- [278]–[287] operação;
- [288]–[295] gestão;
- [296]–[303] experiência pública;
- [304]–[311] banco/backend/segurança;
- [312]–[318] homologação e E2E;
- [319] revisão final;
- [320]–[322] rename técnico e integrações;
- [323] baseline final.

## Documentos de retomada

Leia, nesta ordem:

1. `PROJECT_INDEX.md`
2. `ARCHITECTURE_DECISIONS.md`
3. `BRAND_IDENTITY.md`
4. o arquivo `*_STATUS.md` ou `*_UI.md` do domínio em questão
5. `CYCLE_REVIEW_319.md` para evidência de fechamento do ciclo
6. `POST_RENAME_INTEGRATIONS_322.md` para qualquer assunto de GitHub/Supabase/Vercel/remotes

`TECHNICAL_RENAME_MAP_320.md` é um **snapshot histórico pré-rename**, não o estado técnico atual.

## Pendências externas conhecidas

- habilitar Leaked Password Protection no Supabase Auth quando disponível/configurável;
- homologar provider fiscal/SEFAZ e certificados reais por estabelecimento;
- homologar provider de cobrança real onde necessário;
- validar impressão ESC/POS em hardware físico;
- provisionar TLS/edge final para domínios customizados quando o fluxo entrar em produção;
- configurar qualquer integração externa não visível aos conectores usando o nome/repo canônicos.

Nenhuma dessas pendências autoriza reintroduzir o nome técnico antigo como referência ativa do produto.
