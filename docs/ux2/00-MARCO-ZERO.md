# UX2 — Marco Zero (relatório de preparação)

Data: 14/11/2026 · Commit de referência (baseline): `534c3091338962ab7366d7cf9772f21f34e6576b` (main) · Branch de integração: `ux2/integration`, criada nesse commit.

Nenhum código do produto foi alterado neste marco. Só foram criadas a branch de integração e esta documentação.

## 1. Capacidades reais verificadas

| Capacidade | Situação | Evidência / observação |
| --- | --- | --- |
| Ler e modificar o repositório | Disponível | clone, branches e push funcionam |
| Criar branches, PRs e issues | Disponível | `ux2/integration` criada; PRs anteriores #1267–#1274 |
| Executar lint, tipos, testes e build | **Só pelo CI do GitHub** | o registro npm é bloqueado no ambiente de trabalho (403); nada roda localmente |
| Navegar pela aplicação e tirar prints | **Só em ambiente efêmero no CI** | GitHub Actions + Playwright, com Supabase local descartável (ferramenta na branch `qa/mobile-audit`) |
| Abrir o site de produção pelo ambiente de trabalho | Indisponível | a rede do ambiente não alcança `pedeaqui.pp.ua`; só o CI alcança |
| Navegador do computador do responsável | Indisponível nesta sessão | extensão não conectada |
| Banco de dados de produção (Supabase) | **Sem acesso** | o conector Supabase desta sessão aponta para outra conta (projetos de outro produto); o projeto do PedeAqui não aparece |
| Hospedagem (VPS) e logs de produção | Sem acesso | só via workflow `Deploy VPS`, que não será usado |
| Vercel | Conta bloqueada | status "Account is blocked" nos commits; não gera mais prévias |
| Ler logs do GitHub Actions | Parcial | conclusão e anotações sim; log bruto não |

## 2. Como a produção é publicada (e por que as branches ux2 são seguras)

- `Deploy VPS` roda só depois do workflow `CI` terminar com sucesso **em push na `main`** (`workflow_run`, `branches: [main]`, `event == 'push'`). PR ou push em outra branch não publica.
- `deploy-pages` roda só em push na `main`.
- `CI` roda em todo PR. Dois passos dele consultam a produção **somente leitura**: comparação do histórico de migrações (`select` em `schema_migrations`) e `preflight:production` (sem escrita). Isso já acontece em qualquer PR do repositório.
- Push direto em `ux2/*` não dispara nenhum workflow. PR com base em `ux2/integration` dispara só `CI` (e `browser-homologation` / `isolated-chaos` conforme os arquivos tocados).
- A proteção da `main` não pôde ser lida pela API (403). Regra adotada: nenhum PR do UX2 terá a `main` como base.

Conclusão: trabalhar em `ux2/*` e integrar em `ux2/integration` não alcança a produção.

## 3. Isolamento da homologação

**Não existe hoje um ambiente de homologação permanente.** O PR #1261 ("Preparar homologação VPS") está aberto e não foi integrado; a Vercel está bloqueada; não há segundo projeto Supabase acessível.

O único ambiente comprovadamente isolado é o efêmero do CI:

| Recurso | Homologação efêmera (CI) | Separado da produção? |
| --- | --- | --- |
| Banco de dados | Supabase local criado e destruído a cada execução | Sim |
| Credenciais | chaves locais geradas na hora | Sim |
| Armazenamento (fotos) | local, vazio | Sim |
| WhatsApp, pagamentos, iFood, fiscal | sem credenciais: não enviam nem cobram | Sim (por ausência) |
| Impressão | sem agente conectado | Sim (por ausência) |
| Tarefas agendadas | não rodam | Sim |
| Dados | loja fictícia gerada por script | Sim |

Limite desse ambiente: ele prova tela, navegação, regras do banco e fluxos internos. **Não prova integração real** com WhatsApp, gateways, iFood, fiscal ou impressora. Esses módulos só poderão ser classificados como "parcialmente validado" enquanto não houver sandbox de cada provedor.

