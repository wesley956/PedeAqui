# PedeAqui — Auditoria de Identidade e Consistência Visual

> Issue lógica: **[254]** · GitHub: **#284**  
> Baseline auditado: `main` em 13/08/2026  
> Natureza desta etapa: **diagnóstico/documentação somente**. Nenhuma regra de negócio, tela, asset, banco ou configuração de produção é alterada nesta issue.

## 1. Objetivo

Registrar uma fonte de verdade sobre o estado atual da identidade do **PedeAqui** antes da consolidação visual iniciada em [255]. A auditoria cobre marca da plataforma, white-label do restaurante, autenticação, shell, páginas públicas, impressão, documentação, tokens visuais, configurações e referências técnicas ao nome antigo `Cruz`.

O nome oficial do produto é **PedeAqui** e a tagline canônica registrada no projeto é **“Seu pedido começa aqui.”**. O nome `cruz` deve ser tratado apenas como resíduo/identificador técnico até a etapa controlada de rename [320]–[322].

## 2. Regra arquitetural não negociável

Existem duas identidades diferentes e elas não podem ser confundidas:

1. **Identidade da plataforma PedeAqui** — marca canônica do produto, usada em autenticação, superfícies institucionais, assinatura da plataforma, fallback e materiais oficiais.
2. **Identidade do restaurante/organização** — white-label configurável por organização, com `product_name`, logo, cores e opção de ocultar a assinatura PedeAqui conforme plano/entitlement.

A infraestrutura de white-label existente deve ser preservada. Ela **não** substitui a necessidade de um SVG e componentes canônicos da plataforma.

## 3. Classificações usadas

| Classificação | Significado |
|---|---|
| `CORRECT` | Está coerente com a identidade oficial e pode permanecer. |
| `REPLACE` | Marca/nome/fallback incorreto ou improvisado; substituir pela fonte canônica. |
| `MIGRATE_TOKEN` | Valor visual fixo deve migrar para token/design system. |
| `KEEP_WHITE_LABEL` | Comportamento específico do restaurante é intencional e deve ser preservado. |
| `PRESERVE_TECHNICAL` | Referência técnica ao nome antigo deve permanecer até [320]–[322] para evitar quebra de infraestrutura. |
| `BLOCKED_CANONICAL_ASSET` | Não deve ser resolvido por aproximação; depende do SVG oficial aprovado. |
| `ADJACENT_UX` | Achado relevante de layout/voz/navegação, mas a correção pertence a outro bloco. |

## 4. Gaps canônicos de marca

### 4.1 SVG oficial ausente do repositório

O tree atual não contém arquivos `.svg` nem uma estrutura `public/brand/`. Portanto o código não possui hoje uma fonte vetorial canônica versionada para a marca PedeAqui.

**Classificação:** `BLOCKED_CANONICAL_ASSET`  
**Ação:** [255] deve incorporar **exatamente o SVG já aprovado**, sem redesenhar, reconstruir por CSS ou inferir a marca a partir das cores atuais.

### 4.2 Manual de marca referenciado, mas ausente

`docs/PROJECT_INDEX.md` declara `BRAND_IDENTITY.md` como especificação oficial, porém o arquivo não existe no tree atual.

**Classificação:** `BLOCKED_CANONICAL_ASSET`  
**Ação:** [256] cria `docs/BRAND_IDENTITY.md` a partir do SVG oficial e das decisões aprovadas.

### 4.3 Favicon/manifest/assets de aplicação

Não foram localizados favicon/manifesto/assets oficiais da marca no tree auditado.

**Classificação:** `BLOCKED_CANONICAL_ASSET`  
**Ação:** derivar somente após [255]/[256], preservando proporção e regras do SVG oficial.

## 5. Inventário por superfície

