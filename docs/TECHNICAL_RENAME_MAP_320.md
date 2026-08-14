# [320] Mapa técnico para mudança de nome

Data: 2026-08-14

Objetivo: mapear todas as referências técnicas ao nome legado `cruz` antes de executar qualquer mudança. Esta issue **não renomeia nada**.

## Nome alvo

- Produto oficial: **PedeAqui**
- Repositório alvo: **`wesley956/PedeAqui`**
- Package alvo: **`pedeaqui`**
- Supabase: manter o `project_ref` estável; quando possível, alinhar somente o nome de exibição do projeto para **PedeAqui**.

## Matriz de dependências

| Item | Estado atual | Impacto da mudança | Ordem | Validação | Reversão |
| --- | --- | --- | --- | --- | --- |
| GitHub repository | `wesley956/cruz` | URL de clone, Pages, integrações GitHub e links externos | [321] primeiro | `get_repo` pelo novo nome, histórico/branches/issues/PRs presentes, CI disparando | renomear novamente para `cruz` se houver falha crítica |
| Git remotes existentes | `https://github.com/wesley956/cruz(.git)` nos clones já existentes | clones antigos podem depender do redirect do GitHub | após [321] | `git remote -v` em clones locais; usar `git remote set-url origin https://github.com/wesley956/PedeAqui.git` | apontar novamente para a URL anterior enquanto o redirect existir |
| `package.json` | `"name": "cruz"` | identidade técnica em logs npm/CI; não afeta produto visual | [322] | lint, typecheck, test, E2E e build | restaurar `"name": "cruz"` |
| lockfile npm | não existe no repositório | nenhum rename necessário | nenhum | árvore do repositório | n/a |
| GitHub Actions | workflows usam paths/actions e contexto dinâmico; não há nome do repo hardcoded nos workflows centrais | devem continuar funcionando automaticamente após rename | logo após [321] | executar CI e Deploy GitHub Pages no novo repositório | rollback do nome do repo |
| GitHub Pages | workflow `deploy-pages.yml` usa `page_url` dinâmico; o endereço do project site depende do nome do repositório | URL pública do Pages muda com o repo | após [321] | workflow Pages verde e nova URL acessível | rollback do nome do repo ou redirect externo se houver consumidor |
| README/badges | README já usa PedeAqui e não possui badges/URL técnica hardcoded | baixo | [322] auditoria | leitura + guardrail | restaurar se algum link quebrar |
| documentação | docs de produto usam PedeAqui; alguns documentos de auditoria/histórico citam `cruz` de forma deliberada | histórico não deve ser reescrito indiscriminadamente | [322]/[323] | busca por referência antiga; manter apenas contexto histórico/rollback | restaurar commit anterior |
| Codespaces/devcontainer | não há `.devcontainer` versionado no tree atual | nenhum binding versionado ao nome | nenhuma ação agora | tree do repositório após rename | n/a |
| hooks/deploy hooks versionados | nenhum hook com nome do repo foi encontrado na árvore versionada | nenhuma ação no código | [322] conferir integrações externas | CI/Pages e conectores | reconfigurar origem externa se aparecer |
| Vercel | conector acessível ao time `cruzjade080-4490s-projects`, porém retorna **0 projetos** | não há projeto Vercel visível para atualizar/validar por este conector | [322] registrar como integração não vinculada/visível | `list_projects` continua sem projeto; não bloquear rename do GitHub | n/a |
| Supabase projeto oficial | ref `zsbsczjhiujnhdznrzck`, nome de exibição **Cruz**, região `sa-east-1` | ref/API/database host não mudam com rename GitHub; somente rótulo de gestão fica legado | [322] | `get_project`, migrations/drift, RLS e CI | manter/refazer somente rótulo; nunca recriar projeto/ref |
| Supabase migrations | baseline aponta por `projectRef`, não pelo nome `Cruz` | nenhum impacto funcional | [322] validar | drift local/remoto verde | n/a |
| env/secrets | chaves são por função (`SUPABASE_*`, `APP_URL`) e não pelo repo name | GitHub secrets permanecem no mesmo repository object após rename | pós-[321] | CI confirma secrets/contexto | rollback do repo se segredo/integration binding falhar |
| issues/PRs/branches/tags | pertencem ao mesmo repository object do GitHub | devem ser preservados automaticamente pelo rename | [321] | checar issues [319]-[323], `main`, PRs recentes e histórico | rollback do nome |
| integrações externas não versionadas | qualquer consumidor da URL antiga pode depender do redirect do GitHub | risco externo residual | [322] | validar conectores disponíveis e registrar exceções justificadas | manter redirect/rollback |

## Evidências coletadas

### GitHub

- Repositório atual: `wesley956/cruz`.
- README já declara `# PedeAqui`.
- `package.json` ainda declara `"name": "cruz"`.
- `ci.yml` não fixa owner/repository em comandos do projeto.
- `deploy-pages.yml` usa o output dinâmico de GitHub Pages.
- A árvore atual não contém `.devcontainer` nem lockfile npm.

### Supabase

Projeto oficial:

- `project_ref`: `zsbsczjhiujnhdznrzck`
- nome de exibição atual: `Cruz`
- região: `sa-east-1`
- status: `ACTIVE_HEALTHY`

Regra de segurança do rename: **o project_ref não será alterado nem um novo projeto será criado**.

### Vercel

O conector atual lista o time `team_wJgepIgBUim8mQnFnLJUJR06`, mas `list_projects` retorna lista vazia. Portanto não existe, neste contexto conectado, um projeto Vercel que possa ser associado de forma confiável ao PedeAqui. Não será inventado vínculo nem alterado projeto de outro sistema.

## Ordem de execução segura

1. Fechar [320] com esta matriz e CI verde.
2. [321] renomear **somente o repositório GitHub** para `PedeAqui`.
3. Confirmar imediatamente: repository object, `main`, issues/PRs, Actions e Pages.
4. [322] atualizar `package.json` e referências técnicas realmente dependentes do nome; validar Supabase pelo ref estável e registrar o nome de exibição legado caso o conector não ofereça operação de rename.
5. [323] consolidar `PROJECT_INDEX.md`, README e baseline final.

## Procedimento de rollback

Se o rename do GitHub causar falha crítica não recuperável por ajuste de integração:

1. renomear o mesmo repository object de volta para `cruz`;
2. confirmar `main` e CI;
3. reverter alterações de package/docs da [322] se já aplicadas;
4. **não tocar no Supabase project_ref**;
5. registrar a causa antes de tentar novamente.

## Critério de aceite da [320]

A matriz cobre repositório, remotes, package, Vercel, Supabase, Actions, Pages/URLs, badges, hooks, Codespaces, documentação, secrets e integrações externas. Cada item possui impacto, ordem, validação e reversão ou uma justificativa explícita de `n/a`.
