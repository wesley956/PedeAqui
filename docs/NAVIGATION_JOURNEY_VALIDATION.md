# PedeAqui — Validação das jornadas de navegação

> Issue lógica: **[277]**

## Escopo validado

O gate cobre cinco jornadas representativas em cima das mesmas funções puras usadas pela aplicação:

| Jornada | Entrada | Núcleo esperado |
|---|---|---|
| Gestão | `/dashboard` | Dashboard, Pedidos, Caixa, Financeiro |
| Caixa | `/pdv` | PDV, Caixa, Pedidos |
| Salão | `/salao` | Mesas/Salão, Pedidos |
| Cozinha | `/producao` | Produção, Pedidos |
| Entrega | `/entregador` | Roteiro, Entregas, Pedidos |

Para cada jornada os testes validam:

- rota inicial contextual;
- itens disponíveis no menu desktop;
- até quatro ações diretas no mobile;
- união das ações diretas + `Mais` sem perder módulos permitidos;
- entrada principal alcançável no mobile;
- ausência de loop para `/`.

## Segurança e autenticação

Também é validado que:

- o layout protegido continua chamando `requireAuthenticatedUser()`;
- usuário sem nenhuma superfície permitida recebe `/acesso-negado`;
- login com deep link interno seguro preserva `next`;
- login genérico usa `StartRouteService`;
- logout termina em `/login`;
- módulos sem permissão não entram na navegação contextual.

## Nível do teste

O repositório atual não possui Playwright, Cypress ou outra infraestrutura de browser E2E; o `package.json` usa **Vitest** para testes automatizados. Portanto esta issue adiciona um gate de jornada em nível de contrato/integração das regras de navegação e mantém o **build completo do Next.js** como parte do CI.

Isso não deve ser descrito como teste visual de navegador. A homologação visual/responsiva completa continua nas issues [312]–[317].

## Resultado esperado

Mudanças futuras na ordem contextual, permissões, start route ou composição mobile falham no CI se quebrarem uma das jornadas-base acima.
