# [307] QA de login, sessão e recuperação de acesso

Data: 2026-08-14

## Fluxos revisados

### Login

- `signInWithPassword` continua server-side.
- `next` é aceito somente quando representa caminho interno da própria aplicação.
- URLs absolutas, protocol-relative (`//...`) e caminhos com barra invertida são rejeitados.
- deep link interno válido continua tendo precedência; login genérico usa `StartRouteService`.
- erro de credencial não informa se o e-mail existe.

### Callback PKCE

O projeto usa `@supabase/ssr`, que utiliza PKCE por padrão. O callback troca o auth code com `exchangeCodeForSession` e agora valida o destino antes de redirecionar. Isso elimina redirecionamento externo controlado por `next`.

O auth code é temporário e de uso único; callback inválido/expirado retorna ao login com mensagem própria.

### Recuperação de senha

- solicitação usa `resetPasswordForEmail` com callback para `/nova-senha`;
- a tela retorna o mesmo estado de envio independentemente de a conta existir, reduzindo enumeração de usuários;
- antes de atualizar a senha, a action confirma a sessão com `auth.getUser()`;
- sessão de recuperação inválida/expirada retorna ao login em vez de tentar atualizar senha sem identidade válida;
- falha de regra de senha permanece tratada sem expor mensagem interna do provedor.

### Logout / sessão

`signOut` continua invalidando a sessão pelo Supabase e retorna ao login. Rotas autenticadas dependem do contexto server-side e não do estado visual do menu.

## Configuração Supabase Auth

O advisor oficial em 2026-08-14 reporta **`auth_leaked_password_protection` = WARN**: proteção contra senhas vazadas está desabilitada.

Recomendação para o projeto oficial:

1. Em Auth > Providers > Email, habilitar proteção contra senhas vazadas quando o plano suportar.
2. Manter mínimo de senha >= 8; idealmente exigir combinação forte conforme política comercial.
3. Manter PKCE/SSR e URLs de redirect estritamente cadastradas para os domínios oficiais.
4. Não usar mensagens diferentes em recuperação que permitam descobrir se um e-mail existe.
5. Revalidar o advisor após alterar a configuração.

A proteção contra senhas vazadas é configuração do serviço Auth, não DDL do Postgres; portanto esta issue não tenta alterá-la por migration SQL.

Referências oficiais:
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
