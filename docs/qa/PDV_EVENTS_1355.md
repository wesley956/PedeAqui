# Modo Eventos — #1355

Implementação nativa/opcional para todas as organizações. A aba Eventos carrega seu código e dados ao primeiro acesso; a venda normal continua montada ao alternar as abas. Usa o mesmo `PosShell`, diálogo, catálogo, botões, cores, tamanhos e tokens de identidade do PDV.

## Operação

1. Na aba Eventos, use **+ Novo evento**. Informe nome, datas/horários da unidade, produtos finais e quantidades.
2. Responda se a loja abrirá normalmente. Caso feche, informe motivo e período dentro do evento. O rascunho ainda não fecha a loja.
3. Ative e confirme o comportamento da loja. Dentro do período, **Vender neste evento** usa um carrinho e chave de tentativa próprios.
4. Reponha quantidades ou encerre/cancele o evento. O relatório é um recorte dos pedidos reais, sem criar outro lançamento financeiro. As sobras são a quantidade alocada menos as vendas líquidas de cancelamentos.

O operador precisa de `orders.create` para consultar/vender. Gerenciamento exige também `stores.manage`; o relatório exige `finance.reports`. Todas as mutações derivam organização/unidade da sessão, nunca de campos enviados pelo navegador. Tabelas têm RLS e nenhum acesso direto por anon/authenticated. RPCs internas são exclusivas do servidor.

## Garantias do banco

- Um lock com limite de cinco segundos por evento serializa estoque, reposição, encerramento e cancelamento. Quantidades de um mesmo produto em linhas distintas são somadas antes da baixa.
- A venda usa a transação atual de pedido/pagamentos. Falha de pagamento desfaz toda a baixa. A repetição da chave retorna o mesmo pedido sem novo débito, e rejeita payload alterado.
- Reposição e outras operações têm registro idempotente. Cancelar/rejeitar um pedido devolve uma única vez o estoque do evento.
- Produtos acabados do evento não sofrem outra baixa de ingredientes do estoque normal ao concluir o pedido. Vendas comuns continuam usando a função de consumo original, acrescida apenas da verificação por pedido associado a evento.
- O fechamento é uma sobreposição por período, sem modificar status, horário, pausa manual ou configurações de loja. Expirar/encerrar remove somente essa sobreposição; outros eventos/pausas/horários continuam valendo.
- O cardápio/produto/carrinho e o robô consultam o fechamento. Um trigger também bloqueia INSERT de novos pedidos de cardápio/WhatsApp, protegendo abas antigas. Atualização/pagamento de pedidos existentes continua possível; o atendimento humano tem precedência.

## Validação e limites

`artifacts/pdv-1355/postgres-results.json` registra a execução com PostgreSQL 17.6 descartável, esquema canônico 01–61, RPC atual de PDV e migration nova, sem contas/dados/credenciais de produção. Inclui concorrência na última unidade, retry, cancelamento, reposição, organização/unidade divergente, rollback de pagamento, fechamento e expiração, não duplicação financeira, estoque normal e negação aos papéis do navegador.

Testes Vitest cobrem o estado operacional antes/durante/depois, fuso da loja, motivo obrigatório, escopo/permissões, saudação de fechamento e precedência humana. A suíte geral e o build Next/Turbopack são os gates de regressão.

O harness `scripts/browser-pdv-events.mjs` usa os componentes reais e transportes simulados, em 390/1366 px. Verifica retry de criação após resposta perdida, ativação, limite de estoque, dois submits, reposição, relatório, encerramento e preservação do carrinho normal. A prova padrão exige texto visível. `PDV_BROWSER_DOM_ONLY=1` serve apenas para ambientes sem renderização de fontes e não constitui aprovação visual. O workflow dedicado preserva screenshots/JSON e não usa essa exceção.

A prova de PostgreSQL é focada no núcleo de pedidos/PDV, não reproduz todos os schedulers/extensões de um projeto Supabase hospedado. A homologação de publicação deve ainda executar a migration contra um ambiente Supabase descartável com o histórico completo e revisar os advisors. Não foram alterados dados ou configurações de produção.

O Browser Homologation usa um Supabase descartável no próprio runner, com o esquema canônico completo (incluindo `235_pdv_events.sql`) e duas lojas fictícias. Não usa mais o projeto hospedado com uma chave administrativa fictícia, combinação que impedia a consulta de fechamento. As páginas reais do build verificam loja independente aberta, motivo do evento, compra bloqueada, reabertura ao encerrar/expirar e preservação de pausa manual. O stack é destruído ao final; o teste recusa endereços de banco fora do loopback.

## Publicação e retorno

Branches independentes para #1355 e #1356. Não fazer merge/deploy automático. Aplicar a migration `20261126140000_pdv_events.sql` em homologação **antes** de publicar o código que consulta seu fechamento. Validar os cenários no ambiente completo e aprovar a publicação. O equivalente canônico é `235_pdv_events.sql`; não aplicar os dois no mesmo banco.

Em retorno de aplicação, o código anterior ignora as tabelas novas, mas o trigger de fechamento permanece ativo. Antes de voltar, encerrar/cancelar qualquer evento que esteja suspendendo a loja e conferir pedidos; não apagar tabelas nem seus registros financeiros. A migration não remove nem reescreve dados existentes.
