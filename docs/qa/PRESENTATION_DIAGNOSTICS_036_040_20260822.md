# Diagnóstico de apresentação — lote PA-DIAG-036 a PA-DIAG-040

Data de corte: 2026-08-22  
Master: GitHub #539  
Issues executadas: #575, #576, #577, #578 e #579

## Resultado

| Diagnóstico | Issue | Estado | Evidência |
| --- | --- | --- | --- |
| Aviso visual e sonoro | #576 / PA-DIAG-036 | Aprovado após correção | INSERT novo mostra alerta; som de duas notas é ativado por gesto real e tem fallback visual claro |
| Aceitar, rejeitar e cancelar | #578 / PA-DIAG-037 | Aprovado após correção | três ações usam o mesmo formulário com estado pendente, feedback amigável e autoridade no servidor |
| Estados operacionais completos | #575 / PA-DIAG-038 | Aprovado | recebido → confirmado → preparando → pronto → saiu → entregue/concluído validado no banco |
| Status correto para o cliente | #579 / PA-DIAG-039 | Aprovado após correção | linha do tempo usa estados autoritativos e agora mostra etapas explícitas para recusado/cancelado |
| Atualização sem recarga manual | #577 / PA-DIAG-040 | Aprovado | painel e detalhe usam Realtime; página pública atualiza a cada 10 s, ao focar e ao voltar à aba |

## Falhas encontradas e corrigidas

1. O painel persistia “som ativo” no `localStorage`. Após recarregar, o navegador podia bloquear o novo `AudioContext`, embora a interface afirmasse que o som estava ligado. A ativação agora sempre ocorre por gesto do usuário naquela página, o contexto é reutilizado enquanto a tela está aberta e qualquer bloqueio mantém o aviso visual com mensagem clara.
2. Cancelar usava uma Server Action crua, diferente de aceitar e rejeitar. Uma corrida de estado podia virar erro técnico. A ação foi incorporada ao formulário operacional com estado “Processando…”, motivo obrigatório e falha amigável.
3. Pedido recusado/cancelado colocava o ícone de problema na etapa “Pedido recebido”. A linha do tempo agora encerra em “Pedido recusado” ou “Pedido cancelado”, mantendo “Pedido recebido” como concluído.
4. O detalhe considerava somente `paid` para concluir, enquanto a regra de domínio também permite `partially_refunded` e `refunded`. A tela agora acompanha a mesma regra autoritativa usada pelo gestor.
5. O detalhe mostrava canais/modalidades técnicas ou classificava mesa como retirada. Os rótulos foram normalizados para Cardápio, Salão, PDV, Entrega, Retirada, Balcão e Mesa.

## Evidência transacional live

Quatro pedidos foram criados na unidade `santa-rita` dentro de uma transação encerrada com `ROLLBACK`.

- retirada completa: confirmado, fila, preparando, pronto, pagamento liquidado no ledger, aguardando retirada, retirado e concluído;
- entrega completa: confirmado, preparando, pronto, pagamento liquidado, aguardando entregador, atribuído, coletado, saiu para entrega, entregue e concluído;
- recusa: pedido terminou `rejected`, com produção e atendimento cancelados e motivo preservado no histórico;
- cancelamento após confirmação: pedido terminou `canceled`, com produção e atendimento cancelados e `cancel_reason=Cliente solicitou`;
- a função de transição está executável somente por `service_role`; anon e authenticated não executam a RPC diretamente;
- `orders` permanece na publicação `supabase_realtime`.

Após o rollback, carrinhos, clientes e pedidos identificados como QA retornaram contagem zero.

## Atualização automática

O painel de pedidos assina INSERT e UPDATE filtrados por `store_id`. O detalhe operacional assina qualquer mudança da tabela com o mesmo filtro e consolida atualizações próximas. O acompanhamento público não expõe leitura direta da tabela ao cliente: faz refresh server-side a cada 10 segundos somente com a aba visível, além de atualizar no foco/retorno à aba. Isso mantém o token privado como autoridade sem exigir recarga manual.

## Regra para a demonstração

Ao abrir o painel de pedidos no notebook, clique uma vez em **Ativar som**. Navegadores exigem esse gesto em cada carregamento de página. O alerta visual funciona mesmo quando o dispositivo não oferece áudio ou bloqueia a reprodução.

## Validação automatizada

- 153 arquivos e 924 testes aprovados;
- typecheck aprovado;
- lint sem erros e com quatro avisos históricos;
- build Next.js aprovado com 66 superfícies;
- revisão condensada de React aprovada: contexto de áudio mantido em `ref`, cleanup no desmontar, efeitos com dependências estáveis, feedback acessível e sem persistir estado enganoso.
