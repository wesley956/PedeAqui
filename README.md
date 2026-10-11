# PedeAqui

Plataforma SaaS multiempresa para operações de alimentação: cardápio digital, pedidos, PDV, cozinha/KDS, impressão, salão, delivery, caixa e gestão.

**Retomada revisada em 11/10/2026**, a partir da `main` em `e67f1e99` (merge da barra fixa do PDV, PR #1223). Os ciclos [001]–[323] descrevem a fundação histórica, não o limite atual do produto.

## Comece aqui

- [Preparar o ambiente e abrir no Codex](docs/CODEX_SETUP.md)
- [Estado atual, contexto e pendências](docs/CURRENT_STATE.md)
- [Mapa do código e fluxos](docs/CODE_MAP.md)
- [Instruções para agentes](AGENTS.md)
- [Índice da documentação especializada e histórica](docs/PROJECT_INDEX.md)

## Identidade e ambientes

| Item | Referência |
| --- | --- |
| Repositório | [wesley956/PedeAqui](https://github.com/wesley956/PedeAqui), branch principal `main` |
| Aplicação pública, registrada no histórico | https://www.pedeaqui.pp.ua |
| GitHub Pages | https://wesley956.github.io/PedeAqui/ — site estático de apresentação, não a aplicação Next.js |
| Supabase disponível no conector em 11/10/2026 | `idyjinpeijyqcejnunwm`, região `sa-east-1` |
| Ref histórico nos baselines de agosto | `zsbsczjhiujnhdznrzck` — não usar como destino atual por inferência |
| Hospedagem | `vercel.json` declara `gru1`; projeto/deploy atual não foi confirmado pelo conector nesta revisão |

A aplicação resolve a conexão de banco pelas variáveis de ambiente. Antes de preencher credenciais ou executar SQL, confira o projeto e o ambiente pretendidos. Não recrie o banco nem reaplique todo o histórico para preparar o Codex.

## Desenvolvimento local

Requisito declarado: **Node.js 22+**; o CI usa Node.js 22.

```powershell
git clone https://github.com/wesley956/PedeAqui.git
cd PedeAqui
npm install --legacy-peer-deps --no-audit --no-fund
Copy-Item .env.example .env.local
# Preencha .env.local com credenciais do ambiente de desenvolvimento.
npm run dev
```

Abra http://localhost:3000. O arquivo de exemplo contém nomes de variáveis, sem credenciais funcionais. Login e operações reais dependem de um ambiente Supabase configurado. Prefira um ambiente isolado para desenvolvimento.

O comando de instalação acompanha o workaround documentado no CI para a resolução de peers do npm. Não há lockfile versionado no snapshot revisado; a instalação ainda não é totalmente reproduzível. A adoção de um lockfile deve ser validada em uma alteração própria, sem atualizar versões arbitrariamente.

## Stack e estrutura

Next.js 16.2.12, React 19.2.8, TypeScript 6.0.3, Supabase JS 2.111.0, SSR 0.12.4 e Vitest 4.1.10, conforme `package.json`.

- `src/app`: páginas, layouts e APIs.
- `src/features`: interfaces e ações por funcionalidade.
- `src/server`: serviços, autorização e regras dos domínios.
- `src/components`, `src/lib`, `src/modules`: componentes, utilitários e infraestrutura modular.
- `supabase/sql`, `supabase/migrations`: SQL e migrações; possuem convenções distintas.
- `print-agent`: processo local Windows/rede para impressão ESC/POS.
- `tests`, `scripts`: contratos, testes e verificações.

## Verificações

```powershell
npm run check:routes
npm run db:drift
npm run preflight:production
npm run lint
npm run typecheck
npm test
npm run test:public-ux
npm run test:e2e
npm run build
```

O CI também valida o nome do repositório, executa as jornadas contextuais três vezes e verifica a sintaxe do Print Agent. Consulte [o guia](docs/CODEX_SETUP.md) para limites das verificações de banco, navegador e hardware.

## Impressão e integrações

O Print Agent é instalado no computador da loja por **Configurações > Impressões**. Use [o manual do agente](print-agent/README.md); nunca coloque a chave `service_role` no computador de impressão.

WhatsApp/Meta, Mercado Pago, fiscal e demais integrações têm configuração e homologação próprias. A existência de código não comprova aprovação do fornecedor nem funcionamento em todas as contas.

Identidade visual: [manual da marca](docs/BRAND_IDENTITY.md). Reutilize os componentes e tokens existentes.