| Área / arquivo | Ocorrência atual | Classificação | Ação / issue de destino |
|---|---|---|---|
| `docs/PROJECT_INDEX.md` | Nome PedeAqui, tagline e paleta-base laranja + grafite já declarados; reconhece `cruz` como nome técnico | `CORRECT` | Manter; atualizar baseline final em [323] |
| `README.md` | Título `# Cruz` | `REPLACE` | Alterar documentação de produto em [257] |
| `docs/BLUEPRINT_MASTER.md` | Título `Blueprint Mestre — Cruz` | `REPLACE` | Padronizar como PedeAqui em [257]/[323] |
| `docs/IMPLEMENTATION_BACKLOG.md` | Título `Cruz — Backlog Técnico Mestre` | `REPLACE` | Padronizar como PedeAqui em [257]/[323] |
| `supabase/README.md` | Título `Supabase — Cruz` | `REPLACE` | Corrigir marca documental em [257]; revisar conteúdo técnico obsoleto separadamente em [304]/[323] |
| `package.json` | `name: "cruz"` | `PRESERVE_TECHNICAL` | Não alterar agora; mapear/renomear em [320]–[322] |
| Repositório `wesley956/cruz` | slug técnico ainda `cruz` | `PRESERVE_TECHNICAL` | Rename controlado somente em [320]–[322] |
| `.env.example` | Configuração neutra, sem marca antiga no baseline atual | `CORRECT` | Nenhuma ação de marca |
| `src/app/layout.tsx` | metadata `title: "PedeAqui"` | `CORRECT` | Manter; poderá usar metadata/ícones canônicos após [255] |
| `src/app/login/page.tsx` | `AuthCard title="Cruz"` e “Acesse sua operação Cruz.” | `REPLACE` | [257] |
| `src/components/auth/auth-card.tsx` | wordmark textual `Cruz` + quadrado em gradiente criado por CSS | `REPLACE` | Substituir pelo componente canônico em [258] |
| `src/app/cadastro/page.tsx` | herda marca antiga do `AuthCard`; erro `#ff8a93` | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [265] |
| `src/app/recuperar-senha/page.tsx` | herda `AuthCard`; erro hardcoded | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [265] |
| `src/app/nova-senha/page.tsx` | herda `AuthCard`; erro hardcoded | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [265] |
| `src/app/convite/page.tsx` | herda `AuthCard`; erro `#ff8a93` | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [265] |
| `src/app/onboarding/page.tsx` | placeholder `Ex.: Grupo Cruz` + `AuthCard` | `REPLACE` | [257], [258] |
| `src/components/layout/app-shell.tsx` | fallback `PedeAqui`, mas logo fallback é apenas letra `P`; accent fallback `#ff6b00`; shell usa branding da organização | `REPLACE` + `MIGRATE_TOKEN` + `KEEP_WHITE_LABEL` | Logo da plataforma [258]; token [259]; precedência PedeAqui × restaurante [296] |
| `src/server/platform/branding-read-service.ts` | lê nome/logo/cores por organização | `KEEP_WHITE_LABEL` | Preservar; documentar precedência em [296] |
| `supabase/sql/84_platform_branding_domains_scale.sql` | white-label explicita opção de ocultar marca PedeAqui | `KEEP_WHITE_LABEL` | Preservar contrato; não usar como repositório do asset canônico PedeAqui |
| `src/app/m/[slug]/page.tsx` | restaurante usa cores/logo próprios; footer assina `PedeAqui` como texto + `#FF6B00` | `KEEP_WHITE_LABEL` + `REPLACE` + `MIGRATE_TOKEN` | [258], [296], [297] |
| `src/features/menu/menu-browser.tsx` | muitos fundos/textos/bordas hardcoded; placeholder de produto com letra `P` | `MIGRATE_TOKEN` + `REPLACE` | [259], [296]–[299]; usar placeholder neutro de produto |
| `src/app/m/[slug]/produto/[id]/page.tsx` | `#FF6B00`, superfícies fixas e fallback de imagem com gradiente + `P` | `MIGRATE_TOKEN` + `REPLACE` | [259], [298], [299] |
| `src/app/m/[slug]/carrinho/page.tsx` | wordmark `PedeAqui` montado em texto, marca `P`, CTA/total laranja hardcoded | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [300] |
| `src/app/m/[slug]/checkout/page.tsx` | wordmark `Pede` + `Aqui` textual e ampla paleta hardcoded | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [301], [302] |
| `src/app/m/[slug]/pedido/[id]/page.tsx` | assinatura textual PedeAqui e laranja hardcoded em total/resumo | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [303] |
| `src/app/mesa/[code]/page.tsx` | `PedeAqui` textual em `#ff6b00`; superfície pública fixa | `REPLACE` + `MIGRATE_TOKEN` | [258], [259], [296] |
| `src/server/printing/templates.ts` | assinatura textual `PedeAqui` no ESC/POS | `CORRECT` temporariamente | [255]/[256] devem definir política de impressão e quando usar logo raster/vetorial derivado; não remover texto sem suporte físico |
| `print-agent/package.json` | `pedeaqui-print-agent` | `CORRECT` | Manter |
| `print-agent/README.md` | título e variáveis `PEDEAQUI_*` | `CORRECT` | Manter |

## 6. Tokens e paleta atual

`src/app/globals.css` define hoje um tema escuro com:

```text
--bg: #0d0f10
--surface: #151819
--surface-2: #1d2122
--border: #303637
--text: #f2f4f4
--muted: #9ba4a5
--accent: #ff6b00
--accent-strong: #ff8a2a
--success: #42b883
--danger: #ff5b66
```

Esses valores são **baseline atual**, não devem ser promovidos a “cores oficiais” por inferência. A paleta definitiva precisa ser mapeada a partir do SVG aprovado em [255]/[256].

### 6.1 Token inexistente

O código usa `var(--surface-3)` em mais de uma superfície (incluindo Dashboard e Clientes), mas `--surface-3` não existe em `globals.css`.

**Classificação:** `MIGRATE_TOKEN` / inconsistência confirmada.  
**Ação:** corrigir em [259] e adicionar guardrail em [261].

### 6.2 Cores fixas fora do sistema

Foram confirmados valores diretos em Dashboard, PDV, Salão, autenticação e praticamente toda a jornada pública (`#FF6B00`, superfícies claras, estados de erro/sucesso e bordas).

**Ação:** [259] cria tokens semânticos; [267] unifica estados; [269] migra estilos locais. O objetivo não é trocar hex por outro hex em cada arquivo, e sim remover múltiplas fontes de verdade.

