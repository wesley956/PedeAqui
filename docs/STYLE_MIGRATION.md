# PedeAqui — Migração de estilos locais para o Design System

> Issue lógica: **[269]**

## Objetivo

Reduzir estilos arbitrários nas superfícies compartilhadas sem alterar regra de negócio, permissões, navegação ou contratos de dados.

## Áreas migradas nesta etapa

### AppShell

- superfícies, bordas, spacing, radius, tipografia, foco e z-index passam a usar tokens semânticos/estruturais;
- cores fixas de fundo foram substituídas por `--surface-*`;
- medidas compartilháveis de padding/gap/font-size foram trocadas por `--space-*` e `--font-size-*`;
- estilos inline de logo, topbar, ações e assinatura foram removidos e levados para `shell.css`;
- largura máxima do conteúdo usa `--content-wide`;
- foco mobile usa `--focus-ring`.

### Autenticação

- `AuthCard` saiu de estilos inline para `auth-card.module.css`;
- login, cadastro, recuperação e nova senha compartilham `auth-flow.module.css`;
- mensagens de erro/sucesso usam o componente canônico `Alert` de [265];
- o hexadecimal legado de erro foi removido dessas jornadas.

## Exceções justificadas

### White-label do AppShell

`AppShell` mantém um único objeto `style` em runtime para definir `--accent` e `--accent-strong` com as cores da organização.

Essa exceção é necessária porque os valores vêm do branding persistido da organização e não podem ser conhecidos em build time. O objeto não contém layout, radius, spacing, cor fixa nem outro valor arbitrário: ele alimenta apenas os aliases de white-label já documentados em `docs/DESIGN_TOKENS.md`.

### Dimensões estruturais específicas

Algumas dimensões do shell continuam literais (`238px`, `68px`, `64px`, `76px`, breakpoint intermediário de `900px`) porque são geometria específica do layout existente e ainda serão redesenhadas nas issues [272]–[274]. Alterá-las aqui misturaria migração de tokens com redesign de navegação.

## Não alterado

- lista de módulos exibidos;
- permissões;
- regras de negócio;
- actions de autenticação;
- contratos do banco;
- comportamento de white-label;
- arquitetura desktop/mobile da navegação.

## Guardrail

`tests/style-migration.test.ts` garante que:

- as áreas migradas não reintroduzam hexadecimais locais;
- `AppShell` não volte a usar objetos inline para layout;
- os fluxos principais de autenticação usem `Alert` e o layout compartilhado;
- `shell.css` use os tokens oficiais para superfícies, bordas, foco e espaçamento.

## Próximos passos

A migração módulo a módulo continuará junto dos redesigns específicos. A [269] estabelece a base compartilhada para que [270]–[277] reorganizem a navegação sem carregar estilos arbitrários do shell anterior.
