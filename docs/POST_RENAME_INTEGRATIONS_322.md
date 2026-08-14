# [322] Validação pós-rename técnico

Data: 2026-08-14

## Resultado

O mesmo repository object foi renomeado de `wesley956/cruz` para `wesley956/PedeAqui`.

- Repository ID preservado: `1329524264`.
- Branch padrão preservada: `main`.
- Histórico, issues, PRs e branches permanecem no mesmo objeto.
- A URL antiga do GitHub resolve para o repositório novo, permitindo transição de clones/remotes antigos.
- O package técnico passa a ser `pedeaqui`.

## Checklist de integrações

| Dependência | Situação pós-rename | Evidência / ação |
| --- | --- | --- |
| GitHub repository | Resolvido | `wesley956/PedeAqui`, mesmo Repository ID `1329524264` |
| Git remotes existentes | Compatível com transição | GitHub mantém redirect da URL antiga; novos clones devem usar `https://github.com/wesley956/PedeAqui.git` |
| `package.json` | Resolvido | `name: pedeaqui` |
| GitHub Actions | Resolvido | CI executa no novo repository context e valida `GITHUB_REPOSITORY=wesley956/PedeAqui` |
| GitHub Pages | Resolvido | workflow pós-rename verde; URL canônica `https://wesley956.github.io/PedeAqui/`; HTTPS ativo |
| README/badges | Resolvido | README já usa PedeAqui e não depende da URL antiga |
| Scripts versionados | Resolvido | nenhuma dependência funcional do nome antigo identificada |
| Codespaces/devcontainer | N/A | não existe `.devcontainer` versionado |
| Deploy hooks versionados | N/A | nenhum hook versionado dependente do nome antigo |
| GitHub secrets | Resolvido | preservados no mesmo repository object; CI pós-rename acessa o contexto existente |
| Supabase | Funcionalmente resolvido | project ref permanece `zsbsczjhiujnhdznrzck`; migrations/drift continuam independentes do nome do GitHub |
| Supabase display name | Exceção administrativa justificada | o projeto ainda aparece como `Cruz`; o conector disponível não expõe rename do rótulo. Não recriar projeto nem alterar `project_ref` para corrigir apenas o nome visual |
| Vercel | Sem vínculo visível | time conectado retorna zero projetos; não existe projeto identificável para alterar sem inventar associação |
| Integrações externas não versionadas | Compatível | consumidores da URL GitHub antiga recebem redirect; novos vínculos devem usar a URL canônica |

## GitHub Pages

A execução disparada após o merge da [321] terminou com sucesso no repositório renomeado. O Pages usa `build_type: workflow`, branch `main`, HTTPS obrigatório e URL canônica `https://wesley956.github.io/PedeAqui/`.

## Supabase

O rename do GitHub não altera banco, API URL ou host do banco porque essas integrações usam o `project_ref` estável `zsbsczjhiujnhdznrzck`.

O nome de exibição `Cruz` no painel Supabase é somente um rótulo administrativo. Como a integração disponível não oferece uma operação segura para renomear apenas esse rótulo, ele permanece documentado como exceção. **Não criar outro projeto, não migrar dados e não trocar o project ref por causa do nome.**

## Vercel

O conector acessível ao time `team_wJgepIgBUim8mQnFnLJUJR06` retorna zero projetos. Portanto não existe um projeto Vercel que possa ser atualizado de forma confiável neste contexto. Esta ausência não bloqueia o fechamento do rename técnico.

## Rollback

Se uma integração externa crítica ainda não observada deixar de funcionar:

1. confirmar se ela usa a URL antiga do GitHub e atualizar para `wesley956/PedeAqui`;
2. confirmar o redirect do GitHub;
3. se o problema for exclusivamente causado pelo nome e não houver correção pontual, o mesmo repository object pode ser renomeado de volta temporariamente;
4. restaurar `package.json` apenas se um consumidor técnico exigir o nome antigo;
5. nunca alterar/recriar o Supabase para executar rollback do nome do GitHub.

## Critério de aceite

O checklist da [320] está resolvido ou possui exceção explícita e justificada. CI e Pages funcionam no novo nome, package e URLs canônicas foram alinhados, e nenhuma dependência versionada ativa exige `wesley956/cruz`.
