# PDV: modalidades e pagamentos — 2026-10-10

## Resultado e escopo

O PDV gravava todas as vendas como `counter`. A nova opção de tipo de venda usa `counter` para consumir no local e `pickup` para levar embora, reaproveitando os estados canônicos servido/retirado. A modalidade é registrada antes dos eventos e dos efeitos de impressão, na mesma transação da venda. Clientes antigos continuam usando `counter` por padrão.

A largura total do PDV já está na branch desta revisão. A captura enviada pelo usuário mostra o domínio publicado, que ainda usa o limite de largura anterior. Não houve publicação do frontend em produção nesta rodada.

Também foram corrigidos: respostas antigas na busca de clientes; edição do carrinho durante a finalização; reenvio simultâneo; mensagem de erro para objetos PostgREST; distribuição inicial confusa do pagamento dividido; opção em branco de pagamento personalizado que a RPC não suporta. O quadro e o detalhe identificam consumo no local.

## Validação com pedidos demonstrativos

Unidade Santa Rita Açaí & Sorvetes, confirmada no banco com `platform_demo=true`. Todos os pedidos foram identificados como TESTE QA PDV, sem telefone, e-mail ou cobrança de gateway. Foi usada a RPC real `pdv_create_order_growth_internal` pelo conector administrativo com o operador da sessão de caixa demonstrativa; a criação não foi feita pelos cliques da nova interface.

| Pagamento | Consumir no local | Levar embora | Valor | Troco |
| --- | --- | --- | --- | --- |
| Dinheiro | #18 | #22 | R$ 15,90 | R$ 4,10 |
| Pix | #19 | #23 | R$ 15,90 | zero |
| Crédito | #20 | #24 | R$ 15,90 | zero |
| Débito | #21 | #25 | R$ 15,90 | zero |
| Dinheiro + Pix | — | #26 | R$ 10,00 + R$ 5,90 | R$ 10,00 |

Conferidos no banco: canal PDV, modalidade do pedido e do evento `order.created`, total, parcela liquidada, estado de pagamento pago e produção em preparo. O PDV registra pagamento recebido; não verifica um recebimento Pix externo nem cobra um cartão.

Uma tentativa inicial em dinheiro sem ator foi corretamente recusada por falta de sessão de caixa do operador. A transação não deixou um pedido incompleto. A execução com o operador da sessão demonstrativa aberta funcionou.

Asserções executadas diretamente no banco passaram para: repetição da mesma chave retorna o pedido original com `created=false`; mudança de modalidade na mesma chave é recusada; delivery não é aceito no PDV; soma incorreta e dinheiro insuficiente são recusados; nenhuma tentativa inválida deixa novos pedidos.

A migração foi aplicada no projeto Supabase da sessão, mantendo a assinatura e as permissões existentes. Versão registrada: `20261010071418`. Função SECURITY INVOKER, inacessível para anon/authenticated, acessível somente para service_role. Advisors antes/depois tiveram os mesmos avisos preexistentes, sem avisos novos desta alteração.

## Verificações locais

- Build de produção concluído.
- Typecheck concluído.
- ESLint dos arquivos alterados sem erros.
- 61 testes passaram em 9 arquivos, incluindo matriz de modalidade/pagamento, pagamentos divididos, mensagens PostgREST, projeção do quadro, acessibilidade, layout móvel e concorrência.

## Limites e pendências

A proteção de credenciais do navegador impediu observar o PDV nesta rodada. Uma navegação de recuperação permitiu ver Pedidos antes da criação; depois a proteção voltou a impedir observação. Não foram copiados cookies nem desativadas proteções. Portanto, a nova opção, o fieldset de bloqueio e os cliques de finalização ainda precisam de homologação visual da versão de revisão. Não se deve apresentar os testes de RPC como homologação da interface.

Impressão física, gateway Pix/cartão, mobile físico e ciclo completo servido/retirado não foram homologados nesta rodada. As formas personalizadas ainda não têm suporte na RPC do PDV e agora não aparecem como uma opção vazia. Adicionais por quantidade, edição de item e recuperação de rascunho permanecem no diagnóstico anterior.

Os nove pedidos demonstrativos foram mantidos para inspeção, sem excluir dados nem alterar pedidos de clientes.
