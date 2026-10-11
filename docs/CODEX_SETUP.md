# Preparar o PedeAqui para o Codex

Revisão: 11/10/2026. Este guia prepara o checkout e preserva contexto entre conversas. Não transfere automaticamente segredos, sessões de login, banco ou impressoras.

## Abrir a pasta certa

1. Clone `https://github.com/wesley956/PedeAqui.git` ou atualize um checkout existente sem descartar alterações locais.
2. Abra **a pasta PedeAqui que contém package.json e AGENTS.md** como projeto local no Codex.
3. Confira `git remote -v`, `git status` e a branch. A referência principal é `main`; trabalhe em uma branch para a tarefa.
4. Comece pelo estado atual e consulte o mapa do código conforme o problema.

Se estiver dentro do espelho de um projeto ChatGPT, `sources/` é referência sincronizada e somente leitura. Use um checkout separado do repositório; não transforme os arquivos sincronizados no código da aplicação.

## Instalar

Use Node.js 22+; o CI usa 22. Os comandos abaixo partem da raiz do repositório:

```powershell
npm install --legacy-peer-deps --no-audit --no-fund
Copy-Item .env.example .env.local
npm run dev
```

Não sobrescreva `.env.local` existente. Preencha o ambiente antes de utilizar login ou operações conectadas. Para encerrar o servidor local, use Ctrl+C.

Não há lockfile no snapshot `e67f1e99`; por isso `npm ci` não é o comando inicial. O workaround de instalação está em `.github/workflows/ci.yml`. Um lockfile novo precisa de validação própria; não assuma que versões transitivas resolvidas hoje são as usadas no último deploy.

## Variáveis por finalidade

| Finalidade | Variáveis | Uso |
| --- | --- | --- |
| Cliente e sessão Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Públicas; URL e chave devem pertencer ao mesmo projeto |
| Operações privilegiadas do servidor | `SUPABASE_SERVICE_ROLE_KEY` | Segredo; nunca browser ou Print Agent |
| URL e logs | `APP_URL`, `LOG_LEVEL` | Local: `http://localhost:3000`, `info` |
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_GRAPH_API_VERSION` | Integração oficial, server-only |
| Embedded Signup Meta | Variáveis `META_*` documentadas em `.env.example` | Configuração da plataforma; não necessária para editar o PDV |
| Mercado Pago | `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`, `MERCADO_PAGO_OAUTH_REDIRECT_URI`, `MERCADO_PAGO_ORDER_WEBHOOK_SECRET` | OAuth/webhooks; não copiar access tokens para o código |
| Jobs internos | `CRON_SECRET` | Autentica jobs; não iniciar tarefas reais para testar documentação |

Outras variáveis específicas aparecem nos serviços e scripts correspondentes. A tabela não substitui o código nem as configurações do provedor.

O projeto disponível no conector Supabase em 11/10/2026 é `idyjinpeijyqcejnunwm`. Os baselines Git ainda registram `zsbsczjhiujnhdznrzck`. Confirme o ambiente desejado antes de usar credenciais; o simples acesso ao conector não confirma o vínculo de um deploy. Não faça testes destrutivos no banco conectado.

## Verificações e alcance

| Comando | O que verifica |
| --- | --- |
| `npm run check:routes` | Integridade estática de rotas e links internos |
| `npm run db:drift` | Contratos locais do SQL e baseline + tail versionados; não consulta o banco por padrão |
| `npm run preflight:production` | Contratos de upload/região; Storage remoto somente se credenciais específicas forem fornecidas |
| `npm run lint`, `npm run typecheck` | Análise estática |
| `npm test` | Suíte Vitest |
| `npm run test:public-ux` | Contratos da experiência pública |
| `npm run test:e2e` | Jornadas contextuais determinísticas em Vitest, não um navegador real |
| `npm run build` | Build Next.js |
| `node --check print-agent/src/index.mjs` | Sintaxe do ponto de entrada do agente, sem iniciá-lo |

O CI verifica também `spool.mjs`, `escpos.mjs` e `system-print.mjs`. A comparação remota de migrações usa um arquivo produzido por consulta somente leitura quando `SUPABASE_DB_URL` está configurada no CI.

Preflight remoto: `PREFLIGHT_SUPABASE_URL`, `PREFLIGHT_SUPABASE_SERVICE_ROLE_KEY`; `PREFLIGHT_REQUIRE_LIVE=true` exige credenciais e impede interpretar um skip como aprovação remota.

Homologação de navegador está em `.github/workflows/browser-homologation.yml` e `scripts/browser-homologation.mjs`. A trilha isolada de banco está em `.github/workflows/isolated-chaos.yml` e `scripts/run-isolated-chaos.sh`; exige ferramentas próprias e não é um atalho para executar fixtures em produção.

## Impressão

Leia `print-agent/README.md`. Para desenvolver o painel não é preciso instalar nem iniciar o agente. Validar impressão física requer o computador e a impressora pretendidos, credencial específica e confirmação do resultado no papel.

## Hospedagem e entrega

`vercel.json` declara região `gru1` e cron de `/api/internal/order-notifications` a cada minuto. O workflow Pages publica `github-pages/`, não o servidor Next.js.

O conector Vercel não retornou projeto na busca por PedeAqui em 11/10/2026. Isso não prova ausência de hospedagem: vínculo, equipe e deploy precisam ser conferidos no ambiente correto antes de publicar. Nenhum deploy faz parte desta preparação.

## Mensagem inicial sugerida

> Estamos continuando o PedeAqui, repositório wesley956/PedeAqui. Leia AGENTS.md e docs/CURRENT_STATE.md, confira a branch e localize o fluxo relevante em docs/CODE_MAP.md. Preserve as decisões registradas e diferencie o que está no código do que foi validado em produção. Nossa prioridade é melhorar a operação de PDV e Pedidos com menos cliques, melhor uso do espaço e sem regressões financeiras ou de impressão.

## Prontidão

- [x] Contexto, comandos e mapa do código documentados.
- [x] Referências antigas de ambiente identificadas.
- [ ] Dependências instaladas e gates completos no ambiente onde o projeto será executado.
- [ ] Credenciais do ambiente escolhido configuradas fora do Git.
- [ ] Vínculo do deploy atual e histórico remoto de migrações reconciliados.
- [ ] Pendências de navegador/hardware verificadas quando a tarefa exigir.

Esses itens distinguem documentação pronta de ambiente operacional homologado.
