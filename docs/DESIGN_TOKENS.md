# PedeAqui — Design Tokens Semânticos

> Issue lógica: **[259]** · Complementa `docs/BRAND_IDENTITY.md` sem substituir o manual de identidade.

## Objetivo

Os tokens abaixo são a API de cor da interface PedeAqui. Componentes devem expressar **função** (`surface`, `text`, `state`, `focus`) em vez de depender de nomes literais de cor ou repetir valores hexadecimais.

A identidade configurável do restaurante continua separada. O white-label pode sobrescrever os aliases de acento já previstos no `AppShell`, mas não redefine os primitives oficiais da plataforma globalmente.

## 1. Marca

| Token | Valor | Uso |
|---|---:|---|
| `--brand-primary` | `#FF6B00` | cor principal PedeAqui |
| `--brand-primary-hover` | `#FF4A00` | hover de ação institucional |
| `--brand-primary-active` | `#FF4A00` | estado pressionado institucional |
| `--brand-highlight` | `#FF9A00` | realce controlado |
| `--brand-graphite` | `#202427` | grafite principal |
| `--brand-graphite-deep` | `#171A1C` | grafite profundo |
| `--brand-graphite-soft` | `#30363A` | grafite elevado |
| `--brand-warm-white` | `#F7F7F5` | branco quente da marca |

Os valores de marca vêm diretamente de `docs/BRAND_IDENTITY.md` e dos SVGs canônicos em `public/brand/`.

## 2. Superfícies

| Token | Papel |
|---|---|
| `--surface-0` | fundo mais profundo da aplicação |
| `--surface-1` | cards e superfícies principais |
| `--surface-2` | controles, painéis e agrupamentos secundários |
| `--surface-3` | tags, badges neutros, controles elevados e notas |

`--surface-3` é obrigatório. Antes da [259] ele era referenciado em KDS, pedidos e outras áreas sem existir no tema global.

A escala representa **elevação/hierarquia**, não uma licença para cada módulo inventar um novo grafite.

## 3. Conteúdo e bordas

- `--text-primary`: conteúdo principal em fundo escuro.
- `--text-secondary`: conteúdo auxiliar/muted.
- `--text-inverse`: conteúdo escuro sobre superfície clara.
- `--text-on-brand`: conteúdo sobre preenchimento de marca quando contraste validado.
- `--border-default`: separação padrão.
- `--border-strong`: separação de maior ênfase.
- `--focus-ring`: foco de teclado; atualmente referencia a cor principal PedeAqui.

Foco não deve ser removido por componentes. Cor não é o único sinal de interação.

## 4. Estados operacionais

Cada família possui três papéis: cor principal, texto de alto contraste e superfície tonal.

### Sucesso
- `--state-success`
- `--state-success-text`
- `--state-success-surface`

### Atenção
- `--state-warning`
- `--state-warning-text`
- `--state-warning-surface`

### Perigo/erro
- `--state-danger`
- `--state-danger-text`
- `--state-danger-surface`

### Informação
- `--state-info`
- `--state-info-text`
- `--state-info-surface`

### Regra de acessibilidade

Estado nunca pode depender apenas da cor. A interface deve manter texto, ícone, label ou contexto que comunique `Pronto`, `Atrasado`, `Erro`, `Pago`, `Pendente` etc.

## 5. Aliases de compatibilidade

A aplicação já possui muitos consumidores antigos. Para evitar um redesign acidental nesta issue, `globals.css` mantém aliases sem repetir valores:

- `--bg` → `--surface-0`
- `--surface` → `--surface-1`
- `--text` → `--text-primary`
- `--muted` → `--text-secondary`
- `--border` → `--border-default`
- `--accent` → `--brand-primary`
- `--accent-strong` → `--brand-primary-hover`
- `--accent-highlight` → `--brand-highlight`
- `--danger` → `--state-danger`
- `--success` → `--state-success`

Esses aliases são uma ponte de migração, não uma segunda fonte de verdade.

### White-label

`--accent` e `--accent-strong` podem continuar sendo sobrescritos localmente pelo `AppShell` quando a organização possui branding customizado. Isso preserva o contrato existente sem permitir que o white-label altere os primitives globais da plataforma.

## 6. Regras para componentes novos

1. Preferir o token semântico mais específico disponível.
2. Não copiar hexadecimal de `globals.css` para TSX/CSS local.
3. Não usar laranja para representar sucesso, erro ou atenção.
4. Não criar `--surface-4`, novas cores de estado ou novas cores de marca sem issue explícita.
5. Para white-label, usar somente o ponto de integração previsto; não ler `--brand-primary` como cor do restaurante.
6. Ao criar um novo `var(--token)`, o token precisa estar definido no código e coberto pelo guardrail de [259].

## 7. Guardrail automático

`tests/design-tokens.test.ts` executa duas verificações:

- confirma a existência dos tokens semânticos obrigatórios;
- percorre `src/` e falha se encontrar `var(--algum-token)` sem uma definição correspondente em CSS/TS/TSX.

Isso transforma referências quebradas como o antigo `--surface-3` em falha de CI, em vez de defeito visual silencioso em produção.

## 8. Fora desta etapa

A [259] não redefine tipografia, spacing, radius, shadow, motion, breakpoints nem densidade. Esses contratos estruturais pertencem à **[260]**.

A migração completa de estilos inline e hexadecimais por todo o produto também não acontece aqui; ela será tratada de forma controlada nas etapas do design system e em [269].
