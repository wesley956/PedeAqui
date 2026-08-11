# PedeAqui Print Agent

Agente local do bloco [077]–[081]. Ele roda no computador da unidade, busca jobs da fila persistente e envia ESC/POS para impressoras locais.

## MVP

- Node.js 22+
- claim com lease no servidor
- spool local antes da impressão
- ACK após impressão
- recuperação de `printed_unacked` sem reimprimir
- heartbeat de agente/impressoras
- consulta da configuração atribuída ao agente
- teste periódico de conectividade TCP das impressoras de rede, mesmo com fila vazia
- transporte TCP para impressoras ESC/POS de rede
- CP850 básico para caracteres pt-BR
- 58 mm e 80 mm

## Configuração

```bash
PEDEAQUI_URL=https://seu-dominio.example \
PEDEAQUI_PRINT_AGENT_TOKEN=token_exibido_uma_unica_vez \
npm start
```

O token é uma credencial específica do agente. **Nunca** configure `SUPABASE_SERVICE_ROLE_KEY` neste processo.

Variáveis opcionais:

- `PEDEAQUI_PRINT_POLL_MS` (padrão 2000)
- `PEDEAQUI_PRINT_HEARTBEAT_MS` (padrão 15000)
- `PEDEAQUI_PRINT_SPOOL` (diretório do spool)

O heartbeat consulta `/api/print-agent/config`, testa a porta das impressoras TCP atribuídas e reporta `online`/`offline`. Conexões ainda não suportadas pelo MVP ficam `unknown`, sem fingir que houve teste de hardware.

## Limite de exatamente-uma-vez

A fila e a geração dos jobs são idempotentes. Porém uma impressora física não oferece confirmação transacional com o banco: se o processo cair no intervalo exato entre a impressora aceitar os bytes e o agente registrar `printed_unacked`, uma nova tentativa pode gerar uma via duplicada. O spool reduz essa janela, mas a entrega física deve ser tratada como **at-least-once**. Reimpressões manuais continuam marcadas e auditadas.

USB, Bluetooth e spool do sistema ficam atrás do mesmo contrato e podem ser adicionados sem alterar pedidos ou `print_jobs`.
