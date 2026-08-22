# PedeAqui — diagnóstico e entrega PA-DIAG-096–145

Data do ciclo: 22/08/2026. Lote: 50 issues (`#636`–`#684`, apenas títulos `PA-DIAG`).

## Resultado executivo

O lote adiciona uma área de apresentação guiada e transforma o financeiro SaaS do
Painel do Proprietário em um domínio separado do financeiro dos restaurantes. O contrato
de cada cliente preserva sua versão de plano; alterações posteriores geram nova versão.
Descontos têm início e fim, mensalidades e pagamentos possuem idempotência, e suspensão
de acesso não remove nenhum dado operacional.

Status para apresentação: **aprovado com ressalva externa**. O produto, banco, demonstração,
Plano Fundadores e gestão manual de cobrança estão cobertos por testes. WhatsApp real,
gerador externo do QR e cobrança automática dependem de conectividade/credenciais de
fornecedores e devem usar o plano alternativo documentado na própria tela.

## Mapa das issues

| Faixa | Evidência entregue |
| --- | --- |
| 096–098 | textos comerciais revisados, alvos responsivos existentes, tela guiada, loading e proteção ao sair com formulário preenchido |
| 099–101 | novas tabelas fechadas para browser, funções restritas ao `service_role`, validação de `super_admin` também no banco e nenhum segredo no QR/relatórios |
| 102–105 | Zod em todas as mutações novas, datas inválidas não causam `RangeError`, aviso offline e logger central com redação de campos sensíveis |
| 106 | upload de catálogo limitado a 4 MiB; PIN de entregador e login principal bloqueiam após 5 falhas; login persiste somente HMAC, nunca e-mail/IP |
| 107–109 | jornadas E2E existentes continuam sendo gate; contratos específicos cobrem módulos mínimos e Delivery + WhatsApp |
| 110–112 | restaurante demo idempotente, persona de cliente demonstrada sem compartilhar sessão de super admin, URL pública e QR do cardápio |
| 113–116 | roteiro exato, cola de navegação, respostas comerciais e contingência para internet/WhatsApp/computador |
| 117–119 | checklist de ensaio, versão congelada por branch/CI e este relatório final |
| 120–124 | financeiro SaaS separado, catálogo de planos, vínculo assinatura–plano e snapshot dos módulos contratados |
| 125–130 | vencimento, situação, desconto temporário, histórico, mensalidades, pagamentos e visão de inadimplência/receita |
| 131–134 | tolerância, suspensão reversível, fila de avisos por painel/WhatsApp e indicadores mensais |
| 135 | investigação de cobrança automática concluída; provider ainda não ativado sem conta e credenciais do usuário |
| 136–142 | auditoria financeira imutável, catálogo central existente, construtor por módulos, preço manual e versões que preservam contratos antigos |
| 143–145 | preço travado por cliente e Plano Fundadores de R$ 79,90 com três vagas impostas por índice, `check` e trava transacional |

## CRUD financeiro

- Planos: criar, consultar, versionar/editar e retirar de novas vendas. Exclusão destrutiva
  é substituída por desativação para preservar contratos.
- Módulos do plano: incluir, consultar e alterar em nova versão; o snapshot antigo é imutável.
- Assinaturas: criar/ativar, consultar, trocar plano, aplicar tolerância, suspender, reativar
  e cancelar pelo fluxo oficial.
- Descontos: criar, consultar e encerrar. O término não muda o preço-base.
- Mensalidades: criar, consultar, atualizar situação e cancelar/isentar; a chave idempotente
  evita duplicidade.
- Pagamentos: criar, consultar e registrar estado (`pending`, `paid`, `failed`, `refunded`,
  `cancelled`). Registros permanecem no histórico em vez de serem apagados.

## Cobrança automática — decisão PA-DIAG-135

O repositório já possui interface de adapters, assinatura de webhook, recibo idempotente e
state machine de assinatura, mas **nenhum provider de billing está registrado**. A base
manual entregue neste lote é provider-agnostic e está pronta para conciliar eventos.

Para o contexto brasileiro inicial, a primeira homologação recomendada é **Asaas em
sandbox**, porque sua API oficial cria cobranças por Pix, boleto e cartão, permite
mensalidades controladas pela aplicação e publica webhooks de mudanças de cobrança. A
segunda opção é Mercado Pago, que oferece planos de assinatura e meios como saldo, Pix,
cartão e boleto. Stripe passa a ser alternativa relevante para Pix recorrente, mas a
disponibilidade do Pix Automático deve ser confirmada na conta brasileira antes do uso.

Fontes consultadas em 22/08/2026:

- Asaas, visão geral de cobranças: https://docs.asaas.com/docs/payments-overview
- Asaas, eventos de cobranças: https://docs.asaas.com/docs/webhook-para-cobrancas
- Mercado Pago, planos de assinatura: https://www.mercadopago.com.br/developers/en/docs/subscription-plans/overview
- Stripe, Pix recorrente: https://docs.stripe.com/billing/subscriptions/pix

Não foi criada conta, contratado serviço ou armazenada chave neste lote. Essa ativação
exige escolha comercial do proprietário, credenciais sandbox e homologação de webhook.

## Critério de liberação

1. Migrações `120_platform_saas_billing.sql`, `121_platform_saas_billing_fk_indexes.sql` e `122_auth_login_rate_limit.sql` aplicadas e inventário remoto reconciliado.
2. Testes, TypeScript, lint, build, E2E e preflight aprovados.
3. Security e Performance Advisors comparados antes/depois da migração.
4. Três execuções consecutivas da jornada de apresentação sem mutação fora da demo.
5. PR incorporado em `main`; mudanças de última hora somente em novo lote e novo PR.
