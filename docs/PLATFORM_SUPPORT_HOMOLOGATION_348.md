# Homologação final do Painel do Proprietário — [348]

## Regra de aprovação

Esta homologação separa evidência **automatizável no repositório/CI** de evidência **externa/operacional**. A issue [348] só pode ser fechada quando as duas categorias necessárias estiverem comprovadas no mesmo baseline aprovado.

## Baseline coberto pelo CI

| Capacidade | Evidência automatizada | Resultado esperado |
| --- | --- | --- |
| Gate de plataforma | `PlatformAdminService.access()` em todas as superfícies privilegiadas | restaurante comum não acessa `/platform` |
| Visão 360° | `PlatformRestaurant360Service` + rota por organização/unidade | bloqueio de venda explicado sem SQL |
| Ações de suporte | `PlatformSupportActionService` | mutações conhecidas, tenant-scoped, auditadas e idempotentes |
| Saúde das integrações | `/platform/integracoes` | configuração, health, impressão e webhooks sem secrets |
| Operação 360° | `/platform/operacao/pedidos/[orderId]` | timeline e diagnóstico sem PII |
| Contas e acessos | `/platform/suporte` | recuperação oficial, convite e RBAC sem senha |
| Assinaturas | `/platform/assinaturas` | ações comerciais via state machine oficial |
| Incidentes/auditoria | `/platform/incidentes` | falhas agrupadas e sanitizadas, ciclo open/investigating/resolved |
| Modo suporte | `/platform/suporte/modo` | sessão curta, assinada, HttpOnly, read-only e auditada |
| Integridade | `/platform/integridade` | dry-run e reparos determinísticos sem SQL livre |
| Alertas | `/platform/alertas` | P0–P3 deduplicados com CTA e recuperação derivada de health |

## Cenários de homologação automatizada

1. **Isolamento e acesso**
   - platform admin obrigatório antes de qualquer leitura `service_role`;
   - unidade sempre validada contra organização no servidor;
   - `support` não herda poderes de `super_admin`;
   - não existe console SQL no browser;
   - nenhuma tela carrega senha, token de sessão ou segredo do provider.

2. **Configuração comercial**
   - unidade sem cardápio/configuração aparece como bloqueio;
   - cardápio despublicado e pedidos pausados aparecem em prontidão/alertas;
   - reparo estrutural cria somente configuração segura/desabilitada;
   - preço, horário, taxa, forma de pagamento e permissão nunca são inventados pelo suporte.

3. **Operação**
   - pedido aguardando aceite além da janela aparece em alertas/diagnóstico;
   - retry de impressão/fiscal/webhook só ocorre quando elegível e sem recriar payload/tentativas;
   - nenhuma central escreve diretamente `paid`, `delivered` ou `completed`.

4. **Acesso**
   - recuperação de senha usa fluxo oficial;
   - convite pode ser reemitido sem revelar token;
   - alteração de acesso exige `super_admin`, confirmação, motivo e protocolo;
   - `owner` não pode ser atribuído pela Central de Suporte.

5. **Modo suporte**
   - cookie é HttpOnly, assinado, ator-bound e com expiração curta;
   - sessão não reutiliza cookie/JWT/refresh token do cliente;
   - modo é read-only e envia correções para [339];
   - início e fim geram auditoria.

6. **Incidentes e alertas**
   - erros iguais são agrupados;
   - PII/secrets são sanitizados;
   - alertas não executam correções automáticas financeiras/comerciais;
   - incidente resolvido permanece no histórico e condição recuperada deixa de gerar alerta ativo.

## Gates externos obrigatórios antes de fechar #462

Estes itens não podem ser aprovados apenas por mocks ou inspeção de código:

- WhatsApp real: canal saudável, reconexão e falha controlada de webhook/inbound quando o canal estiver disponível para homologação;
- Print Agent real: agente offline/fila com falha e recuperação em ambiente de homologação;
- PIX/provider real: indisponibilidade, webhook e reconciliação quando [327]–[328] estiverem oficialmente prontos;
- e-mail/auth real: entrega de convite/recuperação em conta de homologação quando necessária para provar o fluxo externo;
- sessão de suporte em navegador: iniciar → reproduzir contexto → comprovar read-only → encerrar/expirar;
- execução controlada de um reparo de integridade com dry-run + repetição idempotente em tenant de homologação.

## Matriz de chamados

- **A — resolvível pelo painel:** publicação/pausa, configuração determinística, convite, acesso permitido, retry elegível, plano/assinatura dentro da state machine.
- **B — diagnosticável + ação externa:** reconexão Meta, provider indisponível, dispositivo/agente offline, cliente precisa concluir autenticação.
- **C — engenharia/deploy:** bug de código, contrato de provider não suportado, corrupção sem reparo determinístico conhecido.

## Critério final

Não fechar #462 enquanto algum gate externo aplicável estiver sem evidência. O CI verde comprova a fundação e os guardrails; ele não substitui telefone físico, provider real ou dispositivo real quando a issue exige esses elementos.
