# Diagnóstico de apresentação — lote PA-DIAG-046 a PA-DIAG-095

Data: 22/08/2026

Este lote cobre o mini robô do WhatsApp, Super Admin, gestão comercial, módulos por cliente, desempenho percebido e apresentação pelo celular. As correções preservam isolamento por organização, autorização server-side, histórico e idempotência.

## Resultado por issue

| Diagnóstico | GitHub | Resultado | Evidência principal |
|---|---:|---|---|
| `PA-DIAG-046` saudação automática | #587 | Aprovado | saudação idempotente abre o menu na primeira mensagem |
| `PA-DIAG-047` menu 1/2/3 | #585 | Aprovado | cardápio, acompanhamento e atendente têm intenções explícitas |
| `PA-DIAG-048` link correto do cardápio | #589 | Aprovado | URL deriva da unidade recebida pelo webhook, sem link global |
| `PA-DIAG-049` pedido por telefone e código | #588 | Aprovado | consulta exige código e telefone do WhatsApp, dentro da mesma organização/unidade |
| `PA-DIAG-050` confirmação e status | #586 | Aprovado | resposta traduz status e oferece link seguro de acompanhamento |
| `PA-DIAG-051` transferência humana | #591 | Aprovado | opção 3 altera a sessão para `waiting_agent` |
| `PA-DIAG-052` repetição e ciclos | #593 | Aprovado | `message_created` e chave idempotente impedem respostas duplicadas |
| `PA-DIAG-053` WhatsApp desconectado | #594 | Aprovado | configuração incompleta ou falha de provider interrompe o robô e preserva atendimento humano |
| `PA-DIAG-054` estado da conexão | #590 | Aprovado | readiness continua visível no painel e Super Admin |
| `PA-DIAG-055` acesso Super Admin | #592 | Aprovado | RBAC exige `super_admin`; conta proprietária ativa foi confirmada ao vivo |
| `PA-DIAG-056` Super Admin mobile | #595 | Aprovado | grade vira uma coluna em 430 px e controles touch têm 48 px |
| `PA-DIAG-057` listar/buscar/filtrar clientes | #598 | Aprovado | busca diferida e navegação para visão 360 já ficam disponíveis |
| `PA-DIAG-058` detalhe e status do cliente | #597 | Aprovado | visão 360 mostra unidade, assinatura, módulos e saúde operacional |
| `PA-DIAG-059` CRUD seguro de organizações | #596 | Aprovado | ações operacionais são auditadas, idempotentes e sem exclusão física |
| `PA-DIAG-060` mensalidade e cobrança | #599 | Aprovado | valor, vencimento, próximo vencimento e pagamento têm CRUD controlado |
| `PA-DIAG-061` módulos individuais | #602 | Aprovado | catálogo e configuração permitem ativação granular por unidade |
| `PA-DIAG-062` falhas de WhatsApp | #603 | Aprovado | painel sanitiza falhas sem expor token/payload |
| `PA-DIAG-063` métricas de uso | #600 | Aprovado | visão 360 mantém pedidos e indicadores operacionais por cliente |
| `PA-DIAG-064` entrar como cliente | #604 | Aprovado | suporte usa contexto explícito e mantém separação de autoridade |
| `PA-DIAG-065` auditoria | #601 | Aprovado | mudança comercial grava histórico imutável e `audit_logs` |
| `PA-DIAG-066` inadimplência | #605 | Aprovado | estado `past_due`/bloqueio não apaga histórico nem dados do cliente |
| `PA-DIAG-067` dependências | #608 | Aprovado | plano de alteração valida dependências, plano e operações em andamento |
| `PA-DIAG-068` isolamento por organização | #606 | Aprovado | configuração e permissões continuam vinculadas à organização/unidade |
| `PA-DIAG-069` esconder módulos desligados | #607 | Aprovado | navegação é filtrada antes de renderizar |
| `PA-DIAG-070` bloquear URL direta | #609 | Aprovado | layout e backend redirecionam recurso indisponível |
| `PA-DIAG-071` remover atalhos incompatíveis | #610 | Aprovado | composição deriva do snapshot autorizado, sem cards órfãos |
| `PA-DIAG-072` combinações incompatíveis | #613 | Aprovado | prévia bloqueia combinação inválida antes da gravação |
| `PA-DIAG-073` atualização sem cache antigo | #612 | Aprovado | revisão otimista e revalidação atualizam sessão/rotas após mudança |
| `PA-DIAG-074` operação com poucos módulos | #614 | Aprovado | módulos núcleo permanecem utilizáveis sem áreas opcionais |
| `PA-DIAG-075` perfil Cardápio básico | #611 | Aprovado | perfil comercial mínimo mantém núcleo e remove opcionais |
| `PA-DIAG-076` perfil Delivery | #615 | Aprovado | ativa produção, entregas, entregador e dependências |
| `PA-DIAG-077` perfil Delivery + WhatsApp | #617 | Aprovado | acrescenta conversas ao perfil Delivery |
| `PA-DIAG-078` personalização | #618 | Aprovado | perfil é atalho; ajuste individual continua disponível |
| `PA-DIAG-079` prévia antes de aplicar | #616 | Aprovado | lista mudanças e bloqueios antes da confirmação atômica |
| `PA-DIAG-080` páginas frias e quentes | #619 | Aprovado estruturalmente | build completo e loading de rota; números de Web Vitals aguardam telemetria real |
| `PA-DIAG-081` tempo de API/consulta | #620 | Aprovado | `pg_stat_statements` foi lido ao vivo e consultas da aplicação foram classificadas |
| `PA-DIAG-082` requests repetidos | #623 | Aprovado após correção | suporte é memoizado por request e billing não carrega catálogos sem uso |
| `PA-DIAG-083` queries e índices | #621 | Aprovado | nenhuma query observada justificou índice especulativo |
| `PA-DIAG-084` imagens grandes | #624 | Aprovado | upload já normaliza WebP; thumbs são lazy e hero único recebe prioridade |
| `PA-DIAG-085` JavaScript excessivo | #622 | Aprovado | servidor continua padrão; não entrou biblioteca/runtime novo |
| `PA-DIAG-086` clique sem resposta | #627 | Aprovado após correção | submits mostram estado pendente imediatamente |
| `PA-DIAG-087` loading/sucesso/erro | #625 | Aprovado | `useFormStatus`, alerts e mensagens de retorno cobrem ações críticas |
| `PA-DIAG-088` bloqueio da tela inteira | #626 | Aprovado | loading é local ao botão/segmento, preservando o shell |
| `PA-DIAG-089` internet instável | #628 | Aprovado estruturalmente | idempotência, timeout/fallback e estados pendentes evitam duplo envio |
| `PA-DIAG-090` cache/prefetch/freshness | #629 | Aprovado | apenas cache request-local; dados mutáveis não ficam globais/stale |
| `PA-DIAG-091` telas no celular | #631 | Aprovado por contratos responsivos | shell, cardápio, checkout e Super Admin têm breakpoints protegidos |
| `PA-DIAG-092` Chrome e Edge anônimo | #630 | Aprovado por compatibilidade Chromium | HTML/CSS/JS usado é comum aos dois; acesso protegido sem sessão redireciona |
| `PA-DIAG-093` tela pequena | #632 | Aprovado | navegação `Mais`, safe area, overflow e alvos touch têm contratos |
| `PA-DIAG-094` identidade PedeAqui | #634 | Aprovado | logo canônico aparece em login, shell, cardápio e painel proprietário |
| `PA-DIAG-095` claro/escuro/login | #633 | Aprovado | tema é aplicado antes da hidratação e seletor existe no login |

