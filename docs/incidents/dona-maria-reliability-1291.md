# Dona Maria — confiabilidade de compra e impressão

## Atualização de escopo em 29/10/2026
O diagnóstico sob demanda, atualização 0.8.0, piloto isolado no notebook do Wesley e os limites de distribuição estão registrados em [print-agent-diagnostics-on-demand-20261029.md](print-agent-diagnostics-on-demand-20261029.md). As seções abaixo documentam a preparação anterior de 27/10; afirmações de “sem migração/sem alteração de runtime” referem-se àquele lote anterior.

Referência: #1291. Investigação iniciada em 27/10/2026, horários de Brasília. Baseline: `dec10c3b58189488e9a74a82d996f71928a0bdfa`.

## Resultado e limites

O pedido #203 está salvo e o job de duas vias foi gerado corretamente. Nas consultas até 19h51, o agente caixa 1 continuava sem comunicação desde 25/10 às 23h45; o job permanecia pendente, com zero tentativas. A interrupção ocorre antes de o agente buscar o trabalho. Os registros do servidor não permitem distinguir programa parado, tarefa desativada, suspensão, conectividade ou autenticação local.

A reclamação das 19h32 sobre voltar para confirmar não foi correlacionada com uma pessoa específica. Uma sessão de entrega foi iniciada às 19h29 e atualizada às 19h30, sem pagamento, revisão ou pedido associado na consulta inicial. Isso não prova falha do servidor ou abandono voluntário. O site e o cardápio responderam HTTP 200 às 19h34. Às 19h51, apenas o #203 constava como pedido do dia nessa unidade. Não houve criação de pedido de QA, pagamento, mensagem ou impressão física nesta execução.

## Achados e decisões

| Achado | Evidência | Decisão | Limitação |
|---|---|---|---|
| Agente sem comunicação | Heartbeat antigo; job pendente sem claim | Diagnóstico local somente leitura e orientação para equipe | Causa local ainda não confirmada |
| Reenvio do Expresso tenta salvar carrinho convertido antes de recuperar pedido | Teste de resposta perdida falhou na baseline com `cart_empty` | Recuperar pedido pelo token opaco antes de salvar; mostrar número ao atualizar checkout finalizado | Correção de um defeito reproduzido, sem afirmar ser a causa da reclamação |
| Total não informado era convertido em zero | `Number('')` e regressão com pedido de total zero | Exigir total explicitamente informado e inteiro seguro | Caso de borda; não observado no pedido real |
| Botão inicial sugere envio antes de cálculo | Total ainda desconhecido exige segunda confirmação por segurança | Mostrar “Calcular total e revisar” e explicar que o pedido ainda não foi enviado | Preservada a confirmação do valor final no servidor |
| Falha de transporte do contexto de notificação pode interromper resposta após commit | Chamada aguardada após criação; teste de exceção | Manter tracking/cookie/redirecionamento mesmo se esse transporte falhar | Entrega de WhatsApp continua sujeita ao worker/integração |
| Verificação antiga pode confiar em outro agente conectado | Conferência geral usa qualquer agente online | Conferir agente de cada impressora com rota ativa, idade do heartbeat e fila | Não certifica papel físico; filas Windows e falhas mecânicas exigem inspeção |
| Saúde do topo não possui consulta periódica própria de impressão | Snapshot recebido do servidor; Realtime acompanha pedidos | Leitura estreita a cada minuto, só com aba visível e permissão; aviso de consulta indisponível | Não é monitoramento com navegador fechado |
| Sem telemetria de checkout no período | Apenas eventos de conexão do painel recuperados | Log sanitizado por índice da etapa e código de validação/erro | Não reconstrói retroativamente a tentativa das 19h29 |

## O que foi preparado no código

