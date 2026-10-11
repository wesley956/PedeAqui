# Plano operacional — contingência de hospedagem (Issue #1225)

> Documento de preparação. Não ativa uma nova hospedagem, não altera produção, não modifica DNS e não autoriza despesas.

## Baseline confirmado em 2026-10-11
- Código: GitHub `wesley956/PedeAqui`, Next.js 16.2.12, Node >=22, comando `npm run build` e `npm run start`.
- Deploy atual: Vercel projeto `cruz`, produção ligada ao repositório, domínio `pedeaqui.pp.ua`.
- Banco: Supabase `idyjinpeijyqcejnunwm` em `sa-east-1`; deve permanecer na migração.
- Automação: Vercel cron `*/1 * * * *` no endpoint `GET /api/internal/order-notifications`, autenticado por `CRON_SECRET`.
- PrintAgent Windows faz polling dos jobs e heartbeat com token local; preservar o domínio e a compatibilidade das APIs.
- Há integrações Meta/WhatsApp, Mercado Pago, filas e rotas de webhook; não executar jobs em paralelo em dois servidores.

## Pré-requisitos
1. Cotar preço efetivo com IPv4, tráfego, backups, tributos e eventual câmbio; sem aquisição antes de autorização.
2. Testar RAM e CPU em homologação; não presumir capacidade pelo preço.
3. Inventariar variáveis obrigatórias, com os **nomes**, sem expor seus valores em arquivos, issues ou logs.
4. Reproduzir `npm install --legacy-peer-deps --no-audit --no-fund`, `npm run typecheck`, `npm test`, `npm run check:routes` e `npm run build`.
5. Configurar hostname temporário com TLS e credenciais de teste. O ambiente de homologação não pode enviar mensagens, receber webhooks de produção, emitir cobranças nem gerar impressões da loja.
6. Projetar execução única dos agendamentos no cutover (cron do host versus cron Vercel), incluindo idempotência.
7. Configurar serviço com restart automático, logs com rotação, healthchecks, backups e processo de restauração.

## Homologação antes de trocar DNS
- [ ] Rotas públicas e cardápio, carrinho, checkout e uploads
- [ ] Autenticação, permissões, multi-tenant e correção fundamentada de erro 42501 em `roles`
- [ ] PDV: pix/cartão/dinheiro, troco, balcão/retirada/entrega, controle de mesas
- [ ] Criar e concluir pedidos, status e reconexão em tempo real
- [ ] Mercado Pago: OAuth, assinatura e webhooks com assinatura
- [ ] Meta/WhatsApp: Embedded Signup, webhooks, mensagens e cron
- [ ] PrintAgent: heartbeats, claim, ack, jobs por loja, impressora correta, reimpressão
- [ ] Backup e restauração testados e plano de rollback DNS
- [ ] Latência aceitável para lojas no Brasil

## Regra de cutover
A mudança exige aprovação explícita. Confirmar TTL DNS, TLS, APP_URL, cookies, URLs de callback OAuth e webhooks, credenciais e PrintAgent, monitorar erros e pedidos; rollback se qualquer fluxo crítico falhar. Somente depois desativar Vercel. A dívida anterior da Vercel permanece assunto separado.

## Custos
Priorizar preço-base mensal previsível inferior a US$20. Railway e outros modelos de uso variável não garantem esse limite por padrão. Não afirmar economia garantida sem medição.
