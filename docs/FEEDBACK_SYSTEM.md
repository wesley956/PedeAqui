# PedeAqui — Mensagens e carregamento

> Origem: issue **[265]**.

## Componentes

- `Alert`: aviso persistente dentro do fluxo.
- `Toast`: mensagem temporária com ação e fechamento opcional.
- `Dialog`: diálogo modal acessível baseado no elemento nativo `dialog`.
- `ConfirmDialog`: confirmação padronizada, inclusive destrutiva.
- `EmptyState`: ausência de conteúdo/dados.
- `LoadingState`: espera explícita com texto.
- `Skeleton`: reserva visual de espaço durante carregamento.
- `ErrorState`: falha recuperável ou bloqueante.
- `SuccessState`: conclusão confirmada.

## Linguagem

Mensagens devem dizer o que aconteceu e, quando necessário, o que a pessoa pode fazer em seguida. Não exponha erro técnico, stack trace, código de banco ou detalhe interno para o operador.

## Semântica

`info` e `success` usam `role=status`/`aria-live=polite`. `warning` e `danger` usam anúncio urgente quando a mensagem exige atenção imediata. Estado não depende apenas de cor: todos os componentes incluem texto e marcador visual.

## Diálogo e confirmação

`Dialog` usa `showModal()`, recebe foco pelo comportamento modal nativo e trata fechamento/cancelamento por teclado. Sempre forneça título objetivo. Confirmações destrutivas usam botão `danger`; a ação principal não deve ser duplicada fora do diálogo.

## Loading

Use `LoadingState` quando a área inteira ainda não pode ser operada. Use `Skeleton` quando a estrutura do conteúdo já é conhecida. Botões continuam usando o estado `loading` definido em [262].

## Responsividade

Em celular, ações quebram para largura disponível e o diálogo reduz padding. O sistema respeita `prefers-reduced-motion` para spinner e skeleton.

## Compatibilidade

Os exports antigos `EmptyState` e `Skeleton` de `primitives.tsx` apontam para esta implementação. A migração dos padrões locais espalhados pelos módulos ocorre em [269].
