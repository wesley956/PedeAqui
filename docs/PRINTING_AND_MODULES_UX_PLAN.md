# PedeAqui — melhoria de configuração de módulos e impressão

## Objetivo

Reduzir duas áreas administrativas que estavam exigindo conhecimento técnico demais para o usuário comum:

1. ligar/desligar módulos da unidade;
2. conectar e validar uma impressora térmica.

## Princípios de UX

- ação principal sempre explícita (`Ativar`, `Desativar`, `Instalar`, `Usar esta impressora`, `Imprimir teste`);
- confirmação perto da ação que a originou;
- esconder conceitos técnicos no fluxo básico;
- detectar automaticamente o que o sistema conseguir detectar;
- configuração avançada continua disponível, mas fora do caminho principal;
- nenhuma ação destrutiva apaga histórico;
- toda configuração continua respeitando organização, unidade, RBAC e escopo do Print Agent.

## Módulos — fluxo aplicado

Estado atual desejado:

`Configurações > Módulos > Desativar > Confirmar desativação`

- módulos obrigatórios aparecem como `Sempre ativo`;
- módulos opcionais exibem diretamente `Ativar` ou `Desativar`;
- a confirmação aparece no próprio cartão;
- dependências/bloqueios são explicados antes de aplicar;
- desativar remove a ferramenta da experiência da unidade sem apagar histórico.

## Impressão — fluxo básico novo

### Etapa 1 — instalar/conectar o computador

- gerar uma conexão para o computador do caixa;
- oferecer um instalador assistido para Windows já configurado com a URL do PedeAqui e a credencial daquele Print Agent;
- não exigir que o operador copie variáveis de ambiente ou execute `npm start`;
- manter instruções técnicas somente em `Configuração avançada`.

### Etapa 2 — detectar a impressora

O Print Agent passa a enviar no heartbeat a lista de impressoras instaladas no Windows. O painel mostra essas impressoras como opções encontradas automaticamente.

Fluxo esperado:

`Impressora encontrada > Usar esta impressora`

Ao escolher uma impressora encontrada, o PedeAqui:

- cria a impressora com transporte RAW do Windows;
- vincula ao computador correto;
- cria/usa um destino padrão `Pedidos` quando necessário;
- liga esse destino à impressora;
- deixa o roteamento avançado opcional.

### Etapa 3 — teste físico

Cada impressora cadastrada recebe um botão `Imprimir teste`.

O teste entra na mesma fila durável usada em produção e imprime um comprovante curto:

`PedeAqui — impressora configurada com sucesso`.

A tela exibe saúde da impressora e orienta o usuário a atualizar o status após o papel sair.

## Configuração avançada

Continuam disponíveis, mas recolhidos:

- impressora por IP/rede;
- porta 9100;
- largura 58/80 mm;
- cópias;
- fallback;
- estações de produção/expedição/balcão;
- roteamento de produtos por estação;
- fila, retry, cancelamento e reimpressão.

## Segurança

- token do Print Agent continua sendo credencial individual e armazenado no servidor somente como hash;
- instalador assistido contém apenas a credencial do próprio agente, nunca `SUPABASE_SERVICE_ROLE_KEY`;
- impressoras detectadas são enviadas como capacidade do agente autenticado;
- quick setup valida que o computador e a impressora pertencem à unidade atual;
- teste de impressão é criado server-side com `printing.manage` e escopo org/store;
- nenhuma migration de banco é necessária para esta fase.

## Critérios de aceite

- usuário comum não precisa digitar nome de impressora Windows quando o agente conseguir detectá-la;
- usuário comum não precisa entender estação/rota para uma única impressora;
- instalação assistida reduz o fluxo normal a baixar/executar/conectar;
- primeira impressora pode ser configurada em `Conectar computador > Usar impressora > Imprimir teste`;
- fluxo manual antigo continua disponível em modo avançado;
- CI, testes e build devem permanecer verdes.
