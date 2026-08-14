# PedeAqui — Manual Técnico Oficial de Identidade

> Issue lógica: **[256]** · Fonte de verdade visual da plataforma PedeAqui.
>
> Este documento descreve a identidade da **plataforma PedeAqui**. O branding configurável de restaurantes/organizações é um domínio separado e não deve sobrescrever estas regras fora das superfícies explicitamente white-label.

## 1. Identidade oficial

- **Nome:** PedeAqui
- **Grafia obrigatória:** `PedeAqui`
- **Tagline:** **Seu pedido começa aqui.**
- **Categoria:** plataforma SaaS para pedidos e operação de restaurantes.
- **Personalidade:** rápida, prática, confiável, moderna e próxima, sem excesso visual.
- **Princípio visual:** chamar atenção pela forma, contraste e hierarquia — não por excesso de efeitos.

### 1.1 O que nunca fazer

- escrever `Pede Aqui`, `Pede aqui`, `Pedeaqui` ou variações como marca oficial;
- reconstruir a marca com texto/CSS, emoji, ícone genérico ou uma letra `P` improvisada;
- deformar, inclinar, esticar ou comprimir o logo;
- adicionar glow forte, contorno, sombra pesada ou mockup à versão usada na interface;
- trocar as cores internas do símbolo sem uma variante oficialmente versionada;
- usar `Cruz` como nome visível do produto.

## 2. Assets canônicos

Os únicos assets vetoriais canônicos da plataforma estão em `public/brand/`:

- `/brand/pedeaqui-logo.svg` — lockup horizontal padrão para fundos claros;
- `/brand/pedeaqui-logo-on-dark.svg` — lockup horizontal para fundos escuros;
- `/brand/pedeaqui-symbol.svg` — símbolo isolado para espaços reduzidos.

### 2.1 Fonte única

Qualquer favicon, app icon, avatar, raster de impressão ou material derivado deve partir desses SVGs. Não criar cópias redesenhadas em outros diretórios.

### 2.2 Estrutura visual do símbolo

O símbolo combina quatro ideias:

1. marcador de localização;
2. letra `P`;
3. cloche/bandeja de alimento;
4. linhas de velocidade/entrega.

Esses elementos formam uma unidade. Não devem ser separados ou rearranjados em aplicações normais.

## 3. Logo principal e variantes

### 3.1 Fundo claro

Usar `/brand/pedeaqui-logo.svg`.

- `Pede`: grafite;
- `Aqui`: laranja;
- símbolo: laranja + branco + grafite.

Fundos recomendados:

- `#FFFFFF`;
- `#F7F7F5`;
- superfícies muito claras e neutras.

### 3.2 Fundo escuro

Usar `/brand/pedeaqui-logo-on-dark.svg`.

- `Pede`: branco quente;
- `Aqui`: laranja;
- linha secundária de velocidade clara para não desaparecer no fundo.

Fundos recomendados:

- `#0D0F10`;
- `#151819`;
- grafites equivalentes de alto contraste.

### 3.3 Símbolo isolado

Usar `/brand/pedeaqui-symbol.svg` quando o lockup horizontal não tiver espaço suficiente, por exemplo:

- favicon;
- app icon;
- avatar;
- área compacta de navegação;
- impressão reduzida;
- placeholder institucional.

O símbolo não deve substituir o logo completo em superfícies institucionais amplas quando houver espaço para o nome PedeAqui.

## 4. Paleta oficial da marca

A paleta abaixo é derivada dos SVGs aprovados e deve ser tratada como referência exata da marca.

| Token conceitual | Valor | Uso |
|---|---:|---|
| Orange 500 | `#FF6B00` | laranja principal da marca, CTA e destaques controlados |
| Orange 300 | `#FF9A00` | início de gradientes e realces do símbolo |
| Orange 700 | `#FF4A00` | profundidade do gradiente e destaques fortes |
| Graphite 900 | `#202427` | wordmark em fundo claro e elementos escuros da marca |
| Graphite 950 | `#171A1C` | profundidade do grafite no símbolo |
| Graphite 800 | `#30363A` | gradiente/realce grafite |
| Warm White | `#F7F7F5` | wordmark em fundo escuro |
| Pure White | `#FFFFFF` | negativo interno do símbolo |

### 4.1 Gradientes oficiais do símbolo

**Laranja principal**

```css
linear-gradient(135deg, #FF9A00 0%, #FF6B00 55%, #FF4A00 100%)
```

**Laranja suave**

