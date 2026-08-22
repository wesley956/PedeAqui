# Diagnóstico de apresentação — lote PA-DIAG-006 a PA-DIAG-010

Data de corte: 2026-08-22  
Master: GitHub #539  
Issues executadas neste lote: #545, #546, #547, #548 e #549

## Resultado executivo

| Diagnóstico | Issue | Estado | Evidência principal |
| --- | --- | --- | --- |
| `PA-DIAG-006` erros de navegador, servidor, Vercel, Supabase e banco | #546 | Parcial | produção e Supabase saudáveis; console autenticado e logs Vercel bloqueados pelas ferramentas conectadas |
| `PA-DIAG-007` correção, reteste, publicação e reversão | #548 | Aprovado | gate formal em `PRESENTATION_RELEASE_GATE_20260822.md` |
| `PA-DIAG-008` cadastro comercial de restaurante | #545 | Aprovado no núcleo; e-mail externo pendente | provisionamento real executado em transação revertida, com todas as invariantes aprovadas |
| `PA-DIAG-009` login, logout, expiração e recuperação | #547 | Parcial | contratos e superfícies públicas aprovados; sessão autenticada e entrega de e-mail exigem conta de homologação |
| `PA-DIAG-010` onboarding e primeira configuração | #549 | Parcial | implementação atômica e idempotente aprovada; primeira conta real continua dependente da conta de homologação |

“Parcial” não significa falha confirmada. Significa que uma dependência externa ou uma sessão de homologação ainda é necessária para afirmar que o fluxo inteiro passou ao vivo.

## PA-DIAG-006 — erros e observabilidade

### Produção HTTP

Verificação sem cache privilegiado, seguindo redirects:

| Superfície | Resultado | Destino final | Tempo observado |
| --- | --- | --- | --- |
| `/login` | 200 | `/login` | 6,03 s |
| `/cadastro` | 200 | `/cadastro` | 5,00 s |
| `/recuperar-senha` | 200 | `/recuperar-senha` | 6,13 s |
| `/onboarding` sem sessão | 200 | `/login` | 5,44 s |
| `/platform/novo-restaurante` sem sessão | 200 | `/login` | 6,25 s |
| `/api/health` | 200 | `/api/health` | 6,72 s |

Todos os destinos e controles de acesso responderam corretamente. A latência de aproximadamente 5–7 segundos confirma a percepção de demora e deve ser tratada no lote específico de performance, sem misturá-la a este diagnóstico funcional.

### Supabase e banco — últimas 24 horas

- API: quatro eventos disponíveis, todos HTTP 200 (`stores` e `get_public_menu`).
- Auth: nenhum evento disponível na janela consultada.
- Postgres: dois `ERROR` vieram das próprias consultas exploratórias deste diagnóstico, que inicialmente tentaram colunas inexistentes (`usr.active` e `r.slug`). Não são falhas do aplicativo nem tráfego de cliente.
- Os demais eventos de Postgres são checkpoints e encerramentos de conexão; não houve `FATAL`, `PANIC` ou timeout na amostra.
- Projeto `ACTIVE_HEALTHY`, PostgreSQL 17.6 e 114 migrations aplicadas.

### Bloqueios explícitos

- A conta Vercel conectada retorna zero projetos e, portanto, não expõe runtime logs, deployment ou Speed Insights do domínio publicado.
- O ambiente de execução não forneceu navegador automatizado nem sessão autenticada. Foram validados HTTP, redirects, build e contratos; console e requests autenticados precisam do roteiro presencial ou de uma conta de homologação.

Esses bloqueios não devem ser escondidos. A apresentação deve usar o domínio canônico e o tenant demo, e o lote de observabilidade deve reconectar a conta Vercel proprietária do projeto.

## PA-DIAG-008 — novo restaurante pelo super admin

O RPC de produção `platform_provision_restaurant_internal` foi chamado com dados sintéticos dentro de uma transação finalizada com `ROLLBACK`. As seguintes invariantes retornaram verdadeiras:

- organização criada em `trial`;
- loja primária criada ativa e sem a marca de demo;
- oito papéis sistêmicos criados;
- convite `platform_owner` criado e não expirado;
- WhatsApp criado desligado, `not_connected` e `not_started`;
- registro de auditoria e evento de domínio criados;
- retorno confirmou proprietário convidado e tenant não-demo.

Após o rollback, a consulta de resíduos retornou zero organizações `Diagnostico PedeAqui`.

A entrega real do convite por e-mail não foi disparada para evitar criar usuário ou enviar mensagem externa durante o diagnóstico. O serviço mantém fallback manual quando o provedor de convite falha.

Correção preventiva confirmada neste lote: URLs de convite e recuperação agora removem qualquer barra final de `APP_URL`, evitando callback com `//`, e o fallback comercial usa o domínio canônico com `www`.

## PA-DIAG-009 — autenticação

### Aprovado

- login usa `signInWithPassword` no servidor;
- credencial inválida recebe mensagem genérica, sem revelar se o e-mail existe;
- `next` aceita apenas caminho interno;
- callback PKCE usa `exchangeCodeForSession` e destino validado;
- recuperação responde de forma idêntica para conta existente ou inexistente;
- atualização de senha exige usuário válido na sessão;
- logout chama `signOut` e volta para `/login`;
- páginas públicas de login, cadastro e recuperação responderam 200;
- URLs externas de callback são normalizadas sem barra duplicada.

### Pendente de homologação externa

- login feliz, logout e expiração em navegador com uma conta dedicada;
- recebimento real do e-mail de confirmação;
- recebimento real do e-mail de recuperação e troca de senha ponta a ponta;
- alerta do advisor `auth_leaked_password_protection`, que depende de configuração do Supabase Auth.

Não criar ou compartilhar senha de super admin para fechar esta pendência.

## PA-DIAG-010 — onboarding e primeira configuração

O onboarding exige autenticação, valida nomes e tipo de negócio, calcula módulos a partir do catálogo central e chama `bootstrap_organization_modular`. O RPC:

- usa lock transacional por usuário;
- reutiliza tenant ativo em reenvio concorrente/idempotente;
- valida perfil do negócio, preset, módulos essenciais e dependências;
- cria organização, loja, papéis e módulos na mesma transação;
- grava auditoria da seleção inicial;
- não permite módulo de salão fora de restaurante nem botijão fora de revenda de gás.

Testes existentes cobrem presets, dependências, isolamento, slug concorrente e navegação condicionada. O caminho de primeira conta real permanece parcial porque todos os usuários atuais já pertencem a uma organização e o diagnóstico não cria uma identidade de produção descartável.

Uma chamada real do RPC com o usuário de plataforma atual, também dentro de `BEGIN ... ROLLBACK`, retornou `reused_existing_tenant=true` e os identificadores da organização e da loja já existentes. Nenhum novo perfil de negócio foi criado, comprovando o caminho idempotente sem expor identificadores no relatório.

## Próxima ação segura

Criar uma conta de homologação não administrativa e executar, no navegador que será usado na reunião: cadastro, confirmação, onboarding Essencial, logout, login, recuperação e expiração. Registrar somente o resultado, nunca a senha ou o token recebido.
