# PDV — investigação e correção #1356

A versão-base `5927384` atualiza a rota inteira em `HumanAttentionAlert` após alterações em conversas, reconexão, retorno de aba e rede. O componente pertence ao layout global. Assim, uma conversa pode provocar nova execução do layout e da carga de catálogo do PDV enquanto o operador monta uma venda. É uma causa global demonstrável de trabalho desnecessário; não é evidência suficiente para atribuir todos os incidentes do Jack a essa causa.

O aviso agora consulta um GET privado, autorizado por `conversations.view`, limitado à organização/unidade da sessão, sem cache e sem `router.refresh`. Há agrupamento de eventos, apenas uma consulta em voo, reconciliação depois de mudanças durante uma consulta, aborto após dez segundos e limpeza na troca de unidade/desmontagem. Uma consulta de segurança por minuto mantém a recuperação mesmo sem realtime. Erros preservam o último aviso conhecido.

O PDV, seus pagamentos e sua transação não foram alterados nesta branch. A identidade do aviso também permanece a mesma.

## Evidências

- Testes de autorização, unidade divergente, organização/unidade, não exposição de erros e cache no GET.
- Testes existentes de PDV, modalidades, quatro formas de pagamento, pagamentos mistos e troco.
- Harness de navegador com os componentes reais e transportes simulados: 250 produtos; 390 e 1366 px; 200 eventos em rajada; eventos durante consulta lenta; dois envios consecutivos; conservação da venda; nenhuma chamada de refresh global no código corrigido.
- Comparação com o componente original: cinco eventos espaçados provocam cinco refreshes; a versão corrigida não recarrega a página. As latências registradas no JSON são de quadros do navegador, não da VPS/API de produção.
- Build Next/Turbopack local com configurações inertes. Nenhuma credencial ou requisição de produção nos testes.

Execute `node scripts/browser-pdv-performance.mjs` após instalar Playwright/Chromium. O workflow dedicado executa a prova padrão e preserva screenshots/JSON. `PDV_BROWSER_DOM_ONLY=1` permite verificar o DOM em ambientes cujo Chromium não renderiza fontes; essa execução não aprova a aparência. O workflow não usa essa exceção.

## Limites e publicação

A issue registrou uma consulta pontual sem locks/deadlocks no PostgreSQL. Não há nesta entrega correlação com horário de um travamento real, perfil de CPU/RAM da VPS, reinício/OOM, rede do cliente ou sua Epson. Esses fatores continuam como hipóteses abertas. Não afirmar que o problema de produção está integralmente resolvido com esta mudança.

Sem merge, deploy, carga ou escrita em produção. Publicação depende de revisão dos checks e autorização. Depois de publicar, correlacionar qualquer novo incidente com horário, etapa do PDV, método de pagamento e estado da impressão para confirmar o resultado no cliente.
