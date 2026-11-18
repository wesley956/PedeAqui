# UX2 — Estado da execução

Atualizado em 17/11/2026. Este arquivo é a fonte para retomar o trabalho entre sessões.

## Referências
- Baseline: `534c3091` (main) · Integração: `ux2/integration`
- Documentos: `00-MARCO-ZERO.md`, `01-MAPA-MESTRE.md`, `DECISOES.md`, `HOMOLOGACAO-LOCAL.md`, `PASSO-A-PASSO-INTEGRACAO.md`
- Trabalho visual anterior: issue #1226 e lotes VISUAL-01 a 06

## Etapas

| Etapa | Estado | Observação |
| --- | --- | --- |
| Marco Zero | Concluído | relatório em `00-MARCO-ZERO.md` |
| Mapa Mestre (estrutural) | Concluído | 119 páginas, 37 APIs, 21 módulos |
| Inventário de funcionalidades com identificador | Não iniciado | feito por módulo, na auditoria de cada um |
| Homologação local (script + CI) | Concluído em Linux; **não executado no Windows** | PR #1322; `HOMOLOGACAO-LOCAL.md` |
| Passo a passo de integração | Concluído | `PASSO-A-PASSO-INTEGRACAO.md` |
| Auditoria com prints (celular e computador) em `ux2/*` | Concluído | `scripts/ux2-auditoria`; prints em `ux2/evidencias`; 306 telas/estados por execução: painel, plataforma, site e acesso; temas claro e escuro; 1366 px e 360 px; print rolado no celular; loja fictícia com fotos, logo e cor própria |
| Fundação visual e navegação | Parcialmente validado | lotes 1–4 integrados (PRs #1323, #1326, #1331); `modulos/fundacao-visual.md` |

## Módulos

Legenda: Validado · Parcialmente validado · Bloqueado · Não iniciado

| Módulo | Estado no UX2 | Observação |
| --- | --- | --- |
| Pedidos | Parcialmente validado | ciclo completo executado na homologação (aceitar → concluir) e funcionando; erro de hidratação corrigido (PR #1335); falta entrega com entregador, recusa, cancelamento |
| PDV | Parcialmente validado | venda em dinheiro com troco executada de ponta a ponta (PR #1335); falta cartão/Pix, divisão, cliente e benefícios; `modulos/pdv.md` |
| Cardápio público e checkout | Parcialmente validado | PRs #1324, #1327, #1331; conferido com fotos, logo e cor de loja fictícios e nos dois temas; falta acompanhar pedido e loja real; `modulos/cardapio-publico.md` |
| Produtos, categorias, sabores | Parcialmente validado | auditado; cor revisada; filtros como botão secundário; `modulos/painel-demais-modulos.md` |
| Caixa, Salão, Produção, Entregas | Parcialmente validado | Caixa confirmado no fluxo crítico. Salão tem correções apenas no banco local (P-01/P-04); produção não confirmada. Salão fora do lote 1. Entregas não executada. |
| Configurações | Parcialmente validado | auditado (19 telas); cor revisada; `modulos/painel-demais-modulos.md` |
| Dashboard e relatórios | Parcialmente validado | Início revisado (PR #1326) |
| Financeiro | Parcialmente validado | formulários de lançamento e transferência cabem no celular (branch `ux2/gestao-celular`); nenhum lançamento executado |
| WhatsApp e atendimento | Bloqueado para validação real | sem sandbox Meta; só tela e testes |
| Pagamentos online | Bloqueado para validação real | sem sandbox dos gateways |
| Impressão | Bloqueado para validação real | sem impressora/agente de teste |
| Fiscal | Bloqueado para validação real | PR #1248 aberto, sem sandbox |
| Administração SaaS (`/platform`) | Parcialmente validado | 31 de 32 telas auditadas (falta a página da empresa); estados em português (PRs #1333, #1337); `modulos/site-acesso-platform.md` |
| Site institucional e acesso | Parcialmente validado | 12 telas auditadas; planos do cadastro em cartões (PR #1337) |

## Bloqueios

| Id | Bloqueio | Impacto | Alternativa |
| --- | --- | --- | --- |
| B-01 | Homologação local ainda não executada no Windows | o responsável ainda não navegou na versão nova | primeira execução do `Iniciar homologacao.cmd` no computador dele |
| B-02 | Sem acesso ao banco de produção (decisão D-03) | hipóteses que dependem de dados reais não podem ser confirmadas | investigar por código e testes |
| B-03 | npm bloqueado no ambiente de trabalho | cada verificação leva ~10 min no CI | nenhuma; aceitar o ciclo |
| B-04 | Sem sandbox de WhatsApp, gateways, iFood, fiscal e impressão | esses módulos não chegam a "Validado" | mocks e testes de contrato; validação real fica pendente |
| B-05 | Resolvido: a main atual já usa Ubuntu 24.04 no check de navegador | não há mais bloqueio por essa versão de Ubuntu | preservar a versão da main na sincronização |
| B-06 | Resolvido na homologação: gateway local sem pool de conexões ociosas | auditoria do lote 1 em 05ea0820: 231 estados/verificações, oito combinações de largura/tema e zero falhas | usar a preparação atual; não repetir escritas automaticamente |


## Registro de execução — 14/11/2026
Integrado em `ux2/integration` (nada na `main`): #1321 documentos, #1322 homologação local, #1323 fundação visual + auditoria, #1324 cardápio do cliente, #1326 correções da auditoria + Início e Pedidos, #1327 produto/carrinho/finalização.

**Por que "parcialmente validado" e não "validado":** tudo passou no CI completo e nos prints (computador 1366 px e celular 360 px) da loja fictícia, mas (1) o responsável ainda não navegou na homologação do computador dele, (2) a loja fictícia não tem fotos nem logo, (3) o tema escuro não foi fotografado.

**Achados que não são visuais**
- `/entregador` mostrava tela de erro para quem não é entregador — corrigido.
- O esquema consolidado `supabase/sql` está atrás das migrações (18 migrações têm objetos que ele não tem). Não afeta a produção; afeta quem monta um banco do zero. A homologação local aplica essas migrações por cima.
- `/vasilhames` em loja que não é de gás lança `ModuleUnavailableError` (tela de erro genérica) — a conferir no módulo de gás.
- Uma falha passageira do banco local ("invalid response from upstream") apareceu 1 vez em 144 telas; não reproduziu.

**Próximos, em ordem:** PDV (fluxo de venda completo), detalhe do pedido, Conversas, Cardápio (gestão), Configurações, Entregas/Salão/Produção, Gestão (financeiro, estoque, clientes), Platform, site institucional e acesso. Em todos: tema escuro e loja com fotos.


## Registro de execução — 14/11/2026 (segunda parte)
Integrado em `ux2/integration`: #1331 (PDV, base do celular, varredura de cor, fotos e tema escuro na auditoria), #1332 (telas de erro em português, PDV no celular), #1333 (site, acesso e plataforma) e o PR da branch `ux2/operacao-ajustes` (Produção, Salão, nomes de recursos do plano).

**Descoberta mais importante:** no celular, nada que deveria ficar preso à tela ficava (barra de pagamento do PDV, etapas, barras "Salvar"). Causa única em `shell.css`; corrigida e conferida com print rolado de 45 telas.

**Nenhum módulo está "Validado".** O critério do UX2 exige uso de ponta a ponta por uma pessoa, e isso depende da primeira execução da homologação no computador do responsável. O que existe é: CI completo verde em todos os PRs e prints de todas as telas alcançáveis, nos dois temas e nos dois tamanhos.

**O que continua sem cobertura:** finalizar venda/pedido de ponta a ponta; telas que dependem de link ou registro específico; integrações reais (B-04); 15 telas de `/platform` com parâmetro.

**Achados não visuais desta parte**
- Erro de hidratação do React em `/pedidos` (#418, texto diferente entre servidor e navegador — provavelmente o tempo decorrido do pedido). Não quebra a tela; a investigar.
- Em Plano e expansão apareciam "Domains custom" e "Scale multiunit" — corrigido.


## Registro de execução — 15/11/2026
Branch `ux2/fluxos`: fluxos de ponta a ponta executados na homologação (`modulos/fluxos-ponta-a-ponta.md`). Caixa, PDV e pedido do cardápio funcionam do começo ao fim. **Salão não envia rodada** por dois defeitos de banco, provavelmente presentes na produção e não confirmados com dados: ver `PENDENCIAS-BANCO.md` (P-01, P-04). Nada foi aplicado na produção.

B-06 esclarecido: as respostas "invalid response from upstream" vêm da porta de entrada do banco local (conexão ociosa encerrada pelo PostgREST e reaproveitada pelo Kong). Não é defeito do sistema nem acontece na produção, que usa outra infraestrutura.


## Registro de execução — 15/11/2026 (segunda parte)
- `main` trazida para `ux2/integration` (PR #1336, sem conflito).
- PR #1337: planos do cadastro em cartões; plataforma auditada quase inteira; Pedido 360° em português.
- Branch `ux2/gestao-celular`: no celular, campos dos formulários de Financeiro, Compras e Fiscal passavam da borda da tela e ficavam inalcançáveis (a página não rola de lado). Corrigido; a auditoria passou a medir campos e botões cortados em todas as telas.

**Nenhum módulo está "Validado"** — o critério continua sendo o uso por uma pessoa na homologação do responsável.


## Retomada — 17/11/2026 (Codex)

- PR #1348 integrado somente em `ux2/integration`: main atual `095aa8dd` preservada, incluindo WhatsApp e segurança de publicação. Nada publicado pelo UX2.
- PR #1339 integrado somente em `ux2/integration`: auditoria reprova falhas; preparo do banco interrompe em erro; gateway local corrigido; roteiro cria pedido novo e acompanha a mesma identidade no painel.
- Lote 1 preparado no PR #1349 (`release/ux2-fundacao`), aplicação `05ea0820`. São 23 arquivos de produto, configuração de fontes, dois verificadores e relatório; nenhum arquivo de banco, workflow de produção ou regra de pagamento/pedido foi alterado nesse lote.
- Homologação exata do lote 1: 231 estados/verificações, 24 passos de fluxo crítico, larguras 360/390/768/1366 nos temas claro e escuro e `failures.json` vazio. Cliente cria pedido → loja aceita e produz → retirada e pagamento → conclusão → acompanhamento público; PDV em dinheiro com troco e caixa também aprovados. O fluxo automático roda no computador; as outras larguras recebem auditoria de tela/estados.
- Evidências: `ux2/evidencias/release_ux2-fundacao`; `COMMIT` identifica a aplicação, `HARNESS_COMMIT` identifica o roteiro e `target.json` registra a CSP adaptada exclusivamente ao banco local. `src/` permanece no commit da aplicação.
- CI e Browser Homologation do head `267b2557` do lote 1 aprovados. Esse último commit altera apenas o relatório; a árvore de `src/` é idêntica à aplicação `05ea0820` auditada. PR #1349 pronto para revisão, sem merge ou publicação; uso manual e autorização do responsável continuam pendentes.
- Status externo Vercel: falha por conta bloqueada, também presente na main de referência. Não foi removido ou desativado; a produção usa o workflow Deploy VPS.
- No Windows, 53 testes afetados por CRLF/caminhos passaram após correção. Dois arquivos de testes nativos tiveram 20 casos aprovados e uma falha de limpeza de pasta temporária protegida por ACL; o instalador não foi alterado.

**Nenhum módulo passa a Validado por esta atualização.** Uso manual pelo responsável, integrações reais e aprovação específica do lote 1 continuam pendentes. Merge na main publica automaticamente; não fazer merge do PR #1349 sem a autorização do responsável prevista no passo a passo.
