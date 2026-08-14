# PedeAqui — Tokens Estruturais

> Issue lógica: **[260]** · Complementa `docs/BRAND_IDENTITY.md` e `docs/DESIGN_TOKENS.md`.

Esta é a fonte de verdade para **tipografia, espaçamento, raios, elevação, dimensões de controles, larguras, camadas, movimento e breakpoints** da interface PedeAqui.

## 1. Princípios

- novos componentes devem consumir tokens antes de criar medidas locais;
- medidas arbitrárias continuam permitidas apenas quando houver necessidade funcional documentada;
- a escala estrutural não substitui tokens semânticos de cor da [259];
- o white-label altera identidade permitida do restaurante, não a geometria base do design system;
- telas operacionais especiais (ex.: KDS) podem ampliar tipografia e touch target, mas devem derivar desta base.

## 2. Tipografia

Família principal:

```css
var(--font-sans)
```

Stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

O sistema **não depende de download de fonte externa** para renderizar a interface. Caso Inter não esteja disponível localmente, a pilha cai para a fonte nativa do sistema.

### Escala

| Token | Valor | Uso principal |
|---|---:|---|
| `--font-size-xs` | 12 px | meta, hint, badges |
| `--font-size-sm` | 14 px | labels, controles compactos |
| `--font-size-md` | 16 px | corpo base |
| `--font-size-lg` | 18 px | subtítulos e destaque moderado |
| `--font-size-xl` | 20 px | seção |
| `--font-size-2xl` | 24 px | títulos operacionais |
| `--font-size-3xl` | 32 px | títulos de tela |
| `--font-size-display` | 40 px | comunicação/display controlado |

Line-height: `tight 1.1`, `snug 1.25`, `normal 1.5`, `relaxed 1.7`.

Pesos oficiais: 400, 500, 600, 700 e 800. Evitar 900 como padrão de interface.

## 3. Espaçamento

A escala usa base de **4 px**:

`0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px`

Tokens: `--space-0`, `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-5`, `--space-6`, `--space-8`, `--space-10`, `--space-12`, `--space-16`.

Regra prática:
- dentro de controles: 8–16 px;
- entre elementos relacionados: 8–12 px;
- entre blocos: 16–24 px;
- entre seções: 32–48 px.

## 4. Raios e elevação

Raios: `6, 8, 10, 14, 18, 22 px` e `pill`.

- `--radius-md`: controles;
- `--radius-lg`: cards padrão;
- `--radius-xl/2xl`: superfícies promocionais ou containers maiores;
- `--radius-pill`: badges/chips.

Sombras `sm`, `md` e `lg` existem para hierarquia de elevação. Não usar sombra pesada como decoração permanente.

## 5. Controles e densidade

Alturas:

| Token | Valor | Uso |
|---|---:|---|
| `--control-height-sm` | 36 px | desktop compacto, baixa frequência |
| `--control-height-md` | 42 px | padrão desktop |
| `--control-height-lg` | 48 px | touch/tablet/celular |
| `--control-height` | dinâmico | primitive padrão |

Em dispositivos com `pointer: coarse`, `--control-height` sobe automaticamente para 48 px e o padding horizontal aumenta.

Isso permite que os mesmos componentes funcionem em mouse e touch sem duplicar markup.

## 6. Larguras de conteúdo

- `--content-compact`: 640 px;
- `--content-reading`: 720 px;
- `--content-standard`: 1180 px;
- `--content-wide`: 1440 px.

A `.container` global usa `--content-standard` e gutters da escala de spacing.

## 7. Breakpoints canônicos

- mobile: **640 px**;
- tablet: **820 px**;
- desktop: **1180 px**;
- wide: **1440 px**.

Os valores também são expostos como `--breakpoint-*` para documentação/consistência. **CSS custom properties não funcionam diretamente nas condições de `@media`**, então media queries usam os mesmos valores literais e devem permanecer sincronizadas com esta tabela.

Não criar breakpoint novo por módulo sem justificativa funcional.

## 8. Camadas / z-index

Escala:

`base 0 → raised 10 → sticky 100 → dropdown 200 → overlay 400 → modal 500 → toast 600`.

Evitar números como `9999` em componentes locais.

## 9. Movimento

Durações:
- fast: 120 ms;
- normal: 180 ms;
- slow: 280 ms.

Usar `--ease-standard` para transições comuns e `--ease-emphasized` apenas em mudanças com maior deslocamento/hierarquia.

Quando `prefers-reduced-motion: reduce` estiver ativo, as durações globais caem para `0.01ms` e animações/transições são reduzidas automaticamente.

## 10. Primitives migrados nesta etapa

A [260] aplica a escala diretamente em:

- `Button`;
- `Input`;
- `Select`;
- `Card`;
- `Badge`;
- `EmptyState`;
- `Skeleton`.

A migração de telas existentes que ainda possuam medidas inline arbitrárias fica para [269] e para os redesigns específicos de cada módulo.

## 11. Critério para novos componentes

Antes de adicionar `padding: 13px`, `border-radius: 11px`, `min-height: 43px` ou equivalente, verificar se um token existente atende ao caso. Se não atender e a necessidade for recorrente, propor evolução da escala central em vez de criar uma nova medida isolada.
