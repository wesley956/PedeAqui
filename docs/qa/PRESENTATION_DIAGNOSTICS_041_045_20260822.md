# Diagnóstico de apresentação — lote PA-DIAG-041 a PA-DIAG-045

Data: 22/08/2026  
Escopo: pedido, impressão, cancelamento/estorno e WhatsApp  
Issues: #581, #580, #582, #584 e #583

## Resultado executivo

| Fluxo | Issue | Resultado | Evidência principal |
| --- | --- | --- | --- |
| Histórico e detalhes do pedido | #581 / PA-DIAG-041 | Aprovado após correção | detalhe passou a exibir agendamento, snapshots de cliente/endereço, descontos discriminados, motivo do cancelamento, histórico traduzido e datas no fuso da unidade |
| Impressão manual e automática | #580 / PA-DIAG-042 | Aprovado após correção | impressão automática gerou um job; rota inicialmente desativada gerou zero e a ação manual criou um job após a ativação |
| Cancelamento, estorno e motivos | #582 / PA-DIAG-043 | Aprovado após correção | confirmação e estorno atualizaram ledger, pedido e histórico; cancelamento preservou o motivo; cancelamento após retirada foi recusado |
| Integração WhatsApp existente | #584 / PA-DIAG-044 | Mapeada e aprovada | integração real é Meta WhatsApp Cloud API, com inbound assinado, outbound, templates, status de entrega e configuração por unidade |
| Número, sessão, webhook, credenciais e erros | #583 / PA-DIAG-045 | Aprovado após correção | prontidão agora exige o token do challenge; health check vencido deixa de aparecer como pronto; detalhes internos da Meta não chegam ao operador |

## PA-DIAG-041 — histórico e detalhe completo

O detalhe administrativo já reunia estados independentes, itens, adicionais, observações, valores, cliente, endereço, ledger, histórico e jobs de impressão. O diagnóstico encontrou três lacunas de apresentação: datas dependiam do timezone do processo, snapshots úteis permaneciam ocultos e estados/fontes do histórico apareciam em linguagem técnica.

Correções aplicadas:

- timezone da unidade carregada junto com o pedido;
- consultas independentes de unidade, itens, histórico e impressão executadas em paralelo;
- agendamento, e-mail, complemento, CEP, cupom, cashback, fidelidade, motivo de cancelamento e última atualização visíveis;
- estados e fontes do histórico traduzidos;
- horários do pedido, pagamento, histórico e impressão formatados no fuso da unidade.

## PA-DIAG-042 — impressão

O roteamento automático e o serviço de impressão manual existiam, mas a ação manual não estava disponível na tela do pedido. A tela agora oferece `Imprimir pedido agora` para pedido confirmado. Zero rotas ativas produz orientação clara sobre estações e impressoras, sem mensagem técnica. Falhas persistidas no job também são apresentadas de forma segura.

O ensaio live, dentro de `BEGIN ... ROLLBACK`, comprovou:

1. confirmação com rota automática ativa: um job pendente;
2. confirmação com rota desativada: nenhum job;
3. ativação da rota e impressão manual: um job pendente;
4. idempotência do roteamento existente preservada.

## PA-DIAG-043 — cancelamento e estorno

O ledger financeiro já realizava estorno por RPC transacional e registrava o motivo no metadata, no histórico do pedido e no evento de domínio. A action, porém, devolvia qualquer mensagem desconhecida diretamente ao navegador.

Foi criado um tradutor fechado de erros. Motivo inválido, pagamento ausente, estado concorrente, caixa fechado, saldo insuficiente e valor recebido insuficiente têm mensagens comerciais; qualquer erro desconhecido recebe fallback genérico. Após falha, pedido, lista e caixa são revalidados para retirar estado obsoleto da tela.

O ensaio live confirmou pagamento `paid → refunded`, pedido `paid → refunded`, motivo no histórico, motivo do cancelamento no snapshot e bloqueio de cancelamento depois da retirada.

## PA-DIAG-044 e 045 — WhatsApp

### Arquitetura encontrada

- provedor: Meta WhatsApp Cloud API;
- credencial de saída: referência server-side `META_SYSTEM_USER_ACCESS_TOKEN`;
- assinatura de entrada: HMAC SHA-256 com App Secret;
- challenge: `WHATSAPP_WEBHOOK_VERIFY_TOKEN` em `GET /api/webhooks/whatsapp`;
- roteamento: Phone Number ID → configuração ativa da unidade;
- persistência: contatos, conversas, mensagens, status e histórico;
- automação: saudação e notificações de pedido, com handoff humano.

### Estado live observado

Foram encontradas oito unidades. Uma estava habilitada e marcada como conectada, com WABA/número, credencial por referência, nome verificado, qualidade `GREEN` e health check em 17/08/2026; sete estavam não configuradas. Nenhum ID ou segredo foi copiado para este documento.

O painel marcava a infraestrutura como pronta sem incluir o token do challenge e tratava um health check antigo como conexão operacional. Agora:

- os quatro requisitos server-side são verificados, incluindo `WHATSAPP_WEBHOOK_VERIFY_TOKEN`;
- conectar/revalidar é bloqueado quando o webhook não está completo;
- `Pronto para uso` exige conexão, infraestrutura completa e health check nas últimas 24 horas;
- conexão antiga recebe `Revalidar antes de usar`;
- respostas da Meta são convertidas em mensagens seguras antes de serem persistidas ou mostradas.

Para a demonstração, a unidade conectada deve ser revalidada no Super Admin depois que este lote chegar à produção. Isso atualiza o health check sem expor ou transportar credenciais.

## Evidências e rollback

- TypeScript: aprovado;
- testes focados: 24/24 aprovados antes da suíte integral;
- ensaio Supabase live: aprovado;
- resíduo depois do rollback: 0 organizações, 0 unidades, 0 pedidos, 0 jobs e 0 pagamentos de diagnóstico;
- não houve migration nem alteração persistente de produção neste lote.

