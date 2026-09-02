# PedeAqui Print Agent

Agente local do PedeAqui. Ele roda no computador da unidade, busca jobs da fila persistente e envia ESC/POS para impressoras locais.

## Instalação recomendada

Para o usuário da loja, a instalação normal deve ser feita pelo painel em **Configurações > Impressões**:

1. clicar em **Conectar este computador**;
2. baixar **Instalador assistido (Windows)**;
3. executar o arquivo no computador que ficará ligado junto à impressora;
4. voltar ao painel e clicar em **Atualizar impressoras**;
5. escolher **Usar esta impressora** e depois **Imprimir teste**.

O instalador assistido prepara o runtime quando necessário, baixa o Print Agent, configura a URL/credencial específica daquele computador e registra uma tarefa de boot executada pela conta restrita `LOCAL SERVICE`. O agente inicia antes do login, sem depender de navegador ou da sessão de um funcionário. O instalador só declara sucesso depois de validar a tarefa, o processo e a primeira comunicação autenticada com o PedeAqui.

A partir da versão 0.4.0 o instalador também prepara um **watchdog** local. Se o processo do Print Agent encerrar, ele é iniciado novamente após alguns segundos. O watchdog executa o atualizador antes de cada nova inicialização; o próprio agente verifica periodicamente se existe uma versão mais nova e solicita uma reinicialização segura quando não está no meio de uma impressão.

> O instalador atual é um instalador assistido `.cmd`, não um MSI/EXE assinado. O Windows pode pedir confirmação para executá-lo.

## Suporte atual

- Node.js 22+ como runtime interno
- impressoras ESC/POS de rede via TCP/IP
- impressoras térmicas USB instaladas no Windows, usando o spooler RAW do próprio Windows
- descoberta automática das impressoras instaladas no Windows
- 58 mm e 80 mm
- claim com lease no servidor
- spool local antes da impressão
- ACK após impressão
- recuperação de `printed_unacked` sem reimprimir
- timeout do comando RAW do Windows para impedir impressão eternamente presa em `processing`
- tentativa de reativar o serviço Spooler quando ele estiver parado e a conta do Windows tiver permissão
- limpeza isolada somente do trabalho do próprio PedeAqui após travamento; a fila de outros programas não é apagada
- watchdog do processo do agente
- atualização automática por manifesto versionado
- heartbeat do agente e das impressoras
- teste periódico de conectividade

Para USB/Windows, a impressora precisa estar instalada normalmente em **Configurações > Bluetooth e dispositivos > Impressoras e scanners**. O Print Agent passa a enviar a lista encontrada ao PedeAqui por meio do heartbeat autenticado; o painel pode então oferecer a escolha sem pedir que o operador digite o nome exato.

Para impressora de rede, o modo avançado continua aceitando IP e normalmente a porta `9100`.

## Recuperação automática no Windows

Cada trabalho RAW do PedeAqui recebe um nome exclusivo com o ID do job. Se o comando do Windows exceder o tempo máximo, o processo do PowerShell é interrompido e o agente tenta remover **somente** o trabalho correspondente ao PedeAqui daquela impressora. Depois a falha é devolvida à fila persistente do servidor, que aplica as novas tentativas normalmente.

O agente não limpa a fila inteira, não remove documentos de outros programas e não reinicia um Spooler que já esteja funcionando. Se o Spooler estiver parado, o agente tenta iniciá-lo. Em computadores onde a política do Windows não permite isso sem elevação, a falha fica registrada para suporte e as outras proteções continuam funcionando.

## Configuração manual / diagnóstico

Este modo existe para suporte técnico. No uso comum, prefira o instalador do painel.

```bash
PEDEAQUI_URL=https://seu-dominio.example \
PEDEAQUI_PRINT_AGENT_TOKEN=token_exibido_uma_unica_vez \
node src/index.mjs
```

No PowerShell do Windows:

```powershell
$env:PEDEAQUI_URL="https://seu-dominio.example"
$env:PEDEAQUI_PRINT_AGENT_TOKEN="token_exibido_uma_unica_vez"
node src/index.mjs
```

O token é uma credencial específica do agente. **Nunca** configure `SUPABASE_SERVICE_ROLE_KEY` neste processo.

Variáveis opcionais:

- `PEDEAQUI_PRINT_POLL_MS` (padrão 2000)
- `PEDEAQUI_PRINT_HEARTBEAT_MS` (padrão 15000)
- `PEDEAQUI_PRINT_UPDATE_CHECK_MS` (padrão 6 horas)
- `PEDEAQUI_PRINT_SPOOL` (diretório do spool)

O heartbeat consulta `/api/print-agent/config`, testa as impressoras atribuídas, descobre as impressoras instaladas no Windows e reporta `online`/`offline`. Bluetooth continua fora do transporte atual e permanece como capacidade futura, sem simular teste de hardware.

## Limite de exatamente-uma-vez

A fila e a geração dos jobs são idempotentes. Porém uma impressora física não oferece confirmação transacional com o banco: se o processo cair no intervalo exato entre a impressora aceitar os bytes e o agente registrar `printed_unacked`, uma nova tentativa pode gerar uma via duplicada. O spool reduz essa janela, mas a entrega física deve ser tratada como **at-least-once**. Reimpressões manuais continuam marcadas e auditadas.
