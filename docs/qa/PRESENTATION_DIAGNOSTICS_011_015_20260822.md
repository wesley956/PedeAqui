# Diagnóstico de apresentação — lote PA-DIAG-011 a PA-DIAG-015

Data de corte: 2026-08-22  
Master: GitHub #539  
Issues executadas neste lote: #550, #551, #552, #553 e #554

## Resultado executivo

| Diagnóstico | Issue | Estado | Resultado |
| --- | --- | --- | --- |
| `PA-DIAG-011` destino inicial por papel | #551 | Aprovado após correção | Financeiro agora abre `/financeiro`; demais sete papéis mantêm destinos operacionais testados |
| `PA-DIAG-012` isolamento entre estabelecimentos | #553 | Aprovado | sessão real enxergou a própria associação e zero organizações, lojas ou produtos estrangeiros |
| `PA-DIAG-013` bloqueio por URL sem autorização | #554 | Aprovado no contrato e acesso anônimo | layout filtra módulos e serviços repetem autorização; URLs protegidas sem sessão voltam ao login |
| `PA-DIAG-014` convite, criação e remoção de funcionários | #552 | Parcial | CRUD seguro de equipe implementado; aceite por uma segunda identidade/e-mail continua externo |
| `PA-DIAG-015` produto com foto | #550 | Causa confirmada e corrigida | aplicação aceitava 5 MiB, acima do payload máximo de 4,5 MB da Vercel; teto seguro passou a 4 MiB |

## PA-DIAG-011 — destino por papel

O login genérico resolve somente rotas presentes na navegação autorizada. A matriz final é:

| Papel | Contexto | Primeiro destino preferido |
| --- | --- | --- |
| Proprietário | gestão | `/dashboard` |
| Gerente | gerência | `/pedidos` |
| Caixa | caixa | `/pdv` |
| Atendente | atendimento | `/conversas` |
| Garçom | salão | `/salao` |
| Cozinha | produção | `/producao` |
| Entregador | entrega | `/entregador` |
| Financeiro | administrativo | `/financeiro` |

Falha corrigida: o contexto administrativo não priorizava Financeiro e podia cair no Dashboard ou em outra tela disponível. O resolver agora testa `finance` antes das superfícies administrativas genéricas.

## PA-DIAG-012 — isolamento real

Uma sessão `authenticated` real, pertencente a exatamente uma organização, foi simulada no PostgreSQL usando as mesmas claims consumidas pelo RLS. O resultado foi:

- própria associação visível: `true`;
- organizações estrangeiras visíveis: `0`;
- lojas estrangeiras visíveis: `0`;
- produtos estrangeiros visíveis: `0`.

O teste foi somente leitura e terminou com `ROLLBACK`. Nenhum identificador foi copiado para este relatório.

## PA-DIAG-013 — acesso direto por URL

- `/onboarding` e `/platform/novo-restaurante` sem sessão redirecionam para `/login`;
- o layout autenticado converte o pathname em módulo e envia módulo indisponível para `/recurso-indisponivel`;
- esconder item de menu não é autorização: cada serviço sensível chama `authorize`, `authorizeOrganization` ou o guard próprio da plataforma;
- `team`, catálogo, finanças e demais módulos validam permissão no servidor;
- o super admin permanece separado dos papéis de organização.

O teste completo por navegador para cada um dos oito papéis depende das contas de homologação específicas. O contrato, o RLS live e o acesso anônimo foram aprovados.

## PA-DIAG-014 — CRUD de equipe

A rota `/equipe`, antes declarada pelo módulo mas ausente, agora implementa:

- **Create:** convite com e-mail, função e unidades; token bruto é exibido uma vez e nunca persistido;
- **Read:** membros, funções, unidades e convites com estado atual;
- **Update:** suspensão atômica do acesso, removendo atribuições de loja e preservando o membro/histórico;
- **Delete sem perda:** cancelamento expira o convite em vez de apagar a trilha.

A migration `115_team_management.sql` restringe as duas mutações ao `service_role`, revalida `team.manage` pelo ator, bloqueia auto-suspensão e bloqueia suspensão do proprietário. Em teste transacional live, cancelar um convite sintético expirou o convite e gravou auditoria; a auto-suspensão foi recusada e o proprietário permaneceu ativo. Tudo terminou em `ROLLBACK`.

Não existe hoje um segundo membro não proprietário na base para provar a suspensão feliz sem criar identidade real. O aceite do convite e o e-mail também exigem conta de homologação; por isso a classificação permanece parcial.

## PA-DIAG-015 — foto do produto

### Causa

O bucket não era o problema. `catalog-media` existe, é público, aceita JPEG/PNG/WebP, limita o objeto a 5 MiB e continha quatro objetos no momento da leitura.

O defeito estava entre a aplicação e a hospedagem:

- cliente e servidor aceitavam imagem de até 5 MiB;
- o Server Action enviava o arquivo inteiro pela Vercel Function;
- a Vercel limita request e response body a 4,5 MB;
- multipart e metadados ainda adicionam bytes ao arquivo.

Assim, uma foto válida para o formulário podia receber `413 FUNCTION_PAYLOAD_TOO_LARGE` antes de alcançar o serviço de Storage. Referência oficial: https://vercel.com/docs/functions/limitations.

### Correção

- teto do seletor e do servidor reduzido para 4 MiB, deixando margem para multipart;
- mensagem agora informa “até 4 MB” antes do envio;
- bucket permanece em 5 MiB, pois o limite mais baixo pertence ao transporte da aplicação;
- preflight e testes impedem regressão para 5 MiB no Server Action;
- rollback do objeto continua obrigatório se a persistência do produto falhar.

Para a apresentação, use JPEG/PNG/WebP abaixo de 4 MB. Fotos maiores devem ser reduzidas no aparelho; upload direto ao Storage ou compressão automática pode ser evoluído depois sem atravessar a função.
