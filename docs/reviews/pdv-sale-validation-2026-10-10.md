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

## Finalização operacional

Foi encontrada uma divergência adicional: a aplicação chama `order_quick_finish_internal`, mas a função não existia no banco da sessão. A migração de reparo `20261010072147_ensure_order_quick_finish_atomic` instala a mesma função já prevista pelo projeto, sem mudar a regra operacional.

Testados na RPC real: #19 (Pix/local) passou a concluído + servido; #23 (Pix/retirada) passou a concluído + retirado pelo cliente. Ambos mantiveram pagamento pago. A segunda finalização retornou `changed=false`, sem repetir as transições. Os demais sete pedidos demonstrativos seguem em preparo para inspeção.

## Verificações locais

- Build de produção concluído.
- Typecheck concluído.
- ESLint dos arquivos alterados sem erros.
- 74 testes passaram em 10 arquivos, incluindo matriz de modalidade/pagamento, pagamentos divididos, mensagens PostgREST, projeção do quadro, acessibilidade, layout móvel e concorrência.

## Limites e pendências

A proteção de credenciais do navegador impediu observar o PDV nesta rodada. Uma navegação de recuperação permitiu ver Pedidos antes da criação; depois a proteção voltou a impedir observação. Não foram copiados cookies nem desativadas proteções. Portanto, a nova opção, o fieldset de bloqueio e os cliques de finalização ainda precisam de homologação visual da versão de revisão. Não se deve apresentar os testes de RPC como homologação da interface.

Impressão física, gateway Pix/cartão, mobile físico e cliques do ciclo completo servido/retirado não foram homologados nesta rodada. As formas personalizadas ainda não têm suporte na RPC do PDV e agora não aparecem como uma opção vazia. Adicionais por quantidade, edição de item e recuperação de rascunho permanecem no diagnóstico anterior.

Os nove pedidos demonstrativos foram mantidos para inspeção (dois concluídos nos testes de finalização), sem excluir dados nem alterar pedidos de clientes.

## Troco durante a digitação

O campo Valor recebido passa a mostrar o troco antes da finalização, recalculando ao alterar o valor, o total do carrinho ou a parcela em dinheiro. Em pagamento dividido, usa somente o valor da parcela em dinheiro. Mostra zero para valor exato e a diferença que falta para valor insuficiente; valores incompletos não produzem um troco estimado. O resultado é anunciado como status acessível.

Exemplos verificados: venda R$ 15,90 / recebido R$ 20,00 = troco R$ 4,10; parcela dinheiro R$ 10,00 + Pix R$ 5,90 / recebido R$ 20,00 = troco R$ 10,00. Cinco testes de cálculo adicionados; 32 testes passaram nos quatro arquivos de PDV. Typecheck e ESLint dos arquivos alterados passaram. A limitação de homologação visual da sessão permanece.

## Retomada da conferência visual — 04:34 BRT

A prévia da branch abriu autenticada na Santa Rita, em tema claro e com menu recolhido. O carrinho preparado no navegador tinha água com gás, água mineral e casquinha com doce de leite, total R$ 14,50. A modalidade Consumir no local e a opção Levar embora estavam presentes.

Observações reais do navegador:

- Viewport 1363 × 936; largura do documento 1363, sem overflow horizontal.
- Conteúdo de x=64 a x=1363, largura 1299, `max-width: none`: sem as antigas faixas laterais vazias.
- Botão Finalizar entre y=863 e y=911, habilitado e dentro da viewport.
- Recebido R$ 100,00: troco R$ 85,50.
- Ao preencher R$ 20,00: status atualizado imediatamente para troco R$ 5,50.

A tentativa seguinte de preencher R$ 10,00 foi seguida por bloqueio da observação pela proteção de credenciais. O carrinho foi preservado em sua aba; uma nova aba de Pedidos também teve observação bloqueada. Não foi repetida a solicitação de acesso nem contornada a proteção. Nenhuma venda adicional foi finalizada nesta rodada. A exibição do valor insuficiente, do troco dividido e os cliques de finalização permanecem validados por testes de cálculo/RPC, mas pendentes de conferência visual completa. A imagem observada mostra o contexto do layout; não foi possível salvar uma nova captura com o campo de troco visível após o bloqueio.

## Pagamento dividido e prevenção de finalização inválida — 04:48 BRT

O navegador voltou a permitir a observação do carrinho preservado de R$ 14,50. Com dinheiro recebido R$ 10,00, mostrou `Faltam R$ 4,50`; ao clicar Finalizar, apresentou `O valor recebido em dinheiro é menor que a parcela.` sem criar uma nova venda. Depois foram preenchidos recebido R$ 20,00 e parcela dinheiro R$ 10,00, e adicionada uma segunda parcela Pix: a tela mostrou troco R$ 10,00 e falta distribuir R$ 4,50. A etapa seguinte voltou a sofrer bloqueio da proteção de credenciais; a venda dividida não foi finalizada.

Ajustes adicionais nesta revisão: a validação de pagamento passa a acontecer em cada alteração dos valores; o motivo de inconsistência aparece no resumo e o botão fica desabilitado até a soma e o recebido estarem corretos. O troco agregado de todas as parcelas em dinheiro fica no resumo fixo quando os pagamentos são válidos. Seletores e campos de cada parcela têm nomes acessíveis únicos, e o recebido está associado ao seu resultado de troco. A conferência visual também mostrou que os seletores de pagamento anteriores não tinham nomes e que os campos das parcelas repetiam o mesmo nome.

Três testes financeiros adicionais verificam troco dinheiro/Pix, soma do troco de duas parcelas em dinheiro e rejeição de resumo para pagamento insuficiente/soma divergente. A suíte atual passou com 74 testes em 10 arquivos, ESLint sem erros e build de produção concluído. O botão desabilitado e o novo troco no resumo fixo ainda dependem de conferência visual da nova prévia; os comportamentos observados acima foram na versão anterior a este último ajuste. A proteção de credenciais pertence ao ambiente de navegador e não foi alterada pelo código do PDV.
