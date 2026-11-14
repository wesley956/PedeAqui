# UX2 — Estado da execução

Atualizado em 14/11/2026. Este arquivo é a fonte para retomar o trabalho entre sessões.

## Referências
- Baseline: `534c3091` (main) · Integração: `ux2/integration`
- Documentos: `00-MARCO-ZERO.md`, `01-MAPA-MESTRE.md`, `DECISOES.md`
- Trabalho visual anterior: issue #1226 e lotes VISUAL-01 a 06

## Etapas

| Etapa | Estado | Observação |
| --- | --- | --- |
| Marco Zero | Concluído | relatório em `00-MARCO-ZERO.md` |
| Mapa Mestre (estrutural) | Concluído | 119 páginas, 37 APIs, 21 módulos |
| Inventário de funcionalidades com identificador | Não iniciado | feito por módulo, na auditoria de cada um |
| Homologação efêmera em `ux2/*` | Não iniciado | portar de `qa/mobile-audit` |
| Fundação visual e navegação | Não iniciado | depende da decisão D-01 |

## Módulos

Legenda: Validado · Parcialmente validado · Bloqueado · Não iniciado

| Módulo | Estado no UX2 | Observação |
| --- | --- | --- |
| Pedidos | Não iniciado | celular redesenhado em out/2026 (#1274), sem verificação no fluxo personalizado |
| PDV | Não iniciado | |
| Cardápio público e checkout | Não iniciado | carrinho e finalização nunca testados no celular |
| Produtos, categorias, sabores | Não iniciado | |
| Caixa, Salão, Produção, Entregas | Não iniciado | |
| Configurações | Não iniciado | |
| Dashboard e relatórios | Não iniciado | |
| Financeiro | Não iniciado | |
| WhatsApp e atendimento | Bloqueado para validação real | sem sandbox Meta; só tela e testes |
| Pagamentos online | Bloqueado para validação real | sem sandbox dos gateways |
| Impressão | Bloqueado para validação real | sem impressora/agente de teste |
| Fiscal | Bloqueado para validação real | PR #1248 aberto, sem sandbox |
| Administração SaaS (`/platform`) | Não iniciado | 32 telas, nunca auditadas |

## Bloqueios

| Id | Bloqueio | Impacto | Alternativa |
| --- | --- | --- | --- |
| B-01 | Sem homologação permanente | não há endereço para o responsável navegar na versão nova | homologação efêmera no CI com prints; ou concluir #1261 |
| B-02 | Sem acesso ao banco de produção nesta sessão | hipóteses que dependem de dados reais não podem ser confirmadas | investigar por código e testes; reconectar o Supabase do PedeAqui em modo leitura |
| B-03 | npm bloqueado no ambiente de trabalho | cada verificação leva ~10 min no CI | nenhuma; aceitar o ciclo |
| B-04 | Sem sandbox de WhatsApp, gateways, iFood, fiscal e impressão | esses módulos não chegam a "Validado" | mocks e testes de contrato; validação real fica pendente |
