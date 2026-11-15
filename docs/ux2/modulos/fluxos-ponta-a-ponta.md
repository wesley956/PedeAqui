# UX2 — Fluxos de ponta a ponta

Executados automaticamente na homologação local (loja fictícia, computador, tema claro) por `scripts/ux2-auditoria/auditoria.mjs` (bloco `runFlows`, acionado com `[prints: fluxos]`). Cada passo guarda um print e a lista do que a tela mostrava; ficam na branch `ux2/evidencias`, pasta `ux2_fluxos`.

Estes fluxos alteram dados, por isso só rodam na loja fictícia.

| Fluxo | Passos executados | Resultado |
| --- | --- | --- |
| **Caixa** | abrir com saldo inicial → (vendas) → conferir e fechar com dinheiro contado | **Funciona.** "Caixa aberto para o turno." / "Turno fechado e conferido." |
| **PDV** | adicionar item → valor recebido → finalizar em dinheiro | **Funciona.** "Venda #11 finalizada em R$ 15,00. Troco: R$ 5,00." Sem caixa aberto, o sistema avisa e agora oferece o link para abrir o caixa. Abrir produto com opções também funciona. |
| **Pedido do cardápio** | aceitar → iniciar produção → marcar pronto → liberar retirada → cliente retirou → confirmar pagamento → concluir pedido | **Funciona** do começo ao fim, pela tela de detalhe do pedido. |
| **Salão** | abrir mesa → lançar item → enviar para produção → registrar pagamento → concluir e liberar mesa | **Não funcionava.** "Enviar para produção" falhava por dois defeitos de banco (P-01 e P-04 em `PENDENCIAS-BANCO.md`). Com as correções aplicadas só na homologação, a rodada é enviada e o pagamento é registrado. |

## Defeitos encontrados
1. **Salão — rodada não é enviada** (P-01 e P-04). Defeitos de banco, provavelmente presentes na produção; **não confirmados com dados**. Correção proposta e não aplicada na produção.
2. **Salão — mensagens de regra viravam tela de erro.** "Concluir e liberar mesa" com pedido ainda em preparo, pagamento acima do saldo ou valor inválido caíam em "Não foi possível concluir esta operação". Agora a pessoa volta para a mesa com a explicação ("Ainda existem pedidos em produção ou não servidos."). Corrigido no código.
3. **Salão — erros do banco nunca eram reconhecidos.** O tradutor de mensagens só lia erros do tipo `Error`; o banco devolve objeto simples. Todas as mensagens específicas ("Esta mesa já possui uma comanda ativa" etc.) viravam a genérica. Corrigido no código.
4. **Pedidos — erro de hidratação do React (#418).** O tempo decorrido era calculado com horários diferentes no servidor e no navegador. Corrigido: os dois usam o mesmo instante.
5. **PDV — aviso de caixa fechado sem caminho.** A mensagem "Abra o caixa antes de finalizar uma venda em dinheiro" não levava a lugar nenhum e não era anunciada para leitores de tela. Agora tem o link "Abrir caixa (nova aba)" e `role="alert"`.

## O que estes fluxos não cobrem
- Pagamento em cartão/Pix, pagamento dividido, cliente e benefícios no PDV.
- Pedido de entrega (com entregador), recusa e cancelamento de pedido, estorno.
- Divisão de conta por pessoa, transferência de mesa, pedido por QR.
- Celular (os fluxos rodam só em 1366 px).
- Tudo que depende de integração real (B-04).
