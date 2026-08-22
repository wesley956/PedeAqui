# Diagnóstico de apresentação — lote PA-DIAG-026 a PA-DIAG-030

Data de corte: 2026-08-22  
Master: GitHub #539  
Issues executadas: #565, #566, #567, #568 e #569

## Resultado

| Diagnóstico | Issue | Estado | Evidência |
| --- | --- | --- | --- |
| Carrinho: adicionar, quantidade e remover | #565 | Aprovado após correção | RPCs mantêm escopo por loja/token, recalculam subtotal e total; entradas inválidas agora voltam com mensagem clara |
| Subtotal, adicionais, descontos e total | #566 | Aprovado | preço vem do servidor; constraints e testes transacionais confirmaram `subtotal - desconto + entrega` |
| Nome, telefone e endereço | #567 | Aprovado após correção | validação amigável; pedido final preserva snapshots de identidade e endereço |
| Taxa de entrega | #568 | Aprovado para as regras configuradas | bairro, taxa padrão, mínimo, gratuidade e prazo têm cálculo determinístico; distância deixou de ser apresentada como ativa sem geocodificação |
| Entrega, retirada e consumo no local | #569 | Aprovado | entrega e retirada passam pelo checkout; consumo local usa QR/comanda separado, com preço autoritativo e idempotência |

## Falhas encontradas e corrigidas

1. Campos inválidos de identidade, endereço, recebimento, pagamento, troco e quantidade podiam lançar erro técnico em vez de orientar o cliente. Os limites continuam no servidor, agora com redirecionamento e texto acionável.
2. O painel permitia cadastrar “distância máxima”, mas o checkout não possui geocodificação do endereço e nunca aplicava esse limite. A tela agora explica que a cobertura é validada por bairro e não promete uma regra inexistente.
3. A cotação consultava configuração e bairro sequencialmente. As leituras independentes passaram a rodar em paralelo e o cálculo foi isolado em função pura testável.
4. O checkout carregava benefícios depois de toda a sessão. Essa leitura independente passou a ocorrer em paralelo.

## Evidência transacional live

As validações usaram a unidade `santa-rita` dentro de transações encerradas com `ROLLBACK`.

Carrinho e recebimento:

- dois itens adicionados e subtotal correto;
- quantidade alterada e total recalculado;
- item removido e total recalculado;
- desconto e taxa preservados na fórmula autoritativa;
- troca de entrega para retirada zerou taxa e limpou endereço;
- tentativa de alterar item usando outra loja foi negada.

Pedido completo:

- identidade e endereço viraram snapshots do pedido;
- entrega preservou taxa e total corretos;
- retirada foi criada sem taxa e sem endereço;
- repetição da finalização devolveu o mesmo pedido, sem duplicidade.

Consumo no local:

- QR público resolveu a mesa e a comanda abertas;
- rodada foi criada com `channel=table_qr` e `fulfillment_type=table`;
- total veio do catálogo autoritativo;
- repetição da mesma chave idempotente não criou outra rodada.

Nenhum carrinho, pedido, comanda, rodada ou alteração de mesa permaneceu no banco.

## Regra de entrega da demonstração

A unidade de demonstração usa taxa por bairro, exige bairro cadastrado, possui mínimo por região e frete grátis a partir de R$ 70,00. O valor antigo de distância máxima não é usado para aceitar endereços. Até existir geocodificação confiável, a configuração segura para os primeiros clientes é cadastrar somente os bairros realmente atendidos.

## Validação automatizada

- 151 arquivos e 905 testes aprovados;
- typecheck aprovado;
- lint com zero erros e quatro avisos já conhecidos;
- build Next.js aprovado com 66 superfícies.