```css
linear-gradient(90deg, #FF9A00 0%, #FF6B00 100%)
```

**Grafite**

```css
linear-gradient(180deg, #30363A 0%, #171A1C 100%)
```

Não criar novos gradientes de marca por módulo.

## 5. Contraste e uso de cor

A cor de marca não substitui regras de acessibilidade.

Valores de contraste observados:

- `#202427` sobre branco: aproximadamente **15.6:1** — adequado para texto normal;
- `#F7F7F5` sobre `#0D0F10`: aproximadamente **17.9:1** — adequado para texto normal;
- `#FF6B00` sobre branco: aproximadamente **2.86:1** — **não usar como texto normal pequeno**;
- `#FF6B00` sobre `#0D0F10`: aproximadamente **6.73:1** — adequado para texto quando tamanho/peso e contexto forem compatíveis.

### 5.1 Regra prática

Em fundo claro, usar laranja principalmente para:

- CTA preenchido com texto branco quando o componente tiver contraste validado;
- ícones e acentos não textuais;
- bordas/destaques;
- títulos grandes quando validados;
- marca `Aqui` dentro do asset oficial.

Texto corrente em fundo claro deve priorizar grafite.

## 6. Área de proteção

Definir `X` como **8% da altura total do asset**.

Manter no mínimo `1X` de espaço livre ao redor de todo o logo ou símbolo.

Nenhum texto, borda, ícone, fotografia ou componente deve invadir essa área.

Em aplicações promocionais é aceitável usar até `1.5X` quando houver espaço, melhorando a leitura da marca.

## 7. Tamanho mínimo

### 7.1 Digital

- logo horizontal: **140 px** de largura mínima;
- símbolo: **28 px** de largura/altura mínima;
- favicon: derivar do símbolo e simplificar apenas por exportação/rasterização, não redesenhar.

### 7.2 Impressão

- logo horizontal: **35 mm** de largura mínima;
- símbolo: **8 mm** de largura mínima.

Abaixo desses tamanhos, priorizar o símbolo em vez de comprimir o lockup completo.

## 8. Tipografia

### 8.1 Wordmark

O wordmark oficial está convertido em paths nos SVGs. **Nunca depende de uma fonte instalada em runtime.** Não substituir os paths por `<text>`.

### 8.2 Interface do produto

Família recomendada para UI:

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

A implementação técnica definitiva da tipografia global será consolidada em [260]. Até lá, esta é a direção oficial.

### 8.3 Pesos

- 400 — corpo e texto secundário;
- 500 — controles e labels;
- 600 — ações, subtítulos e valores;
- 700 — títulos operacionais;
- 800 — uso pontual em números/KPIs ou comunicação promocional.

Evitar peso 900 em UI operacional; a força visual deve vir da hierarquia, não de texto constantemente pesado.

## 9. Escala tipográfica de referência

| Papel | Desktop | Mobile | Peso sugerido |
|---|---:|---:|---:|
| Display promocional | 40–48 px | 32–36 px | 700–800 |
| H1 de tela | 28–32 px | 24–28 px | 700 |
| H2/seção | 20–24 px | 18–22 px | 600–700 |
| Corpo | 14–16 px | 14–16 px | 400 |
| Label | 12–14 px | 12–14 px | 500–600 |
| Meta/auxiliar | 12 px | 12 px | 400–500 |

Em KDS e telas observadas à distância, estas medidas não se aplicam diretamente; a escala operacional será definida na etapa específica.

## 10. Espaçamento

A identidade usa ritmo visual regular e pouco ruído.

Escala recomendada:

```text
4 / 8 / 12 / 16 / 24 / 32 / 40 / 48 / 64
```

Regras:

- evitar valores arbitrários quando um valor da escala resolve o caso;
- componentes relacionados usam 8–16 px;
- grupos/seções usam 24–32 px;
- macroblocos usam 32–48 px;
- espaços muito grandes devem ter função de hierarquia, não decoração.

A tokenização final ocorrerá em [260].

## 11. Raios

Referência estrutural:

- `8 px` — controles pequenos e chips;
- `12 px` — inputs e botões;
- `16 px` — cards operacionais;
- `20–24 px` — cards promocionais/hero;
- `999 px` — apenas pills/badges circulares.

Evitar misturar dezenas de raios diferentes na mesma tela.

## 12. Sombras e elevação

O PedeAqui prioriza superfícies, bordas e contraste. Sombras são secundárias.

### 12.1 Nível 1

```css
box-shadow: 0 1px 2px rgb(13 15 16 / 0.08);
```

