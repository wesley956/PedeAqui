# PedeAqui — Identidade Visual Oficial

## Marca

**Nome:** PedeAqui  
**Tagline:** Seu pedido começa aqui.

A identidade foi definida antes da implementação do produto e deve ser tratada como fonte oficial para painel, cardápio público, PDV, materiais comerciais e futuros aplicativos.

## Paleta oficial

| Token | Cor | Uso |
|---|---|---|
| `brand-orange` | `#FF6B00` | ação principal, destaque e parte “Aqui” da marca |
| `brand-orange-dark` | `#E65300` | hover/press, gradientes e contraste |
| `brand-yellow` | `#FFB800` | destaque secundário pontual |
| `brand-graphite` | `#171717` | fundo/wordmark principal |
| `brand-graphite-2` | `#242424` | superfícies e cards escuros |
| `brand-warm-white` | `#FFFDF9` | fundos claros e texto sobre grafite |
| `brand-ink` | `#181818` | texto escuro |
| `success` | `#22C55E` | estados positivos/operacionais |

## Conceito do símbolo

O conceito aprovado combina:

- localização / “Aqui”;
- pedido / ação;
- um símbolo que pode remeter a um `P`;
- leitura simples em tamanhos pequenos;
- linguagem tecnológica e gastronômica sem depender de ilustração complexa.

A composição de wordmark definida é:

- **Pede** em grafite/escuro;
- **Aqui** em laranja;
- em fundo escuro, **Pede** pode usar branco quente e **Aqui** permanece laranja.

## Arte original

A arte gerada no chat de identidade do projeto em 10/08/2026 está na File Library como `image-gen-1.png` e foi criada após a aprovação de **laranja + grafite** e do pedido por uma base vetorial/SVG.

No momento desta atualização, o conector de File Library localizou a arte, mas não conseguiu abrir/exportar seu binário para o repositório. Portanto:

1. não redesenhar silenciosamente a logo e chamá-la de original;
2. usar estes tokens oficiais em todo o sistema;
3. quando o binário original estiver acessível, derivar dele o SVG mestre e variantes;
4. manter o asset da marca desacoplado do layout para que a troca não exija reescrever telas.

## Regras de interface

- CTA principal usa laranja, não vermelho.
- Grafite é a base do painel escuro.
- Laranja deve sinalizar ação/identidade; erros continuam usando vermelho sem virar cor de marca.
- Sucesso permanece verde.
- Evitar excesso de laranja em grandes superfícies; usar para hierarquia e foco.
- O cardápio público pode ser mais claro/quente, mas deve preservar laranja + grafite.

## Assets esperados

Quando a arte original puder ser extraída:

```text
public/brand/pedeaqui-logo.svg
public/brand/pedeaqui-mark.svg
public/brand/pedeaqui-wordmark.svg
public/brand/pedeaqui-logo-dark.svg
public/brand/pedeaqui-logo-light.svg
```

O SVG mestre será a fonte; PNG/WebP serão derivados, não editados separadamente.