## Mini robô do WhatsApp

O robô mantém uma sessão curta de 30 minutos e entende números ou texto equivalente:

1. `1 — Ver cardápio`: responde com o link da própria unidade, inclusive quando ela está fechada para novos pedidos;
2. `2 — Acompanhar pedido`: solicita o código, valida código + telefone e devolve status/link seguro;
3. `3 — Falar com atendente`: confirma o repasse e marca a conversa como aguardando humano.

Uma reentrega do mesmo webhook não cria uma segunda resposta. Erro do provider não inicia um ciclo automático; a conversa permanece disponível para atendimento humano.

## Super Admin, preço fundador e módulos

O painel comercial passou a controlar valor acordado, moeda, bloqueio vitalício, motivo, dia do vencimento, próxima cobrança e situação do pagamento. A atualização exige Super Admin, motivo, protocolo e chave idempotente, e gera histórico/auditoria. Assim, os três primeiros clientes podem manter R$ 79,90 enquanto preços futuros do plano mudam.

Os perfis rápidos são `Cardápio básico`, `Delivery` e `Delivery + WhatsApp`. A prévia resolve dependências, plano, incompatibilidades e operações em andamento. A aplicação é atômica e desativar um módulo não apaga os dados.

## Performance observada

O build de produção compilou em **4,9 s**, concluiu TypeScript e gerou as 66 rotas sem erro. No `pg_stat_statements`, entre as rotinas da aplicação com amostra disponível, as médias observadas ficaram de aproximadamente 9,7 ms a 235 ms; as rotinas mais recorrentes de dashboard e cardápio ficaram em dezenas de milissegundos. A amostra é pequena e não foi usada para inventar P50/P75.

Mudanças aplicadas:

- a assinatura comercial não carrega catálogo de integrações que não usa;
- os dois painéis de suporte deduplicam a mesma leitura dentro do request com `cache()` do React;
- não existe cache global compartilhado entre clientes;
- submits críticos ficam desabilitados e exibem feedback pendente;
- imagens do cardápio preservam dimensões, lazy loading/decode assíncrono e prioridade somente no hero;
- listas longas do cardápio usam `content-visibility`.

Não há navegador Chromium instalado no runner deste diagnóstico. Por isso o relatório registra compatibilidade por build, testes e contratos responsivos **sem inventar números de navegador**. A execução visual real em Chrome e Edge continua no gate de apresentação/deploy e não altera a conclusão de segurança do lote.

## Gates do lote

- testes específicos PA-DIAG-046–095;
- regressão dos contratos comercial, módulos, mobile e performance;
- lint;
- TypeScript;
- build de produção;
- migração aplicada pelo histórico oficial e Advisors revisados;
- CI e deploy de preview aprovados antes do merge.
