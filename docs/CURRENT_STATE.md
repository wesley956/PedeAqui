# Estado atual e contexto de continuidade

Revisado em **11/10/2026**, sobre `main` no commit `e67f1e99c6f2cad20cd5e24e937997e8ea65df2d`. Atualize esta referência ao revisar novamente; este documento não promete o estado permanente de produção.

## Produto e prioridade

PedeAqui é o sistema que vem sendo trabalhado no projeto ChatGPT “cruz”. O repositório correto é `wesley956/PedeAqui`, não `cruzlabs`.

A prioridade expressa pelo usuário é melhorar **PDV e Pedidos**: aproveitamento do espaço, organização, número de cliques, funções faltantes e lentidão. A orientação é diagnosticar a estrutura existente antes de propor mudanças. Preserve decisões aceitas; não reapresente a interface atual como uma melhoria nova.

## Alterações recentes presentes na main

| Referência | Mudança |
| --- | --- |
| PR #1223, merge `e67f1e99` | Barra inferior de pagamento, recebido, troco, total e Finalizar; itens compactos e pagamento dividido em diálogo |
| PR #1222, merge `7aa5f04b` | Correções de layout, pagamentos e modalidade; diálogo de adicionais e tratamento de erro na busca de cliente |
| Commit `bc271857` | Persistência de consumir no local/levar embora e estabilização da finalização |
| Commit `02e12f29` | RPC de finalização rápida e conferência dos modos de serviço |
| Commit `364ae241` | Preserva formas de pagamento do gestor e limita seleção em lote a 50 pedidos |

Fontes: histórico Git e `docs/reviews/pdv-checkout-bar-2026-10-10.md`, `docs/reviews/pdv-sale-validation-2026-10-10.md`, `docs/reviews/panel-space-validation-2026-10-10.md`.

O relatório da barra do PDV registra **2.714 testes em 409 arquivos e build concluído** na rodada de 10/10. É evidência daquela revisão, não resultado de testes executados nesta preparação.

O histórico da conversa “Avaliação de layout Pdv” relata integração na main e publicação. Nesta preparação, foi confirmado o projeto Vercel `cruz`, equipe `pede-aqui`, Node.js 24.x e domínio `www.pedeaqui.pp.ua`. O preview do PR #1224 aparece READY. O commit atualmente publicado em produção não foi certificado; preview e produção são ambientes distintos.

## Banco: diferença que precisa permanecer visível

- Conector Supabase consultado em 11/10: projeto `idyjinpeijyqcejnunwm`, `ACTIVE_HEALTHY`, região `sa-east-1`, criado em 03/10.
- Consulta somente leitura ao histórico desse projeto retornou como cauda `20261010072147 | ensure_order_quick_finish_atomic`, precedida por `20261010071418 | pdv_fulfillment_consistency`.
- A contagem somente leitura retornou **261 migrações e 184 tabelas públicas**. Não houve auditoria de RLS nesta preparação; quantidade de tabelas não comprova políticas corretas.
- `supabase/production-migrations.json` mantém o ref histórico `zsbsczjhiujnhdznrzck`; `production-migrations-tail.json` foi capturado em 02/10 e termina em `subscription_whatsapp_delivery_ledger`.
- A configuração de homologação de navegador também referencia `idyjinpeijyqcejnunwm`.
- Os números 89 migrações e 113 tabelas/RLS do índice antigo são um snapshot de agosto. Não descrevem automaticamente o ambiente atual.
- `db:drift` local usa `supabase/sql` e baseline + tail. Um resultado local válido não comprova equivalência com o projeto conectado.

A comparação completa por versão/nome confirmou que as 251 entradas locais existem no remoto, sem divergência de nomes; dez entradas remotas são adicionais. Veja o [relatório de reconciliação](DB_HISTORY_RECONCILIATION_20261011.md). A equivalência do SQL/schema e a atualização do baseline permanecem pendentes em tarefa própria. Não trocar apenas o ref no JSON, mascarar divergências nem reaplicar todos os SQLs para fazer o check passar.

### Verificações executadas nesta preparação

- Node.js local: 24.19.0, compatível com o requisito 22+; CI continua configurado com 22.
- `check-route-integrity.mjs`: passou, com 113 páginas e 241 referências internas literais.
- `check-db-drift.mjs`: passou localmente, com 251 migrações no baseline combinado e um SQL local posterior à cauda. A comparação remota por versão/nome encontrou dez entradas adicionais; não houve reconciliação estrutural nem mudança no baseline.
- `production-preflight.mjs`: contratos estáticos passaram; checagem live ignorada por ausência de credenciais específicas.
- Não foram instaladas dependências nem repetidos lint, typecheck, Vitest ou build; esta alteração é de documentação. Os resultados de 10/10 permanecem identificados como históricos.
- Não foram criados pedidos, executadas migrações ou alteradas conexões de impressão. Não foi comandado deploy; previews foram gerados automaticamente pela integração Git da Vercel.

## Impressão e operação

A instalação atual é assistida por arquivo CMD, com tarefa do Windows, watchdog, atualização e spool local. Há suporte a rede TCP/IP e USB via spooler RAW do Windows. Não é um MSI/EXE assinado nem uma confirmação transacional do papel impresso. Leia o README do agente.

A conversa “Ajustar impressão” registra uma conexão secundária desativada para evitar interferência e a principal mantida ativa. A interrupção do processo/inicialização automática no computador secundário depende de atuação local. Credenciais, nomes de equipamentos e dados particulares de lojas ficam fora desta documentação pública. Não reativar conexões durante a preparação do ambiente.

## Limites e pendências

1. Homologação autenticada da barra final, diálogo de adicionais, teclado e pagamento dividido: os relatórios distinguem observações efetivas de bloqueios do navegador e testes de código.
2. Teste físico da impressora pretendida: separado de testes de fila, lease e idempotência.
3. Commit publicado em produção: projeto/equipe/domínio Vercel identificados, mas o commit de produção ainda precisa de conferência.
4. Instalação reprodutível: não há lockfile versionado no snapshot; o CI usa workaround de peers.
5. Fluxo de restaurante por peso/balança: o diagnóstico anterior não identificou suporte nativo pronto. Não oferecer como homologado sem nova análise.
6. Repetição/quantidade de complementos entre cardápio, PDV, salão, cozinha e impressão: validar o canal envolvido antes de assumir equivalência.
7. Integrações externas: presença de código/documento não comprova homologação de Meta, pagamento ou fiscal.

## Como continuar sem perder contexto

- Para uma tarefa de PDV, comece em `src/features/pdv/pos-shell.tsx` e nos testes de pagamentos/modalidade/layout.
- Para pedidos, consulte serviços de workflow/finalização em `src/server/orders`.
- Registre diagnóstico, decisão, arquivos afetados e validação real. Não use contagens antigas como resultado novo.
- Documentação histórica continua disponível no índice; o código atual e evidências recentes prevalecem quando há divergência.