### 12.2 Nível 2

```css
box-shadow: 0 8px 24px rgb(13 15 16 / 0.12);
```

### 12.3 Nível 3

```css
box-shadow: 0 16px 40px rgb(13 15 16 / 0.16);
```

Nível 3 é reservado a modais, popovers importantes ou materiais promocionais. Não usar glow laranja como sombra padrão de componentes.

## 13. Iconografia

- estilo simples, geométrico e legível;
- preferir ícones outline/duotone consistentes;
- stroke visual equivalente a aproximadamente 1.75–2 px em ícones de 24 px;
- cantos levemente arredondados;
- não misturar famílias visuais diferentes na mesma tela;
- não usar emoji como substituto de ícone funcional;
- ícone nunca é o único indicador de estado crítico quando texto é necessário.

## 14. Fotografia e imagens de produto

A marca deve permanecer discreta quando o restaurante é protagonista.

- não aplicar laranja por cima de fotografia de comida sem necessidade;
- manter imagens de produto naturais;
- overlays devem ter contraste suficiente;
- placeholders de produto não devem usar o símbolo PedeAqui como se fosse foto do item;
- em ausência de imagem, usar placeholder neutro do design system.

## 15. Web, tablet e mobile

### Web/desktop

Usar lockup horizontal quando houver largura. O símbolo isolado é reservado a estados compactos.

### Tablet

Priorizar clareza operacional; não reduzir o logo a ponto de competir com controles de PDV, Salão ou Caixa.

### Mobile

Em headers estreitos pode-se usar o símbolo, mantendo o nome completo em superfícies institucionais, autenticação ou onboarding quando houver espaço.

A marca nunca deve consumir área útil necessária à operação.

## 16. Impressão

### 16.1 Impressoras gráficas

Usar SVG/raster derivado do símbolo ou lockup conforme suporte.

### 16.2 ESC/POS / térmica

Quando o hardware não suportar imagem com qualidade previsível, a assinatura textual `PedeAqui` é aceitável. Não forçar raster de baixa qualidade só para exibir o símbolo.

Regras de impressão específicas continuam subordinadas ao Print Agent e aos templates existentes.

## 17. PedeAqui × white-label do restaurante

São identidades diferentes.

### 17.1 Plataforma PedeAqui

É usada em:

- login e autenticação da plataforma;
- onboarding institucional;
- áreas administrativas da própria plataforma;
- assinatura padrão/fallback;
- documentação e materiais oficiais;
- componentes sem branding do estabelecimento.

### 17.2 Restaurante/organização

Pode configurar, conforme plano/entitlement:

- nome de exibição;
- logo;
- cores;
- domínio;
- possibilidade de ocultar assinatura da plataforma quando o contrato permitir.

### 17.3 Regra de precedência

White-label altera a identidade da **experiência do estabelecimento**, não a identidade interna/canônica do produto. Nunca salvar o SVG da plataforma em `organization_branding` como substituto da fonte oficial.

A aplicação prática dessa precedência será consolidada em [296].

## 18. Voz da marca

A linguagem do produto deve ser:

- direta;
- curta;
- orientada à tarefa;
- amigável sem infantilização;
- operacional em telas de trabalho;
- acolhedora no cardápio/checkout do cliente.

Evitar mensagens técnicas como “contexto multiempresa protegido” em superfícies operacionais. Informações técnicas pertencem a logs, suporte ou configuração avançada.

## 19. Checklist para novos componentes

Antes de aprovar uma nova superfície:

1. A marca veio de `public/brand/`?
2. O fundo usa a variante correta do logo?
3. A área de proteção foi respeitada?
4. O laranja está sendo usado como destaque, não como texto pequeno de baixo contraste?
5. Tipografia e espaçamento seguem esta referência?
6. O componente usa uma linguagem visual consistente com o design system?
7. O branding do restaurante está separado do branding da plataforma?
8. Existe alternativa legível em mobile/tablet?
9. A marca continua reconhecível sem depender de glow ou efeito decorativo?

## 20. Relação com as próximas issues

- **[257]** remove resíduos visíveis de Cruz;
- **[258]** cria componentes React oficiais para logo/símbolo;
- **[259]** converte a paleta em tokens semânticos;
- **[260]** consolida tokens estruturais/typography/spacing;
- **[261]** adiciona regressões automáticas de marca;
- **[296]** aplica a precedência plataforma × restaurante no fluxo público.

Este documento define a intenção e os valores oficiais. As issues acima transformam essas regras em código e guardrails.
