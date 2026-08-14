# PedeAqui — Navegação desktop

> Issue lógica: **[272]**

O menu lateral agora é alimentado pelo RBAC/contexto resolvido em [271], não por uma lista global fixa.

## Fluxo

1. `NavigationAccessService.load()` resolve papel organizacional + papel da unidade quando houver.
2. Lê somente `roles`, `role_permissions` e `permissions` cobertos pelas RLS existentes.
3. `contextsForRoleKeys()` resolve os contextos conhecidos.
4. `contextualNavigation()` combina prioridade de contexto com permissões efetivamente concedidas.
5. `ProtectedLayout` passa os itens já filtrados ao `AppShell`.
6. `DesktopNavigation` organiza os itens em Operação, Gestão, Suprimentos, Relacionamento e Administração.

A filtragem continua sendo apenas UX. A rota/action mantém sua autorização própria.

## Comportamento

- rota atual indicada com `aria-current="page"` e destaque visual;
- grupos vazios não aparecem;
- sidebar tem rolagem vertical quando necessário, evitando cortar links em telas baixas;
- botão acessível alterna entre modo expandido e compacto;
- no compacto, textos são substituídos visualmente por um marcador e `title`, mantendo o nome acessível do link;
- alvos aumentam em dispositivos `pointer: coarse`;
- foco visível preservado.

## Compatibilidade

A navegação mobile ainda utiliza os mesmos `navigationItems`, porém a composição curta + `Mais` pertence à [273]. A topbar continua sem mudanças funcionais até [274].
