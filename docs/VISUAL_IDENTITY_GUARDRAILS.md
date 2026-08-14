# PedeAqui — Guardrails de identidade visual

> Issue lógica: **[261]**. Este documento descreve o gate automático que protege a fundação criada em [257]–[260].

## Objetivo

Impedir que regressões básicas de identidade entrem novamente no produto sem depender de revisão visual manual.

O gate não substitui homologação visual em dispositivos reais. Ele protege apenas contratos objetivos que podem ser verificados automaticamente.

## Contratos protegidos

### 1. Nome oficial

A experiência visível deve usar **PedeAqui**. O teste `tests/brand-legacy-name.test.ts` varre `src/`, `print-agent/` e as documentações principais protegidas e falha caso `Cruz` reapareça como marca do produto.

As únicas referências técnicas temporárias aceitas estão documentadas em `docs/TECHNICAL_RENAME_EXCEPTIONS.md` e serão resolvidas no bloco [320]–[322]. Não existe allowlist implícita.

### 2. Assets canônicos

Os seguintes arquivos devem permanecer versionados como SVG reais, com `viewBox`:

- `public/brand/pedeaqui-logo.svg`;
- `public/brand/pedeaqui-logo-on-dark.svg`;
- `public/brand/pedeaqui-symbol.svg`.

Nenhuma superfície central deve recriar o logo com SVG inline, texto improvisado, emoji ou CSS.

### 3. Componente oficial

As superfícies centrais de autenticação, AppShell e cardápio público devem continuar usando `PedeAquiLogo` a partir de `@/components/brand/pedeaqui-brand`.

O contrato detalhado do componente continua protegido por `tests/brand-components.test.ts`.

### 4. Tokens semânticos

`tests/design-tokens.test.ts` protege o contrato de cores e falha quando uma custom property CSS é referenciada em `src/` sem definição correspondente.

### 5. Tokens estruturais

`tests/structural-tokens.test.ts` protege tipografia, spacing, raios, controles, conteúdo, breakpoints, z-index, motion, touch e reduced motion definidos em [260].

## Prova negativa controlada

`tests/visual-identity-guardrails.test.ts` inclui fixtures pequenas e intencionalmente inválidas para provar que os detectores reconhecem:

- reintrodução do nome legado;
- referência a token CSS inexistente.

Isso evita um falso sentimento de segurança em que o teste apenas passa no baseline correto sem comprovar que reconhece uma regressão.

## Integração com CI

Todos os arquivos ficam sob a suíte Vitest já executada pelo comando de testes do CI. Nenhum job manual separado é necessário.

Uma PR da fundação visual só pode ser mesclada quando, em conjunto, passarem:

1. lint;
2. typecheck;
3. testes;
4. validação do Print Agent;
5. build.

## Limites

Este gate não valida percepção estética, composição final, overflow visual, densidade real em aparelhos, legibilidade de KDS à distância ou experiência mobile completa. Esses itens continuam reservados para as etapas de redesign e homologação [312]–[319].