## 4. Referência técnica inicial

- Next.js 16.2.12 (App Router), React 19.2.8, TypeScript estrito, Supabase (`supabase-js` 2.111, `ssr` 0.12.4), Vitest, Node 22.
- Produção: imagem Docker (`Dockerfile.production`) em VPS, com verificação e rollback no workflow.
- 119 páginas, 37 rotas de API, 21 módulos, 480 arquivos de teste, 234 arquivos SQL canônicos + 81 migrações.
- CI na baseline: `validate`, `build` e `deploy` com sucesso no commit de referência.
- 14 PRs abertos e mais de 40 issues abertas, várias em andamento por outras frentes (WhatsApp, impressão, entrega por distância, PagBank, fiscal, PedeAqui Remote).

## 5. Trabalho visual que já existe (não duplicar)

- Issue **#1226 [MASTER VISUAL]** com decisões aprovadas em 12/10/2026 e lotes #1227, #1229–#1232, #1234 (VISUAL-01 a 06), todos abertos.
- Documentos de sistema visual: `DESIGN_TOKENS.md`, `BUTTON_SYSTEM.md`, `CARD_SYSTEM.md`, `FEEDBACK_SYSTEM.md`, `BRAND_IDENTITY.md`, `VISUAL_IDENTITY_GUARDRAILS.md`.
- Entregue em out/2026 (PRs #1267–#1274): menu reorganizado e personalizável, Disponibilidade, abas, três fases de correção no celular e a lista de pedidos do celular.

O UX2 parte dessas decisões. Onde a proposta nova divergir do padrão aprovado em #1226, a divergência é registrada em `DECISOES.md` e decidida antes de implementar. Divergência já conhecida: #1226 define laranja para "CTA, item ativo e foco"; o guia proposto em 19/10 usa laranja só para a ação principal e escuro para o item selecionado.

## 6. Problemas observados no início

1. Sem homologação permanente (item 3).
2. Sem acesso ao banco de produção: hipóteses da seção 11 do prompt que dependem de dados reais (divergência de contagem de pedidos, filas do WhatsApp presas, confirmação de pagamento) só podem ser investigadas pelo código e por testes, não por dados.
3. Frentes paralelas ativas na `main` (WhatsApp, impressão, entrega): risco de conflito. O UX2 precisa reincorporar a `main` em `ux2/integration` com frequência.
4. A ferramenta de auditoria no celular está numa branch antiga (`qa/mobile-audit`), 33 commits atrás da `main`.
5. Testes majoritariamente de "contrato de texto" (conferem se um trecho existe no código): passam sem provar comportamento.

## 7. Plano de execução

1. **Fundação de homologação** — trazer a auditoria efêmera para `ux2/*` atualizada com a `main`, ampliando para computador (1366 px) além do celular, e para os fluxos que faltam (carrinho, checkout, detalhe do pedido, PDV até finalizar).
2. **Mapa e inventário** — `01-MAPA-MESTRE.md` (feito, estrutural) e inventário de funcionalidades por módulo com identificador, à medida que cada módulo for auditado.
3. **Fundação visual e navegação** — tokens, botões, filtros, ícones e cabeçalhos, alinhados com #1226.
4. **Módulos, na ordem**: Pedidos → PDV → Cardápio público e checkout → Produtos e categorias → Caixa/Salão/Produção/Entregas → Configurações → Dashboard → demais. WhatsApp, pagamentos, impressão e fiscal ficam por último e limitados a tela, por dependerem de sandbox.
5. **Revisão integrada e relatório final**, com plano de publicação gradual.

Cada módulo: auditoria → proposta → branch `ux2/<módulo>` → PR em `ux2/integration` → CI + auditoria efêmera → relatório em `docs/ux2/modulos/`.
