# Homologação final da jornada pública — #757

## Candidato

Este gate valida no mesmo commit/configuração a evolução incremental de #751–#756 antes de promover a experiência pública como padrão.

A regra é: **corrigiu catálogo, carrinho, checkout, pricing, pedido ou tracking → repetir o gate completo**.

## Evidência automatizada

O CI executa, nesta ordem:

1. histórico de migrations e preflight de produção;
2. lint;
3. TypeScript;
4. suíte completa de testes;
5. `npm run test:public-ux` com os contratos específicos do gate #757;
6. a jornada `npm run test:e2e` **3 vezes consecutivas no mesmo checkout do commit**;
7. validação do Print Agent;
8. build de produção.

A execução só é aceita quando todas as etapas terminarem verdes.

## Matriz coberta por contratos

| Área | Evidência principal |
| --- | --- |
| Cardápio inicial preservado | `tests/public-menu-layout.test.ts`, `tests/public-product-card.test.ts`, `tests/public-ux-final-gate.test.ts` |
| Quantidade por opção #751 | `tests/modifier-quantity-contract.test.ts`, `tests/public-modifiers-ui.test.ts`, `tests/public-ux-final-gate.test.ts` |
| Complementos #752 | `tests/public-complements.test.ts` |
| Barra do carrinho #753 | `tests/public-cart-bar.test.ts` |
| Carrinho/edição #754 | `tests/public-cart-edit.test.ts`, migration `138_public_cart_atomic_item_replace.sql` |
| Checkout #755 | `tests/progressive-checkout-ui.test.ts`, `tests/public-checkout-readiness.test.ts`, `tests/checkout.test.ts` |
| Acompanhamento #756 | `tests/public-order-tracking-v2.test.ts`, `tests/public-order-timeline.test.ts` |
| Pedido/operação | `tests/e2e-context-journeys.test.ts`, `tests/order-flow-readiness-036-040.test.ts` |
| Impressão | `tests/modifier-quantity-contract.test.ts` + validação sintática do Print Agent |
| Gás | `tests/gas-segment-362-366.test.ts`, contratos do carrinho segmentado |
| Multi-tenant e segurança | `tests/access-isolation-contracts.test.ts`, `tests/final-security-contracts.test.ts`, `tests/security-hardening.test.ts` |
| Mobile/acessibilidade | `tests/mobile-full-layout-qa.test.ts`, `tests/full-accessibility-qa.test.ts`, `tests/component-accessibility.test.ts` |
| Performance | `tests/frontend-performance-qa.test.ts`, `tests/performance-contracts.test.ts` |

## Regras críticas revalidadas

- `quantity_per_option` aceita total entre mínimo e máximo; **não exige preencher até o máximo**;
- `5x Coxinha + 2x Kibe` é válido quando o mínimo foi atendido e o máximo não foi ultrapassado;
- quantidade do produto permanece independente da quantidade interna das opções;
- complementos são opcionais, store-scoped e não usam regra gastronômica automática em Gás/genérico;
- preço do navegador nunca é autoridade;
- edição do carrinho cria a nova montagem validada antes de remover a linha anterior, na mesma transação;
- pagamento exibido e aceito depende dos métodos habilitados pelo servidor;
- delivery/pickup continuam sujeitos às validações oficiais;
- timeline é projeção das state machines existentes;
- página pública do pedido continua exigindo token/cookie seguro;
- não é exibido mapa/rastreamento de entregador sem contrato público seguro real;
- safe-area, foco visível e reduced motion permanecem cobertos.

## Três passagens consecutivas

A etapa `E2E context journeys — 3 consecutive passes` executa o mesmo `npm run test:e2e` três vezes em sequência, sem trocar commit, dependências, checkout do repositório ou configuração entre as passagens.

Se qualquer passagem falhar, o CI falha e a #757 não pode ser mergeada.

## Limite da evidência

O gate não inventa medição de navegador ou GPS. Onde o repositório não possui browser E2E/telemetria pública real, a homologação automática valida contratos, responsividade declarada, state machines, segurança, isolamento e build. Qualquer validação visual manual futura deve usar o mesmo commit aprovado e não substitui estes gates.
