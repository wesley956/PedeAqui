# PedeAqui — assets canônicos de marca

Fonte vetorial oficial criada a partir da arte aprovada pelo proprietário do produto na issue [255].

## Arquivos

- `pedeaqui-logo.svg` — lockup horizontal padrão para fundos claros.
- `pedeaqui-logo-on-dark.svg` — lockup horizontal para fundos escuros.
- `pedeaqui-symbol.svg` — símbolo isolado para favicon, app icon, avatar, impressão e espaços reduzidos.

## API oficial na aplicação

A aplicação não deve montar a marca com texto, CSS ou SVG inline. Use os componentes em `src/components/brand/pedeaqui-brand.tsx`:

- `PedeAquiLogo` — logo horizontal oficial; aceita `size="xs|sm|md|lg"` e `surface="light|dark"`.
- `PedeAquiSymbol` — símbolo oficial para espaços reduzidos; aceita `size="xs|sm|md|lg"`.
- `decorative` deve ser usado quando um texto próximo já fornece o nome acessível da marca.
- `alt` permite sobrescrever o nome acessível apenas quando houver necessidade contextual.

Os componentes apontam para estes SVGs canônicos e não duplicam os paths vetoriais dentro do código React.

## Regras de uso

1. Não redesenhar a marca em CSS, texto, emoji ou letras improvisadas.
2. Não alterar a proporção do `viewBox`.
3. Não aplicar cores diferentes às formas internas.
4. Não adicionar glow, sombra pesada ou efeitos de mockup na versão de interface.
5. Em fundo claro usar `pedeaqui-logo.svg`.
6. Em fundo escuro usar `pedeaqui-logo-on-dark.svg`.
7. Em espaços pequenos usar `pedeaqui-symbol.svg`; derivar raster/favicons sempre a partir deste SVG.
8. A identidade configurável do restaurante (white-label) é separada da marca da plataforma PedeAqui.

## Paleta incorporada no asset

- Laranja principal: `#FF6B00`
- Laranja claro: `#FF9A00`
- Laranja profundo: `#FF4A00`
- Grafite: `#202427`
- Branco quente (variante dark): `#F7F7F5`

A especificação completa de identidade, contraste, clear space e aplicações está consolidada em `docs/BRAND_IDENTITY.md`.
