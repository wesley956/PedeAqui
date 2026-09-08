# iFood Orders — captura de fixture real sanitizada

Objetivo: fechar a evidência da #937 com **payload real do sandbox iFood**, sem versionar credenciais nem dados pessoais.

## Pré-requisitos externos

1. Aplicativo de testes criado no Portal do Desenvolvedor iFood.
2. Client ID/Client Secret de **teste** configurados no PedeAqui pelo mecanismo seguro existente.
3. Loja/merchant de teste autorizada e vinculada à unidade correta.
4. Capability `ifood_orders` habilitada somente no ambiente sandbox.

Enquanto estes itens não existirem, mocks e exemplos de documentação não contam como fixture real.

## Captura

1. Gere um pedido de teste pelo fluxo oficial do Portal do Desenvolvedor iFood.
2. Aguarde o evento entrar pela inbox durável do PedeAqui e confirme que foi associado ao merchant/store correto.
3. Obtenha o JSON de detalhes desse mesmo pedido pela integração sandbox. Não copie Client Secret, Access Token ou headers para o arquivo.
4. Salve o JSON bruto **fora do repositório** em um arquivo temporário local, por exemplo `/tmp/ifood-sandbox-order.json`.
5. Execute:

```bash
node scripts/sanitize-ifood-sandbox-fixture.mjs /tmp/ifood-sandbox-order.json tests/fixtures/ifood/sandbox/order-details-real-001.json
```

O sanitizador escreve com `flag: wx`: ele recusa sobrescrever silenciosamente uma fixture já revisada.

## O que é sanitizado

- IDs do pedido/merchant/item/opção;
- nome e telefone do cliente;
- endereço, CEP, coordenadas, complemento e referência;
- pickup code;
- observações livres e extraInfo.

São preservados para prova de contrato:

- order type/timing/status/canal/categoria;
- nomes estruturais de produtos e adicionais da loja de teste;
- quantidades;
- unit price, addition, item total;
- subtotal, delivery fee, benefits/descontos, additional fees e total;
- métodos/valores de pagamento;
- ownership de pagamento/logística derivável do payload;
- estrutura de delivery/schedule necessária ao normalizador.

## Validação antes de commit

A fixture real só pode ser versionada quando:

1. o sanitizador não encontrar padrões óbvios de telefone/CEP/e-mail;
2. `normalizeIfoodOrderDetails(fixture, "sandbox-merchant-001")` aceitar o payload;
3. itens, adicionais, quantidades e valores forem conferidos campo a campo contra o pedido de teste no portal;
4. payment owner e logistics owner resultarem no esperado;
5. nenhum token/secret/header estiver presente;
6. a fixture estiver marcada/documentada na PR como originada do sandbox real, com data e cenário, sem identificar cliente real.

## Evidência mínima para fechar #937

- pelo menos 1 pedido real sanitizado do sandbox percorrendo o normalizador de produção;
- recomenda-se cobrir DELIVERY + pagamento online + adicional + benefício/desconto, pois exercita mais campos;
- replay da mesma identidade não cria segundo pedido canônico;
- evento/status externo não cria state machine específica do provider;
- valores do iFood permanecem snapshot externo e não alteram preço/cardápio PedeAqui.

## Segurança

Nunca faça commit do JSON bruto. Se houver dúvida sobre algum campo livre, substitua-o por placeholder antes de versionar. A fixture sanitizada é evidência estrutural/financeira, não arquivo de atendimento.
