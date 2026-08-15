# Painel — baseline e otimizações [336]

## Escopo

Esta rodada trata gargalos observáveis no shell autenticado, autorização repetida, navegação e realtime de pedidos sem remover validações, reduzir isolamento ou introduzir cache compartilhado entre restaurantes.

## Antes

Uma navegação autenticada podia resolver a mesma identidade e o mesmo contexto de organização/unidade em mais de um ponto da árvore do servidor:

1. o layout protegido validava o usuário;
2. `NavigationAccessService` resolvia novamente o contexto e, por consequência, a autenticação;
3. serviços chamados pela própria página frequentemente executavam `authorize()`, que voltava a resolver o contexto;
4. duas chamadas para a mesma permissão podiam repetir a mesma RPC `has_permission` dentro do request;
5. cabeçalho operacional também podia precisar do mesmo contexto durante a mesma renderização.

Isso repetia trabalho de autenticação/contexto, leituras de membership/unidade e verificações idênticas de permissão dentro de uma única request de renderização.

No realtime de pedidos, cada alteração recebida da tabela `orders` executava `router.refresh()` imediatamente. Uma única operação pode persistir mais de uma mudança em sequência, produzindo rajadas de refresh da árvore do servidor.

As páginas autenticadas também não possuíam um `loading.tsx` comum no segmento `(app)`, então uma navegação dependente do servidor podia parecer parada até a resposta seguinte chegar.

## Depois

### Memoização request-local

`getAuthenticatedUser`, `getAccessContext`, `NavigationAccessService.load` e verificações idênticas de permissão agora usam `cache()` do React. A memoização é **request-local** no fluxo de renderização do servidor; não existe `Map` global, `unstable_cache` ou chave reaproveitada entre usuários/tenants.

Consequência esperada e verificável pelo contrato do código:
- a identidade é resolvida uma vez para consumidores repetidos na mesma renderização;
- membership e unidade ativa são resolvidos uma vez no mesmo request;
- a matriz de navegação/permissões não é reconstruída repetidamente quando mais de um consumidor pede o mesmo snapshot;
- a mesma permissão da mesma organização/unidade não dispara a mesma verificação várias vezes no mesmo request.

Autorização continua server-side e cada nova request continua validando seu próprio contexto.

### Realtime

Alterações consecutivas em `orders` passam por uma janela curta de 160 ms. Enquanto existir um refresh agendado, novos eventos não criam outro. Ao desmontar o componente, o timer é cancelado e o canal é removido.

A atualização continua sendo um `router.refresh()` autoritativo; apenas eventos em rajada são consolidados. Não foi introduzida projeção local que pudesse deixar estado de pedido incorreto.

### Feedback de navegação

O segmento autenticado passou a possuir uma tela de carregamento leve e responsiva. O shell permanece estável enquanto o conteúdo seguinte carrega e o usuário recebe feedback imediato da navegação. A animação respeita `prefers-reduced-motion`.

Esse feedback não substitui a otimização real: ele acompanha as reduções de trabalho repetido descritas acima.

## Segurança e consistência

Não foi feito:
- cache de tenant entre requests;
- cache global de sessão/permissão;
- remoção de RBAC/RLS;
- escrita otimista de status financeiro ou de pedido;
- redução de validações server-side;
- alteração de state machines;
- índice de banco especulativo.

## P50/P75

Os valores de P50/P75 de navegação autenticada **não foram inventados** nesta issue. O repositório não possui, neste fluxo, uma fonte histórica confiável de Web Vitals autenticados por rota que permita comparar percentis reais sem instrumentação adicional.

A evidência desta rodada é estrutural e reproduzível por testes/CI: quantidade de resoluções repetidas dentro do mesmo request foi reduzida por memoização request-local, verificações idênticas de permissão foram consolidadas e refreshes realtime em rajada foram agrupados. Percentis reais de produção devem ser registrados quando a telemetria de navegação autenticada estiver disponível, sem usar números sintéticos como se fossem tráfego real.

## Relação com baselines anteriores

- [310] já tratou fases de I/O e limites de payload no backend.
- [316] já tratou menu público, imagens e trabalho de renderização no frontend público.
- [336] concentra-se no shell autenticado e na percepção de resposta do painel.

## Gates

- lint;
- TypeScript;
- testes unitários/contratos;
- E2E de contexto;
- Print Agent;
- build.
