# WhatsApp Intelligence Lab — PedeAqui

Status: fundação v1
Issue de rastreio: #1045

## Objetivo

Criar uma pequena camada de inteligência e homologação para o WhatsApp sem substituir nem contornar as regras reais do PedeAqui. A inteligência interpreta linguagem, contexto e intenção; a execução continua usando catálogo, carrinho, preço, entrega, pagamento, pedidos, benefícios e segurança já existentes como fonte de verdade.

A matriz inicial possui 720 cenários determinísticos e deve crescer com falhas reais anonimizadas. Nenhuma correção de linguagem pode liberar uma ação que o fluxo operacional atual não permitiria.

## Arquitetura protegida

Fluxo de entrada:

1. webhook Meta recebe mensagem;
2. roteamento identifica unidade e conversa;
3. `ConversationGreetingService` só responde quando conversa está em estado `bot`;
4. sessão de automação decide menu/rastreamento/pedido;
5. `bot-menu.ts` resolve intenções gerais;
6. `whatsapp-direct-order-orchestrator.ts` entrega mensagens de pedido ao serviço de pedido;
7. `whatsapp-smart-order-service.ts` aplica proteções contextuais antes do serviço principal;
8. `whatsapp-learning-order-service.ts` adiciona aprendizado seguro/endereço salvo/composição sortida;
9. `whatsapp-order-service.ts` continua sendo a fonte operacional do fluxo de montagem;
10. carrinho, pricing, entrega e criação de pedido continuam usando os serviços canônicos do PedeAqui.

A inteligência não deve criar uma segunda implementação de preço, catálogo, carrinho ou pedido.

## Estados do menu

- `menu`
- `awaiting_tracking_code`

Intenções existentes que não podem desaparecer:

- menu;
- cardápio;
- iniciar rastreamento;
- consultar código de rastreamento;
- falar com humano;
- handoff por contestação de benefício;
- horários;
- pagamento;
- entrega;
- iniciar pedido WhatsApp;
- benefícios;
- cashback;
- pontos;
- cupons;
- promoções;
- desconhecido/fallback.

## Estados do pedido WhatsApp

- `order_items`: produto, embalagem, composição e complementos;
- `order_name`: identificação do cliente;
- `order_fulfillment`: entrega ou retirada;
- `order_address`: endereço e cobertura/taxa;
- `order_payment`: forma de pagamento;
- `order_confirmation`: revisão e confirmação final.

Uma pergunta intermediária pode suspender momentaneamente a resposta da etapa, mas não pode apagar a etapa nem o contexto já validado.

## Funções do PedeAqui que a inteligência não pode quebrar

### Catálogo

- organização/unidade sempre filtradas;
- somente produto ativo e não excluído;
- somente modificador ativo e não excluído;
- produto pausado não é oferecido como disponível;
- nomes informais são aliases, nunca novos produtos;
- preços vêm do catálogo/pricing real.

### Carrinho e composição

- quantidade da embalagem é diferente da capacidade da embalagem;
- `1 caixa com 30` nunca pode virar `30 caixas`;
- quantidade explícita de várias embalagens deve ser preservada;
- composição deve respeitar `distribution_total` e regras do grupo;
- sortido usa apenas sabores ativos e permitidos;
- alterar composição não duplica item;
- refazer pedido descarta o rascunho anterior com segurança.

### Checkout/pedido

- nenhum pedido é criado antes da confirmação final exigida pelo fluxo;
- o total é recalculado pelo serviço canônico;
- taxa de entrega é calculada pela configuração real da unidade;
- forma de pagamento deve existir na configuração da unidade;
- pedidos WhatsApp entram no mesmo fluxo operacional dos outros canais depois de criados;
- impressão, cozinha/KDS, financeiro, notificações e gestão do pedido devem continuar recebendo o pedido canônico normal.

### Entrega e retirada

- endereço salvo só pode ser usado quando pertence ao cliente corretamente vinculado;
- cobertura e taxa não são inferidas pela camada de linguagem;
- mudança entrega -> retirada ou retirada -> entrega mantém itens, mas recalcula o que for necessário;
- agendamento só é prometido se o fluxo real suportar aquele horário.

### Rastreamento e privacidade

- número do pedido isolado só é aceito dentro do contexto de rastreamento;
- texto explícito `pedido N` pode acionar busca direta;
- resultado só é exibido quando o pedido pode ser vinculado ao cliente/telefone com segurança;
- em caso de dúvida, o bot não revela dados e oferece recuperação segura/handoff;
- endereço ou detalhes de outro cliente nunca são exibidos.

### Atendimento humano