1. Recuperação de pedido existente antes de qualquer gravação do Expresso. A consulta continua vinculada ao hash do token do carrinho, organização e unidade; não há busca por telefone ou número público. A página de recuperação exibe número e ação para abrir o acompanhamento, sem serializar token de tracking.
2. Proteção da resposta de sucesso contra exceção de transporte do contexto WhatsApp. Não marca pagamento, não inventa sucesso antes do commit e mantém os mecanismos canônicos de outbox/cobrança.
3. Separação textual entre cálculo/revisão e confirmação de envio, mantendo revalidação de total no servidor.
4. `GET /api/printing/health`, autorizado por `printing.view`, sem parâmetro de loja escolhido pelo cliente, resposta privada sem cache, sem operações de fila. Quatro leituras filtradas: agentes ativos, impressoras ativas, até 20 trabalhos pendentes/processando/falhos mais antigos e rotas ativas. Impressoras sem rota não geram aviso de hardware por si só.
5. Atualização da seção de impressão no indicador global. Uma única consulta em andamento, timeout de 10 segundos, cancelamento ao desmontar/trocar unidade, verificação ao voltar à aba/rede e rejeição de resposta de outra unidade ou malformada. Uma consulta malsucedida vira “não foi possível conferir”, nunca um resultado vazio saudável.
6. Som específico opcional de duas notas, ativado/testado por clique. Um aviso por mudança de incidente, sem repetição a cada poll; recuperação limpa o incidente. O navegador pode bloquear áudio; o aviso visual permanece. Não é alarme nativo com navegador fechado.
7. Botão de diagnóstico na página de Impressões e instrução de contingência usando o pedido já salvo no painel.

### Custo e privacidade

O monitor roda somente para operador autorizado, impressão configurada e aba visível: no máximo uma chamada por minuto por aba, além das conferências ao retomar foco/rede; chamadas simultâneas são coalescidas. Em 12 horas continuamente visíveis, o timer produz aproximadamente 720 requisições/2.880 leituras pequenas, além da autenticação. Não houve contratação de serviço ou ativação de envio externo. Medir o impacto após piloto; isso não é promessa de custo mensal fixo.

Não são enviados ao navegador tokens do agente, endereços de impressoras ou erros brutos do banco. Logs novos têm slug público, índice da etapa e código sanitizado; não incluem nome, telefone, endereço, valores do formulário ou credenciais. Permissões existentes são preservadas; confirmar que as funcionárias possuem a permissão apropriada, sem concessão automática nesta alteração.

## Diagnóstico no notebook

Após publicação desta versão, abrir Configurações → Impressões e usar “Baixar diagnóstico do computador”. Executar o CMD no computador conectado à Epson, fotografar o resumo e enviar ao suporte.

O arquivo apenas consulta:

- quantidade de instalações padrão encontradas e processos do agente;
- estado/último resultado da tarefa “PedeAqui Impressao”;
- restrições da tarefa ao iniciar/continuar na bateria;
- estado do Spooler e informações de erro/offline das impressoras Epson;
- resposta HTTP do site;
- versão instalada e presença de credencial;
- autenticação de leitura em `/api/print-agent/config`, somente se o endereço configurado corresponder ao servidor esperado.

Ele não instala, não eleva privilégio, não encerra processos, não inicia/repara serviços, não troca credencial, não imprime, não confirma heartbeat e não apaga spool. O token é lido apenas na memória local para a chamada autenticada e não faz parte do relatório. O launcher lê seu payload do próprio arquivo para respeitar o limite de tamanho de comando do Windows, inclusive quando a pasta contém espaços.

Interpretação para suporte:

| Resultado | Próxima investigação |
|---|---|
| Nenhum processo do agente | Tarefa, launcher, bloqueio do Windows e instalação real |
| Mais de um processo | Instalação duplicada/legada; não encerrar cegamente |
| Tarefa ausente/desabilitada ou último resultado com erro | Verificar configuração e usuário de execução antes de reparar |
| Restrição de bateria ativa | Conferir tarefa instalada; não alterar energia global por suposição |
| Site sem resposta | Internet, DNS/TLS e conexão daquele computador |
| Site responde; autenticação 401/403 | Agente desativado ou credencial inválida; reconciliar identidade antes de reconectar |
| Autenticação 200; nenhum destino | Vínculo/rota da impressora correta |
| Autenticação 200; processo ativo; heartbeat continua antigo | Logs locais, processo/instalação concorrente ou loop interno |
| Epson offline/Spooler parado | Conexão, driver, papel e serviço local |

Se a instalação estiver em um caminho legado não padrão, o resumo informa a ausência nos caminhos padrão, mas pode detectar o processo. Esse caso exige identificar a instalação real sem compartilhar `run.cmd` ou a chave. O diagnóstico não declara “reparo concluído”.

## Decisão sobre inicialização e atualização

A versão vigente usa tarefa agendada, VBS/CMD e watchdog. O VBS pode encerrar depois de iniciar o processo filho; o estado da tarefa sozinho não prova que o agente continuou vivo. O atualizador copia arquivos sequencialmente e não equivale a instalação atômica com rollback comprovado. A ausência de heartbeat não autoriza concluir qual desses mecanismos falhou na Dona Maria.

