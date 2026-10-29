# Diagnóstico sob demanda e piloto no notebook — 29/10/2026

Wesley pediu atualização automática com relatório remoto, coletado somente quando solicitado. Autorizou também instalar/testar no notebook dele antes de envolver a Dona Maria. A instalação local exige que ele execute o pacote: este ambiente não controla programas do Windows do usuário.

## Comportamento implementado

- Botão por computador em Configurações → Impressões, protegido por `printing.manage`. O servidor fixa organização, loja e solicitante; identificadores enviados pelo navegador não definem o escopo de autorização.
- Solicitação persistida, com autor, intenção idempotente, validade de sete dias, cancelamento e uma pendência por agente. Cliques repetidos reutilizam a pendência; novas coletas têm intervalo mínimo de um minuto.
- Comando entregue na resposta do heartbeat existente: nenhum timer, endpoint de consulta ou geração automática de relatórios foi acrescentado ao agente. A RPC de heartbeat é substituída por uma RPC que também faz uma leitura indexada das solicitações. Há esse pequeno trabalho adicional no banco; não se afirma custo zero.
- Sem solicitação válida: nenhum processo PowerShell de diagnóstico, relatório local ou upload. A descoberta/saúde de impressoras e as consultas normais preexistentes do agente continuam funcionando.
- Coleta fixa, somente leitura, em etapas independentes, com PowerShell não interativo e limite de oito segundos por etapa. Falha/acesso negado/timeout são resultados parciais; não são convertidos em sucesso.
- Resultados permitidos: versão, plataforma, tempo ligado/memória, possibilidade de gravação, tarefa/boot/login/bateria/conta de serviço, número de processos, Spooler, contagens de Epson/erros/documentos Windows, suspensão configurada, HTTP público e autenticação de configuração. Não contém nomes de clientes, pedidos, documentos, nomes de usuário, caminhos, chaves, linhas de comando ou logs brutos.
- Endpoint de resultado autenticado pelo agente, leitura do corpo limitada a 32 KiB, contrato fechado, checagem do agente/loja no banco e preservação do primeiro relatório aceito. Chaves desconhecidas são descartadas antes da gravação.
- Estado local gravado antes da coleta, resultado sincronizado no disco antes do envio, lock contra execução concorrente e isolamento por hash da URL/credencial. Reinício durante coleta gera relatório de interrupção; relatório já pronto é reenviado sem novas consultas. Reenvio com recuo de um a trinta minutos, aproveitando os heartbeats, até a validade da solicitação.
- Disco sem espaço/permissão: tenta enviar relatório mínimo dessa falha em memória, sem iniciar sondagens cujo resultado não poderia preservar. Se rede e gravação falharem juntas, só será possível receber informação depois da recuperação de pelo menos uma delas.
- Coleta/cancelamento não imprime, não limpa filas, não reinicia serviço e não instala driver. Cancelar impede a aceitação do resultado pendente; uma coleta já recebida pode terminar localmente.
- A tela só consulta resultados quando aberta/atualizada, sem novo polling de interface. Ausência de esquema ou erro de leitura aparece como indisponibilidade. Agentes antigos mantêm o heartbeat original; esquema novo indisponível desativa a entrega de comandos, preservando heartbeat/ impressão pelo caminho anterior.

## Atualização 0.8.0

Manifesto com SHA-256 de cada arquivo (exceto o próprio manifesto), limite de tamanho/tempo de download, validação de sintaxe e dependências relativas antes da ativação. Backup e journal precedem a substituição; falha de ativação restaura os arquivos anteriores. Startup posterior recupera transação interrompida antes de tentar nova atualização. Preserva journal/backup se restaurar falhar. Não faz downgrade; versão igual com arquivo ausente/alterado pode ser reparada.

Essas garantias pertencem ao **novo atualizador**, após ele chegar ao computador. O primeiro salto a partir da versão 0.7.3 ainda é executado pelo atualizador antigo, que copia arquivos sequencialmente. O manifesto põe dependências antes das entradas e a versão por último, mas isso não torna o código antigo transacional. Publicar na main pode disponibilizar a versão para outras lojas com atualização automática; a coleta continua exigindo uma solicitação explícita.

`node scripts/prepare-print-agent-release.mjs` prepara hashes e ordem. Os testes verificam os hashes para impedir publicação com manifesto desatualizado. O instalador assistido inclui todos os novos módulos.

## Piloto isolado do Wesley

