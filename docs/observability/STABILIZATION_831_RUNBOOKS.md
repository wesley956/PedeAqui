# Estabilização #831 — observabilidade, alertas e runbooks

## Contrato de alerta

O indicador de saúde é diagnóstico operacional, não uma nova state machine. Nenhum alerta altera pedido, pagamento, entrega ou impressão automaticamente.

Cada alerta precisa ter:
- severidade P0–P3;
- origem (`Sistema`, `Integração` ou `Equipamento local`);
- causa em linguagem operacional;
- impacto possível;
- próxima ação segura;
- identificador estável para deduplicação;
- condição objetiva de recuperação.

O snapshot é sempre escopado por `organization_id` + `store_id`. As consultas de saúde selecionam somente IDs, estados e timestamps necessários. Nome, telefone, e-mail, endereço, tokens, segredos e payloads de webhook não entram no dashboard.

## Limiares e recuperação

| Sinal | Severidade | Janela/limiar | Deduplicação | Recuperação |
| --- | --- | --- | --- | --- |
| Print Agent sem heartbeat | P1; P0 se fila já impactada | 2 min | `printing-agent-offline` | heartbeat online recente |
| Job de impressão falho | P1; P0 com 2+ falhas | estado `failed` | por `job_id` | retry/reimpressão/ reconhecimento auditado retira o job da condição |
| Fila de impressão parada | P0 | 2 min aguardando | `printing-queue-stuck` | fila volta a avançar |
| Provedor de pagamento online em erro | P1 | health status `error` | por provedor | health status volta a saudável |
| Cobrança online falha | P1 | charge `failed` | por charge | charge deixa a condição ou operador reconcilia com evidência |
| Pedido sem confirmação | P1 | 10 min, exceto agendamento futuro | por pedido | confirmar/rejeitar/cancelar ou sair de `pending_confirmation` |
| Pedido confirmado sem avanço | P1 | 90 min sem atualização | por pedido | pedido avança, conclui ou cancela |
| Entrega em rota acima do esperado | P1 | 90 min em rota OU 15 min além de `promised_by_at` | por entrega | entrega conclui/cancela ou deixa a condição |
| Realtime degradado | P1 | última telemetria da janela de 10 min ainda é `failure` | `realtime-degraded` | evento posterior `success`/`recovered` |
| Falhas repetidas no checkout | P1 | 3+ falhas na janela de 10 min | `checkout-failure-burst` | janela deixa de atingir o limiar |

O navegador ainda possui seu indicador imediato de conexão Realtime. Ele orienta a não apertar F5 e a aguardar a reconciliação automática.

## Runbook P0 — impressão offline/fila parada

1. Abra **Configurações → Impressões** e confirme o estado do agente e da impressora.
2. Confirme que o computador está ligado, com rede e spooler operacional.
3. Reinicie o Print Agent se necessário; não recrie pedidos para provocar nova impressão.
4. Para jobs falhos, use **Tentar novamente**.
5. Só use **Reconhecer manualmente** depois de confirmar fisicamente que o documento saiu; informe o motivo. A ação é auditada.
6. Recuperação: heartbeat volta e não existem jobs parados/falhos no limiar.

## Runbook P1 — pedido preso

1. Abra o pedido pelo alerta.
2. Confira o estado real do estabelecimento antes de mudar qualquer status.
3. Se estiver `pending_confirmation`, escolha somente confirmar, rejeitar ou cancelar conforme o fato real.
4. Se já estiver confirmado, identifique se produção, retirada, pagamento ou entrega ficou sem registro.
5. Não repita mutação já confirmada; use a próxima transição permitida pela state machine.
6. Recuperação: o pedido deixa a condição de 10/90 minutos ou chega a estado final válido.

## Runbook P1 — Realtime degradado

1. Confira conectividade do terminal.
2. Não recarregue repetidamente e não duplique ações; a aplicação faz reconciliação periódica.
3. Aguarde o indicador voltar para **Ao vivo**.
4. Se continuar degradado, use os dados reconciliados e registre o incidente para investigação de Supabase/rede.
5. Recuperação: telemetria posterior `success` ou `recovered` e badge conectado.

## Runbook P1 — checkout falhando

