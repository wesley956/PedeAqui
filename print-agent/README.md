# PedeAqui Print Agent

Agente local do PedeAqui. Ele roda no computador da unidade, busca jobs da fila persistente e envia ESC/POS para impressoras locais.

## Suporte atual

- Node.js 22+
- impressoras ESC/POS de rede via TCP/IP
- impressoras térmicas USB instaladas no Windows, usando o spooler RAW do próprio Windows
- 58 mm e 80 mm
- claim com lease no servidor
- spool local antes da impressão
- ACK após impressão
- recuperação de `printed_unacked` sem reimprimir
- heartbeat do agente e das impressoras
- teste periódico de conectividade

Para impressora de rede, cadastre o IP e normalmente a porta `9100`.

Para USB/Windows, primeiro instale a impressora normalmente em **Configurações > Bluetooth e dispositivos > Impressoras e scanners**. No PedeAqui escolha **USB / instalada no Windows** e informe exatamente o nome exibido pelo Windows. O Print Agent envia o ESC/POS em modo RAW, sem transformar o pedido em página gráfica.

## Configuração

```bash
PEDEAQUI_URL=https://seu-dominio.example \
PEDEAQUI_PRINT_AGENT_TOKEN=token_exibido_uma_unica_vez \
npm start
```

No PowerShell do Windows, as mesmas variáveis podem ser definidas assim:

```powershell
$env:PEDEAQUI_URL="https://seu-dominio.example"
$env:PEDEAQUI_PRINT_AGENT_TOKEN="token_exibido_uma_unica_vez"
npm start
```

O token é uma credencial específica do agente. **Nunca** configure `SUPABASE_SERVICE_ROLE_KEY` neste processo.

Variáveis opcionais:

- `PEDEAQUI_PRINT_POLL_MS` (padrão 2000)
- `PEDEAQUI_PRINT_HEARTBEAT_MS` (padrão 15000)
- `PEDEAQUI_PRINT_SPOOL` (diretório do spool)

O heartbeat consulta `/api/print-agent/config`, testa as impressoras atribuídas e reporta `online`/`offline`. Bluetooth continua fora do transporte atual e permanece como capacidade futura, sem simular teste de hardware.

## Limite de exatamente-uma-vez

A fila e a geração dos jobs são idempotentes. Porém uma impressora física não oferece confirmação transacional com o banco: se o processo cair no intervalo exato entre a impressora aceitar os bytes e o agente registrar `printed_unacked`, uma nova tentativa pode gerar uma via duplicada. O spool reduz essa janela, mas a entrega física deve ser tratada como **at-least-once**. Reimpressões manuais continuam marcadas e auditadas.
