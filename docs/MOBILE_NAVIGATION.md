# PedeAqui — Navegação mobile contextual

> Issue lógica: **[273]**

A navegação mobile não replica mais todos os módulos em uma faixa horizontal. Ela usa o contexto operacional já resolvido no servidor.

## Contrato

- até **4 ações diretas** por vez;
- `Mais` ocupa o quinto espaço somente quando existem itens adicionais;
- o seletor prioriza a ordem de trabalho real de cada contexto;
- itens `hidden` não entram nem no `Mais`;
- módulos sem permissão já foram removidos antes de chegar ao componente;
- rota ativa usa `aria-current="page"`;
- o painel `Mais` é implementado com `details/summary`, operável por teclado;
- bottom bar respeita `env(safe-area-inset-bottom)`;
- não existe scroll horizontal de dezenas de opções.

## Exemplos

- Garçom/salão: **Mesas · Pedidos · Novo · Clientes · Mais** quando houver secundários.
- Caixa: **PDV · Caixa · Pedidos · Clientes · Mais**.
- Cozinha: **Produção · Pedidos** e, se houver recursos adicionais permitidos, eles ficam em `Mais`.
- Entregador: **Roteiro · Entregas · Pedidos**.

Os nomes `Mesas`, `Novo` e `Roteiro` são aliases somente da navegação mobile para reduzir espaço; as rotas e módulos continuam os mesmos.

## Segurança

A composição mobile é ergonomia. A URL protegida continua usando a autorização existente e nunca confia na ausência/presença de um item no menu.
