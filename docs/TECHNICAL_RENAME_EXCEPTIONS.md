# PedeAqui — Exceções técnicas temporárias de rename

> Issue de origem: **[257]** · destino de resolução: **[320]–[322]**.

A experiência visível do produto usa **PedeAqui**. Algumas referências técnicas ao nome histórico `cruz`/`Cruz` permanecem temporariamente porque a troca antecipada pode quebrar repositório, dependências, deploy ou integrações.

## Exceções preservadas

| Superfície | Referência atual | Motivo para preservar agora | Etapa de resolução |
|---|---|---|---|
| GitHub | repositório `wesley956/cruz` | O slug está conectado a PRs, Actions, Vercel e demais integrações. | [320] mapear dependências; [321] rename controlado; [322] atualizar integrações. |
| npm/package metadata | `package.json` com `name: "cruz"` | Identificador técnico do workspace; não é exibido ao cliente e pode ser referenciado por automações. | [320]–[322]. |
| Supabase | projeto ainda identificado tecnicamente como `Cruz` no painel | Renomear projeto/infra não faz parte da troca de marca visível e deve ser tratado junto das dependências externas. | [320]–[322]. |
| Documentação de baseline/auditoria | `docs/BRAND_AUDIT.md` e trechos técnicos do `PROJECT_INDEX.md` mencionam o nome histórico | São registros históricos/arquiteturais necessários para explicar o rename e não constituem branding do produto. | Consolidar histórico final em [323]. |
| Histórico Git/GitHub | commits, PRs, issues, URLs e referências antigas | Histórico é imutável ou depende do slug atual; não deve ser reescrito para uma mudança cosmética. | Preservar histórico; atualizar apenas referências vivas em [320]–[323]. |

## Regra

Nenhuma nova superfície user-facing pode introduzir `Cruz` como nome do produto. Novas referências técnicas ao slug histórico também não devem ser criadas sem necessidade explícita e documentada.

O teste `tests/brand-legacy-name.test.ts` protege as superfícies visíveis e documentações principais. As exceções acima ficam fora desse guardrail deliberadamente.