1. Confirme se a loja está aberta e aceitando pedidos.
2. Confira formas de pagamento habilitadas e configuração de entrega/bairros.
3. Verifique se o problema é validação do cliente ou falha repetida de serviço.
4. Preserve todo pedido que já tenha sido criado; falha posterior de WhatsApp, PIX, reconhecimento ou impressão não autoriza recriar pedido.
5. Não habilite PIX para um cliente que não o configurou.
6. Recuperação: a janela de 10 min cai abaixo de 3 falhas e uma jornada controlada volta a concluir.

## Runbook P1 — entrega em rota acima do esperado

1. Abra a Central de Entregas e o pedido associado.
2. Confirme a situação com o entregador fora do sistema se necessário.
3. Registre apenas o estado real; não conclua entrega apenas para limpar o alerta.
4. Se a operação usa entrega manual, preserve o fluxo manual configurado.
5. Recuperação: entrega concluída/cancelada ou condição temporal deixa de existir.

## Runbook P1 — pagamento online indisponível

1. Abra **Configurações → Pagamentos** e teste a conexão do provedor.
2. Nunca presuma pagamento por causa de tentativa, print ou timeout.
3. Formas manuais continuam funcionando conforme configuração da loja.
4. PIX permanece opcional e só deve aparecer quando configurado/habilitado.
5. Recuperação: health do provedor volta a saudável e cobranças novas deixam de falhar.

## Runbook P0/P1 — rollback de deploy

1. Interrompa novas mudanças e identifique o último commit/deployment conhecido como saudável.
2. Preserve banco e migrations; não “desfaça” migration aplicada apagando histórico.
3. Reverta/promova o deployment anterior pela plataforma de hospedagem.
4. Valide login, cardápio público, checkout, pedidos e painel antes de encerrar o incidente.
5. Se o deploy inclui migration não destrutiva, prefira forward-fix. Para DDL crítico, siga o plano de recuperação versionado da migration.
6. Recuperação: rotas críticas e CI/preflight voltam a passar no deployment ativo.

## Runbook P0 — restauração de backup

1. Trate restauração como incidente de produção e suspenda mutações não essenciais.
2. Identifique o ponto de restauração e confirme impacto temporal antes de qualquer restore.
3. Nunca execute restore para corrigir apenas UI ou configuração individual.
4. Após restaurar, valide migrations, integridade referencial, isolamento tenant/unidade e amostras de pedidos sem expor PII.
5. Rode o diagnóstico read-only de invariantes e confirme zero violações críticas.
6. Recuperação: banco saudável, migrations coerentes e jornadas críticas aprovadas.

## Runbook P0 — incidente de segurança

1. Preserve evidências e limite o acesso afetado; não publique secrets em issue/chat/log.
2. Identifique superfície: credencial, Auth, RLS/RBAC, webhook, integração ou equipamento local.
3. Rotacione apenas os segredos efetivamente afetados e atualize consumidores autorizados.
4. Valide service role somente no backend, grants mínimos, RLS e isolamento multi-tenant.
5. Revise logs sanitizados por `requestId`/unidade; não exporte PII sem necessidade.
6. Recuperação: vetor bloqueado, credenciais rotacionadas quando necessário e testes de acesso negativo aprovados.

## Sinais externos e gates de release

- 404/500/latência de hospedagem: investigar na observabilidade da Vercel quando o escopo da equipe estiver acessível. O crawler e o build continuam sendo gates locais/CI.
- drift de migrations: `db:drift`/CI bloqueia sequência ausente, fora de ordem ou baseline incoerente.
- integridade de dados: `run_data_integrity_diagnostics_internal()` é read-only, sem PII e executável apenas por `service_role`.
- falhas API/webhooks: usam classificação de falha, `requestId` e logging estruturado sanitizado.

## Retenção e custo

A telemetria `product_experience_events` está configurada com `expires_at` de **180 dias**; a verificação controlada de produção em 03/09/2026 encontrou 108 eventos e retenção uniforme de 180 dias. Este lote não cria fornecedor externo, não aumenta plano e não adiciona armazenamento paralelo.

As consultas do indicador são escopadas por unidade, usam janelas curtas e limites explícitos (20–100 registros por fonte). Custos/retenção de logs nativos de Vercel/Supabase seguem o plano contratado e devem ser revisados antes de ampliar retenção ou habilitar recurso pago.

## Teste dos runbooks

O CI valida que todo tipo P0/P1 implementado possui seção correspondente, que os limiares são centralizados, que recuperação é derivada da condição atual e que o serviço de saúde não seleciona campos de PII de pedidos. Exercícios destrutivos (restore real, rotação de segredo ou rollback de produção) não são executados automaticamente pelo CI.
