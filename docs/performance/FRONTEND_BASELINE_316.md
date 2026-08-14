# [316] Baseline e homologação de performance frontend

Data: 2026-08-14

## Escopo

Rotas prioritárias: cardápio público/produto/carrinho/checkout, Dashboard, Pedidos, PDV e KDS.

O ambiente de CI não possui um catálogo de produção populado nem navegador com throttling reproduzível para publicar números artificiais de Lighthouse. Por isso o baseline desta issue combina **build completo + contratos mensuráveis de trabalho/renderização**, sem inventar milissegundos de LCP.

## Antes → depois

| Caminho | Antes | Depois | Efeito esperado/medido estruturalmente |
|---|---|---|---|
| busca do cardápio | normalização + filtro completo sincronizados a cada tecla | `useDeferredValue` mantém a digitação urgente e posterga o filtro | input deixa de competir na mesma prioridade com varredura de todo catálogo |
| categorias longas | todas as seções participavam de style/layout/paint inicial | `content-visibility:auto` + `contain-intrinsic-size` por categoria | categorias fora do viewport podem pular renderização até se aproximarem da tela |
| thumbs de produto | `loading=lazy`, decode padrão | `loading=lazy` + `decoding=async`, dimensões explícitas | rede continua lazy e decode não precisa bloquear o fluxo principal; largura/altura preservam espaço contra CLS |
| itens do carrinho | imagem com dimensão, porém sem lazy/decode explícito | `loading=lazy` + `decoding=async` | carrinhos longos deixam imagens fora da dobra para depois |
| hero do produto | imagem acima da dobra sem prioridade explícita | `fetchPriority=high` + `decoding=async`, dimensões 720×360 | sinaliza o candidato de LCP sem priorizar thumbs secundários |

## JS e hidratação

- Dashboard, Pedidos, carrinho e checkout principal continuam server-first.
- O cardápio hidrata somente a interação necessária de busca/categorias; a busca agora usa deferred rendering.
- KDS mantém client/realtime porque atualização operacional é requisito funcional.
- PDV permanece cliente interativo por necessidade de seleção/carrinho local; não foi criada uma segunda cópia de estado.
- Nenhuma biblioteca de UI, fonte remota ou runtime novo foi adicionado nesta issue.

## Imagens

As imagens de restaurante/produto são URLs configuráveis por tenant. Não foram migradas cegamente para `next/image`, porque exigir `remotePatterns` para hosts arbitrários poderia quebrar cardápios existentes. A otimização segura nesta etapa usa atributos nativos, dimensões e prioridade coerente:

- hero: prioridade alta;
- thumbs: lazy;
- decode: assíncrono;
- dimensões: preservadas para reduzir layout shift.

Uma futura pipeline de mídia própria poderá usar CDN/transformação quando houver domínio de origem controlado.

## Requests e cache

- O menu público continua vindo por RPC agregador, evitando N requests por categoria/produto.
- Checkout permanece server-side e não duplica fetch no cliente.
- Tracking de pedido já suspende polling com aba oculta ([303]) e o backend de polling foi reduzido em [310].
- KDS usa realtime e refresh controlado em vez de polling de alta frequência.
- Não foi adicionado cache a dados operacionais mutáveis sem uma política de invalidação explícita.

## Skeletons e tarefa principal

Estados compartilhados de `LoadingState`/Skeleton continuam disponíveis. Nenhuma rota crítica foi envolvida por um loading artificial que atrasasse a primeira ação. A otimização do cardápio evita pintar conteúdo distante sem esconder o conteúdo visível.

## LCP / CLS / hidratação

- **LCP:** hero de produto recebe `fetchPriority=high` quando existe foto.
- **CLS:** thumbs e hero preservam `width`/`height`; placeholders mantêm dimensões equivalentes.
- **hidratação:** nenhuma nova ilha cliente foi criada; busca usa scheduling concorrente do React.

## Gate

`tests/frontend-performance-qa.test.ts` protege deferred search, content visibility, prioridade exclusiva do hero, lazy thumbs, dimensões e ausência de biblioteca/runtime de performance adicional. O build Next completo continua obrigatório no CI.