Pacote `PedeAqui-Piloto-Windows-0.8.0.zip`: runtime oficial portátil Node.js 22.23.4 Windows x64 incluído, SHA-256 verificado contra SHASUMS256 oficial, licença incluída. Não requer instalação prévia de Node, direitos de administrador, tarefas, serviços ou login em uma loja. Copia somente para `%LOCALAPPDATA%\PedeAqui\DiagnosticoPiloto`, separado de `PrintAgent`.

1. Extrair todo o ZIP e abrir `Iniciar-Piloto.cmd`.
2. Verificar integridade da versão.
3. Simular falha de ativação/rollback e tentar atualização novamente, em pasta temporária.
4. Consultar Windows/Epson/rede somente leitura. Sem credencial produtiva; autenticação de produção permanece explicitamente não testada.
5. Confirmar que nenhum diagnóstico é coletado sem comando; executar uma coleta, perder a resposta do upload e reiniciar o controlador. Comparar os dois envios e comprovar coleta única. O destino de upload é HTTP em loopback, nunca o servidor da loja.
6. Executar o agente real contra HTTP/TCP locais: duas vias simuladas, primeira resposta de ACK perdida, recuperação e reinício sem novo envio de vias.
7. Encerrar processos e salvar `Relatorio-Piloto-PedeAqui.json` ao lado do launcher. O piloto deixa esse arquivo local; Wesley precisa anexá-lo. Isso não substitui o futuro envio autenticado do agente instalado.

O piloto não envia nada a uma Epson física e não usa fila, pedido ou token real. Requer Windows 64 bits compatível com o runtime; indisponibilidade de PowerShell ou restrições do Windows podem exigir intervenção local. Segurança do Windows/antivírus não é desativada.

## Situação real da Dona Maria consultada nesta execução

- Projeto correto identificado: `idyjinpeijyqcejnunwm`, saudável na consulta.
- `caixa 1` ativo, versão 0.7.3, capacidades `watchdog=true` e `selfUpdate=true`, última comunicação em 25/10 às 23h45 (Brasília).
- Supremo permanece desativado.
- Há **cinco documentos pendentes**, o mais antigo de 27/10 às 16h46 (Brasília). Nenhuma fila foi alterada. Antes de retomar a impressão, conferir com a equipe o que já foi atendido/impresso por outro meio. A nova versão não pode transformar esses documentos antigos em pedidos novos para a cozinha.

## Publicação, limitações e critérios

- O SQL canônico 234 e a migration criada pela CLI são aditivos; RLS ligada, sem acesso de browser roles e RPCs `SECURITY INVOKER`, `search_path` vazio, somente `service_role`. Não alteram a RPC legada de heartbeat.
- Aplicar/verificar esquema antes de habilitar a funcionalidade; comparar baseline de migrations antes de qualquer promoção e atualizar seu registro somente quando a migration realmente estiver aplicada.
- Executar CI Linux, testes e piloto isolado em Windows, build/TypeScript/lint e testes de interface. Depois conferir o relatório do notebook do Wesley. Não declarar que o notebook da loja recebeu a atualização sem novo heartbeat com a capacidade/versão correspondente.
- Credencial revogada, máquina desligada, inicialização impedida, runtime apagado, rede inacessível ou bloqueio de download podem impedir a primeira entrega. Não há acesso remoto universal nem canal sem autenticação para contornar esses casos.
- Atualização/diagnóstico não valida papel físico. A causa local do incidente #1291 e a validação da Epson/duas vias/equipe continuam abertas.
- Reversão da aplicação: reverter mudanças de interface/API e manter a tabela/RPCs aditivas inativas para não apagar evidências. Reversão de agente deve ser uma nova versão testada maior, pois o atualizador recusa downgrade. Não apagar spool nem substituir credenciais como parte da reversão.

## Evidências locais até a preparação do piloto

- Rodada geral: 469 arquivos / 3.085 testes aprovados; seis verificações Windows ignoradas neste Linux. Novos testes de interface/heartbeat adicionados depois dessa rodada: sete aprovados; conferir totais finais no CI.
- PostgreSQL isolado (PGlite): aplicação repetida do SQL, escopo de agente/loja, replay, cancelamento, expiração, limite de frequência, permissões de execução e RLS aprovados.
- Piloto local Linux: seis cenários aprovados, incluindo agente real com duas vias TCP simuladas e ACK perdido. As verificações Windows constam como não aplicáveis; não se apresenta esse resultado como teste do notebook Windows.
- Build e TypeScript aprovados; lint sem erros, com os oito avisos anteriores. Conferir nova rodada após qualquer alteração posterior.
