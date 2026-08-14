# [321] Rename técnico do repositório

Objetivo: alterar **somente** o nome técnico do mesmo repository object GitHub, de `wesley956/cruz` para `wesley956/PedeAqui`, preservando histórico, branches, issues e PRs.

## Pré-condições

- [319] revisão final do ciclo concluída.
- [320] matriz de dependências concluída.
- Repository ID atual: `1329524264`.
- Branch padrão: `main`.
- Permissão do usuário conectado: `admin=true`.
- O nome alvo `PedeAqui` não foi encontrado como outro repositório do owner no levantamento de [320].

## Ação de rename

Usar o mesmo repository object e alterar apenas `name` para `PedeAqui`. **Não criar um novo repositório e não fazer mirror**, pois isso perderia o vínculo nativo de issues/PRs/configurações.

A API equivalente do GitHub é `PATCH /repos/wesley956/cruz` com `name=PedeAqui`.

## Gate automatizado

`scripts/check-repository-name.mjs` roda no CI e exige:

```text
GITHUB_REPOSITORY=wesley956/PedeAqui
```

Assim a PR [321] não pode ficar verde enquanto o repository object ainda estiver com o nome antigo.

## Validação imediata após o rename

1. `get_repo("wesley956/PedeAqui")` deve retornar o mesmo Repository ID `1329524264`.
2. `default_branch` deve continuar `main`.
3. Issues #349–#353 devem continuar acessíveis.
4. PR desta issue deve continuar acessível.
5. CI deve rodar no novo nome e passar o gate `REPOSITORY_NAME`.
6. Deploy GitHub Pages deve continuar executável; a URL do project site deve ser revalidada porque ela depende do nome do repo.
7. Clones existentes devem preferir atualizar `origin` para `https://github.com/wesley956/PedeAqui.git`, embora o GitHub normalmente mantenha redirect do nome antigo.

## Rollback

Se uma integração crítica quebrar e não puder ser corrigida imediatamente, renomear o **mesmo** repository object de volta para `cruz`, confirmar `main`/CI e registrar a integração responsável antes de tentar novamente.

## Referências restantes para [322]

Após o rename do repositório ainda restarão, deliberadamente:

- `package.json` com `"name": "cruz"`;
- Supabase `project_ref=zsbsczjhiujnhdznrzck` com nome de exibição `Cruz` (o ref nunca deve ser recriado por causa do rename);
- documentos históricos que mencionam o nome antigo como contexto/rollback;
- eventual configuração externa não visível pelos conectores, a ser validada sem inventar vínculo.
