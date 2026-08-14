# PedeAqui — Tela inicial por contexto operacional

> Issue lógica: **[275]**

## Regra principal

Um login genérico deve abrir a primeira superfície útil para o trabalho atual. Um **deep link explícito e seguro** continua tendo prioridade e não é substituído pela tela inicial contextual.

## Rotas preferidas

| Contexto | Entrada preferida | Fallbacks |
|---|---|---|
| Gestão | Dashboard | Pedidos, Caixa, Financeiro |
| Gerente | Pedidos | Salão, Dashboard |
| Caixa | PDV | Caixa, Pedidos |
| Atendimento | Conversas | Pedidos, Clientes |
| Salão | Salão/Mesas | Pedidos, PDV |
| Cozinha | Produção/KDS | Pedidos |
| Entrega | Meu roteiro | Entregas, Pedidos |
| Administrativo | Cardápio | Estoque, Configurações, Dashboard |

A rota só é escolhida se o módulo estiver presente na navegação já filtrada pelas permissões atuais.

## Múltiplos papéis

Para evitar comportamento dependente da ordem de retorno do banco, a precedência é fixa:

`cozinha → entrega → salão → caixa → atendimento → gerente → administrativo → gestão`.

A lógica favorece a função especializada do turno. Exemplo: um proprietário que também está atuando como caixa abre o PDV; um proprietário/caixa que também está no salão abre Mesas.

## Fallback sem acesso

Quando não existe nenhuma superfície permitida, o destino é `/acesso-negado`, que explica que o perfil precisa ser revisado. Isso evita enviar o usuário para uma tela conhecida, porém não autorizada.

## Pontos de entrada cobertos

- `/` autenticado;
- login sem parâmetro `next`;
- conclusão da troca de senha.

Cadastro e confirmação de e-mail continuam levando ao onboarding quando esse é o fluxo explicitamente solicitado.

## Segurança de deep links

`next` só é aceito quando começa com `/` e não começa com `//`, impedindo redirecionamento externo. Quando válido, ele vence o resolver contextual para preservar a intenção do usuário.