- ao solicitar humano, a conversa sai do fluxo automático e entra em espera humana;
- a automação não continua disputando respostas com o atendente;
- falha de envio do provedor também pode provocar fallback seguro para humano.

### Benefícios

Continuam preservados como intents independentes:

- cashback;
- pontos;
- cupons;
- promoções;
- benefícios gerais;
- contestação de saldo com handoff.

A matriz de linguagem não pode fazer `pedido`, `pix`, `desconto` ou palavras semelhantes capturarem indevidamente esses fluxos.

### Idempotência e provedor

- mensagem recebida duplicada não gera resposta duplicada;
- confirmação repetida não cria pedido duplicado;
- erro Meta/WhatsApp é registrado sem inventar sucesso;
- `external_message_id`, `client_message_id` e contratos existentes permanecem respeitados.

## Matriz v1 — 720 cenários

A v1 usa 60 sementes semânticas x 12 variações linguísticas = 720 cenários.

Famílias, 48 cenários cada:

1. intenção/menu;
2. linguagem de produto;
3. quantidade/embalagem;
4. composição/sabores;
5. contexto/memória;
6. alteração/correção;
7. entrega/endereço;
8. pagamento;
9. rastreamento;
10. português informal/abreviações;
11. múltiplas intenções;
12. mensagens fragmentadas;
13. mídia/ruído/link externo;
14. segurança;
15. social/recuperação.

Variações linguísticas aplicadas a cada semente:

- original;
- saudação antes da frase;
- `por favor`;
- emoji;
- interrogação;
- exclamação;
- caixa alta;
- sem acentos;
- espaços duplicados;
- `então` como prefixo contextual;
- pedido educado (`me ajuda`);
- saudação noturna.

## Cenários críticos

Qualquer falha destes tipos bloqueia promoção:

- quantidade de pacote incorreta;
- confirmação sem consentimento explícito;
- rastreamento/dado de outro cliente;
- produto/modificador inativo sendo aceito;
- total/preço inventado;
- perda de isolamento entre organização/unidade;
- item duplicado após correção;
- handoff ignorado;
- regressão que impeça checkout/pedido/KDS/impressão/financeiro de receber o pedido normal.

## Score de inteligência

O score futuro será calculado com pesos, mas a regra de promoção é anterior ao score:

1. zero falha crítica;
2. CI verde;
3. homologação de navegador verde;
4. nenhuma queda em cenários anteriormente aprovados;
5. só depois considerar ganho de score.

Meta de referência:

- abaixo de 70: insuficiente;
- 70–79: funcional;
- 80–89: bom;
- 90–94: muito bom;
- 95+: excelente;
- qualquer falha crítica: reprovado, independentemente da nota.

## Uso das conversas reais

Conversas reais entram apenas como fonte de padrões, preferencialmente anonimizadas. Sinais para criar candidato de teste:

- `não entendi`;
- cliente repete ou reformula;
- cliente corrige o bot;
- cliente pede humano logo após resposta automática;
- abandono durante montagem;
- produto errado sugerido;
- quantidade inesperada;
- bot perde etapa atual;
- humano precisa responder algo que deveria estar no catálogo/configuração.

Uma falha real corrigida deve virar cenário permanente de regressão.

## Plano de implementação

### Lote 1 — Fundação

- matriz 720;
- mapeamento de contratos;
- testes de invariantes já existentes;
- registro dos casos reais da Dona Maria.

### Lote 2 — Intenção e linguagem

- `fazer pedido` x `acompanhar pedido`;
- consultas de preço/cardápio;
- agradecimentos/`ok` sem fallback agressivo;
- typos e abreviações de alta confiança.

### Lote 3 — Inteligência contextual dentro do pedido

- perguntas de sabores/preço/disponibilidade sem perder etapa;
- composição parcial;
- correções incrementais;
- duas intenções na mesma mensagem.

### Lote 4 — Recuperação e confiança

- classificação alta/média/baixa confiança;
- confirmar em vez de adivinhar;
- recuperação segura de pedido quando telefone não coincide;
- mídia/links externos sem contaminar o carrinho.

### Lote 5 — Aprendizado contínuo

- transformar falhas reais em candidatos de teste;
- promoção segura de aliases;
- métricas por loja e globais sem cruzar dados privados;
- score e relatório de regressão por PR.

## Regra para futuras mudanças

Nenhuma mudança de inteligência deve substituir serviço operacional existente apenas para fazer um cenário passar. O cenário deve ser resolvido usando as mesmas fontes de verdade usadas pelo restante do PedeAqui. Quando houver conflito entre uma interpretação linguística e uma regra operacional, a regra operacional vence e o bot pergunta ao cliente.