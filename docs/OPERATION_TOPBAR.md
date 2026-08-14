# PedeAqui — Barra superior operacional

> Issue lógica: **[274]**

## Objetivo

A barra superior deve mostrar contexto útil para o turno, não detalhes da arquitetura interna do SaaS.

## Dados exibidos

- nome da unidade atual, quando disponível;
- estado da unidade, quando o cadastro fornece um estado conhecido;
- estado do caixa do usuário quando ele possui `cash.view`;
- nome do caixa físico quando existe uma sessão aberta ligada a um caixa;
- e-mail do usuário e ação de sair.

Quando não existe dado operacional suficiente, o fallback é **“Operação disponível”**. A interface não inventa contadores, atrasos, notificações ou estados que não tenham fonte autoritativa conectada.

## Fonte dos dados

`OperationHeaderService` usa o contexto já resolvido pelo `NavigationAccessService`.

- unidade: consulta normal ao Supabase, sujeita à RLS existente;
- caixa: só é consultado quando `cash.view` está entre as permissões efetivamente resolvidas e a permissão é novamente validada com `authorize` antes da leitura privilegiada;
- não existe polling, `setInterval`, `setTimeout` ou efeito client-side para atualizar estes sinais.

O status é recalculado na renderização server-side seguinte da aplicação. Atualização em tempo real da topbar só deve ser adicionada no futuro se houver uma fonte/evento autoritativo que justifique o custo.

## Linguagem

Removido da experiência visível o texto técnico sobre “contexto multiempresa”. A topbar fala em termos do restaurante: unidade e caixa.

Os sinais usam texto explícito, por exemplo **“Caixa aberto”** e **“Caixa não aberto por você”**. A cor é somente reforço visual e nunca o único meio de comunicar estado.

## Fora de escopo

- inventar contagem de pedidos pendentes ou atrasados;
- criar um novo sistema de notificações;
- alterar regras do caixa;
- alterar seleção de unidade;
- criar polling global.