### 6.3 Tipografia

O `body` global usa `Arial, Helvetica, sans-serif`. Isso é funcional, mas ainda não existe uma especificação tipográfica oficial vinculada ao asset/brand manual.

**Classificação:** `MIGRATE_TOKEN` / definição pendente.  
**Ação:** [256] e [260].

## 7. Design system atual

Há primitives compartilhados (`Button`, `Input`, cards/badges/selects), o que é uma boa fundação, porém parte da estrutura ainda está em estilos inline e cada módulo mantém regras próprias de densidade, estado, cor e responsividade.

- `Button`: utiliza tokens de accent/danger, mas precisa validar contraste e tamanhos no design system final — [262]/[268].
- `Input`: já trabalha majoritariamente com tokens e alvo de 44 px — base aproveitável em [263].
- `primitives.tsx`: base reutilizável, porém deve migrar para variantes documentadas em [264]–[269].

## 8. Achados adjacentes de layout/voz

Estes pontos são registrados para não se perderem, mas **não são corrigidos na [254]**:

1. `AppShell` contém uma lista plana muito extensa de módulos — [270]–[272].
2. Em mobile, o sidebar/nav continua renderizado e existe também `mobileBottomNav`, criando risco de navegação duplicada — [273].
3. O header usa a frase técnica “Unidade atual protegida pelo contexto multiempresa.”; deve ser substituída por informação operacional útil — [274].
4. A marca/identidade exibida no shell está excessivamente acoplada ao branding da organização; a precedência precisa ficar explícita — [296].

## 9. Estado do Supabase observado durante a auditoria

Consulta via conexão Supabase em 13/08/2026:

- Projeto acessível relacionado ao produto ainda aparece com o nome técnico **`Cruz`** e status `ACTIVE_HEALTHY`.
- A tabela `organization_branding` não retornou registros no momento da consulta.

**Classificação do nome do projeto:** `PRESERVE_TECHNICAL`.  
**Ação:** não renomear em [254]. O impacto será mapeado em [320] e executado de forma controlada em [321]/[322].

A ausência atual de linhas de branding não é defeito de marca da plataforma; apenas significa que o fallback é especialmente importante e precisa ser canônico.

## 10. Documentação inconsistente

Além do nome antigo, alguns documentos refletem momentos anteriores do projeto. Exemplo: `supabase/README.md` ainda descreve o banco como se a especificação não tivesse sido aplicada, enquanto `PROJECT_INDEX.md` registra o núcleo #001–#253 com migrations no Supabase oficial.

Isso não é corrigido nesta auditoria de marca. Registrar para reconciliação técnica/documental em [304] e fechamento em [323].

## 11. Mapa de execução após a auditoria

| Issue | Resultado esperado |
|---|---|
| [255] | Versionar exatamente o SVG oficial aprovado e derivações necessárias |
| [256] | Criar `BRAND_IDENTITY.md` com valores/regras oficiais |
| [257] | Remover `Cruz` de toda experiência e documentação de produto, mantendo exceções técnicas |
| [258] | Criar `PedeAquiLogo`/`PedeAquiSymbol` e eliminar wordmarks improvisados |
| [259] | Criar tokens semânticos, corrigir `--surface-3` e consolidar cores |
| [260] | Consolidar tipografia, spacing, dimensões e breakpoints |
| [261] | Guardrails automáticos para nome antigo, tokens inexistentes e uso incorreto da marca |
| [262]–[269] | Consolidar design system e migrar estilos locais |
| [296]–[303] | Aplicar corretamente a separação plataforma × restaurante na jornada pública |
| [320]–[323] | Mapear e executar rename técnico e consolidar documentação final |

## 12. Critérios de aceite da [254]

- [x] Código, documentação, Supabase/configuração, impressão, superfícies públicas e autenticadas foram incluídos no inventário.
- [x] Marca da plataforma e white-label do restaurante foram separados conceitualmente.
- [x] Ocorrências visíveis confirmadas de `Cruz` possuem destino de correção.
- [x] Referências técnicas ao nome antigo foram preservadas e direcionadas ao rename controlado.
- [x] Hardcodes e token inexistente foram classificados sem fazer correção prematura.
- [x] Ausência do SVG oficial e de `BRAND_IDENTITY.md` foi registrada como dependência, sem reconstruir a marca por aproximação.
- [x] Impressão e Print Agent foram auditados.
- [x] Nenhuma alteração de runtime, banco, regra de negócio ou visual foi feita nesta issue.

## 13. Conclusão

O PedeAqui já está consolidado como nome oficial em parte importante da arquitetura e documentação, mas a implementação visual ainda possui **múltiplas fontes de verdade**: wordmarks textuais, letra `P`, gradientes manuais, cores hardcoded, white-label usado como fallback do shell e documentos antigos com `Cruz`.

A sequência correta é manter [254] somente como auditoria e iniciar [255] **apenas com o SVG canônico aprovado em mãos**. A marca não deve ser deduzida a partir de `#ff6b00`, do quadrado de autenticação ou de qualquer fallback existente.