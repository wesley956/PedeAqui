# Gate do perfil simplificado do primeiro cliente — #721 a #736

## Resultado arquitetural

O mesmo deploy suporta lojas `standard` e `simplified`. Nenhum e-mail, `organization_id` ou `store_id` aparece no código ou na migration. A ausência de `store_operational_settings` produz exatamente os defaults legados: aceite manual, board completo, projeção manual para Entregas, GPS desligado e campanhas desligadas.

As opções são subordinadas aos módulos existentes. Módulo desligado prevalece sobre a subconfiguração e a validação server-side recusa combinações incoerentes. O super admin altera a política por unidade no Painel do Proprietário, sempre com motivo, protocolo, antes/depois e ator em `audit_logs`.

## Jornadas de homologação

### Loja A — padrão

1. Não criar configuração ou salvar todos os defaults.
2. Criar pedido de delivery e confirmar que permanece em `pending_confirmation`.
3. Aceitar, iniciar, marcar pronto e enviar manualmente para Entregas.
4. Rejeitar/cancelar outro pedido e validar histórico.
5. Confirmar board completo, GPS ausente e página de campanhas bloqueada pela subconfiguração.

### Loja B — simplificada

1. Pelo Painel do Proprietário, habilitar módulos contratados e depois `autoaccept`, board `simplified` e projeção automática para Entregas.
2. Criar pedido delivery três vezes, sempre com carrinho/token novo.
3. Confirmar aceite automático pela state machine e histórico com origem `automation`.
4. Confirmar exatamente três colunas: Iniciar, Pronto e Finalizados.
5. Iniciar e marcar pronto; validar uma única linha em `deliveries`, mesmo após refresh/retry.
6. Atribuir entregador afiliado; entrar por telefone + PIN e validar acesso direto somente a `/entregador`.
7. Tentar dashboard, clientes, estoque, financeiro, configurações e IDs de outro entregador; todos devem ser negados.
8. Iniciar rota. O entregador deve tocar em “Compartilhar localização da rota” e ver o indicador explícito.
9. Negar GPS e confirmar que ainda é possível concluir a entrega.
10. Com GPS permitido, conferir no painel do proprietário último heartbeat, “sem atualização” e “possivelmente parado” como estados distintos.
11. Concluir a entrega; validar horário/responsável, encerramento da sessão e rejeição de novos pontos.

### Campanha controlada

1. Habilitar Growth, Clientes, Conversas e a subconfiguração de campanhas.
2. Confirmar conexão oficial da Meta e cadastrar o nome exato de um template aprovado. Se o corpo usar `{{1}}`, marcar o placeholder controlado de nome do cliente.
3. Marcar consentimento somente nos destinatários que o concederam; registrar ao menos um opt-out e um cliente sem consentimento.
4. Criar campanha e revisar contagens. “Todos” deve significar todos os elegíveis da unidade.
5. Enfileirar um lote pequeno. Refresh/retry não pode criar novo recipient ou nova chave idempotente.
6. Confirmar que opt-out feito após a fila, mas antes do worker, muda o recipient para `skipped_opt_out`.
7. Desconectar o canal e confirmar retry limitado sem afetar pedidos/entregas.
8. Cancelar uma campanha em andamento e confirmar que itens ainda não enviados viram `canceled`, preservando os já enviados e a auditoria.
9. Só após o lote pequeno real, ampliar o público manualmente.

## Segurança e privacidade

- RLS está ativa em configurações, sessões, vínculos, pontos, eventos e preferências.
- Escritas sensíveis passam por funções service-only após autorização de aplicação.
- `organization_id`, `store_id` e `driver_id` são derivados do contexto autoritativo.
- Um ponto só é aceito para sessão ativa do driver autenticado, no máximo a cada 10 segundos.
- A UI informa compartilhamento e documenta a limitação de navegador em segundo plano.
- Retenção de rota é configurável entre 1 e 30 dias; `cleanup_driver_route_points_internal` elimina sessões vencidas e seus pontos por cascata.
- Campanha revalida consentimento e telefone imediatamente antes do envio.
- Somente WhatsApp Cloud API e templates aprovados são usados; não há WhatsApp Web, scraping ou mecanismo de evasão.
- O primeiro processamento ocorre em `after()` no servidor, em lotes limitados; um cron diário de recuperação e o endpoint protegido cobrem itens pendentes sem exceder os dois crons permitidos no plano Hobby.

## Rollback

Desligar as subconfigurações ou retornar `orders_workflow_mode` para `standard`. Isso interrompe novas automações/coletas/envios sem apagar pedidos, entregas, sessões encerradas, recipients, mensagens ou auditoria. Não ativar a unidade real até aprovação explícita do gate.

## Evidências automatizadas

- `tests/client-01-operational-profile.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run test:e2e`
- `npm run db:drift`
- `npm run build`
- migrations `124_client_01_operational_profile.sql` a `127_client_01_campaign_provider_status.sql`
- advisors de segurança e performance do Supabase após a migration