Não foi alterado o runtime/manifesto 0.7.3 nem substituída a instalação da loja. Não usar cegamente o reparador legado nem integrar #1091/#1277 para tentar resolver este incidente. O gate #1090 de boot, single-instance, spool/ACK e rollback físico permanece aplicável. Primeiro obter diagnóstico local; depois preparar o reparo específico e validar de forma reversível.

## Roteiro curto para quem fica na loja

1. Pedido sem papel: abrir o pedido no painel, conferir número/itens e avisar a cozinha. Não pedir ao cliente para refazer uma compra já registrada.
2. Abrir o aviso de impressão no topo e conferir a orientação. A opção de som exige ativação/teste no navegador.
3. Conferir papel e energia da Epson, energia do notebook e internet.
4. Se continuar: abrir Impressões, executar o diagnóstico e chamar o suporte com o resumo e o número do pedido.
5. Antes de reimprimir, confirmar se alguma via já saiu. Não cancelar o pedido nem marcar impressão/pagamento como concluídos para esconder o problema.

## Matriz para liberar a operação antes da viagem

| Cenário | Evidência necessária | Estado desta execução |
|---|---|---|
| Checkout com total alterado/ausente | Servidor exige revisão, sem criar pedido prematuro | Testes de comportamento aprovados |
| Resposta perdida após criação | Recupera mesmo pedido/número, sem regravar carrinho convertido | Regressão reproduzida e corrigida |
| Atualizar checkout convertido | Número visível e acesso sem expor token | Teste de renderização aprovado |
| Exceção pós-commit de contexto WhatsApp | Tracking/redirecionamento preservados | Teste aprovado |
| Agente online antigo/outro computador online | Destino correto continua em atenção | Testes aprovados |
| API sem permissão/loja/erro de leitura | Bloqueio/estado indisponível, sem dados de outras lojas | Testes aprovados |
| Consulta malformada ou de outra unidade | Rejeita atualização | Testes aprovados |
| Sintaxe e execução do CMD de diagnóstico | Fixture isolada Windows via CI | Pendente até CI Windows |
| Interface mobile/desktop hidratada, clique e áudio | Navegador real com ações simuladas | Pendente: Chromium ausente e download inválido neste ambiente |
| Boot sem login, logout, crash, bateria/suspensão | Evidência no notebook Windows | Pendente físico |
| Internet cai/volta, Epson offline/volta | Retoma fila com destino/vias corretos | Pendente físico |
| Duas vias e ACK perdido/printed_unacked | Papel real e recuperação sem repetir entrega já reportada | Pendente físico; invariantes existentes preservados |
| Funcionárias identificam/agem sem o responsável | Ensaio acompanhado com roteiro | Pendente operacional |

## Validação e reversão

A rodada ampla final local aprovou 465 arquivos/3.050 testes, com três testes exclusivamente Windows ignorados. Foram acrescentados testes de payload malformado e configuração sem rota ativa. Lint: zero erros e oito avisos preexistentes. TypeScript e build Next.js passaram com ambiente de CI fictício, sem acesso a dados produtivos no build. Integridade de rotas e `git diff --check` passaram.

Não houve homologação visual: a tentativa de iniciar Chromium falhou por executável ausente e a instalação retornou pacote inválido. Não apresentar testes de renderização como prova de navegador hidratado. O CI Windows verifica apenas fixture isolada, não certifica a Epson do cliente. O script `scripts/browser-order-print-reliability.mjs` foi adicionado ao Browser Homologation: componentes reais, ações comerciais e Realtime simulados, tráfego externo bloqueado, larguras de 390 e 1366 px, revisão/confirmação, campo digitado preservado, aviso de impressão, opção de som e remoção do aviso após recuperação. A execução remota e seus resultados devem ser conferidos antes de considerar essa etapa aprovada.

Reversão: reverter o commit/PR destas mudanças de aplicação. Não há migração nem configuração produtiva a desfazer; jobs existentes permanecem na fila e a instalação 0.7.3 não é alterada. O runtime antigo não depende da nova rota de leitura. Após qualquer publicação, conferir site/checkout, avisos, autorização e filas sem gerar pedidos produtivos de QA. A investigação #1291 só pode ser encerrada após os itens físicos e operacionais necessários.
