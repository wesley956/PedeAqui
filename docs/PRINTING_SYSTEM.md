# Cruz — Subsistema Profissional de Impressão

A impressão é parte estrutural da operação. O sistema deve funcionar em estabelecimentos que utilizam somente impressão, somente KDS ou KDS + impressão simultaneamente.

## 1. Arquitetura

`Pedido/Eventos → PrintService → PrintRoutingService → print_jobs → Print Agent/driver → Impressora`

Não usar `window.print()` como solução operacional principal.

## 2. Tipos de documentos

### Produção
- cozinha;
- chapa;
- fritura;
- pizzaria;
- bar;
- sobremesas;
- expedição.

### Atendimento/caixa
- pedido;
- pré-conta;
- comanda;
- balcão;
- comprovante;
- fechamento;
- sangria;
- suprimento.

### Evoluções
- NFC-e/DANFE;
- etiquetas;
- QR Code;
- etiquetas de embalagem/entrega.

## 3. Entidades

### `printers`
Campos principais:
- `id`
- `organization_id`
- `store_id`
- `name`
- `connection_type`
- `address`
- `port`
- `paper_width`
- `status`
- `active`
- `copies`
- `fallback_printer_id`
- timestamps.

Tipos previstos: `network`, `usb`, `bluetooth`, `system`, `cloud_agent`.

Prioridade inicial: rede + agente local.

### `production_stations`
Exemplos: cozinha, chapa, fritura, bar, sobremesas, expedição.

### `station_printers`
Relaciona estação a uma ou mais impressoras.

### `product_production_stations`
Roteia produtos/itens para estações.

### `print_jobs`
Campos:
- `id`
- `organization_id`
- `store_id`
- `printer_id`
- `station_id`
- `order_id`
- `document_type`
- `payload`
- `rendered_content`
- `status`
- `attempts`
- `idempotency_key`
- `created_at`
- `processing_at`
- `printed_at`
- `failed_at`
- `error_message`.

Status: `pending`, `processing`, `printed`, `failed`, `cancelled`.

## 4. Roteamento

Pedido:
- 2 X-Bacon → chapa;
- 1 batata → fritura;
- 2 Coca → bar;
- ticket completo → expedição.

Cada estação recebe apenas o conteúdo necessário. O ticket de cozinha não deve expor lucro ou informação financeira desnecessária.

## 5. Gatilhos configuráveis

Estabelecimento poderá configurar impressão automática em:
- recebimento;
- confirmação;
- pagamento;
- pronto/expedição.

Configuração padrão inicial recomendada: produção em `order.confirmed`.

## 6. Idempotência

Um mesmo evento não pode criar duas produções acidentais.

Exemplo: duas entregas de `order.confirmed` com mesma chave lógica → um único conjunto de `print_jobs`.

## 7. Retentativa e contingência

Falha:

`pending → processing → failed → retry → ...`

Se exceder tentativas:
- manter job persistido;
- alertar operação;
- permitir retry manual;
- usar fallback se configurado.

Nunca descartar silenciosamente job de impressão.

## 8. Reimpressão

Todo pedido poderá ser reimpresso por usuário autorizado.

A via deve destacar:

`*** REIMPRESSÃO ***`

Registrar em auditoria:
- usuário;
- data/hora;
- motivo;
- pedido;
- impressora;
- job original.

## 9. Troco

Checkout em dinheiro poderá registrar:
- `needs_change`;
- `change_for`.

Expedição pode imprimir total, valor informado para troco e troco calculado.

## 10. Templates

### Produção
Deve priorizar legibilidade:
- pedido em fonte grande;
- horário;
- canal/tipo;
- itens e quantidades;
- adicionais e remoções;
- observação do item;
- observação operacional.

### Expedição
Pode conter:
- pedido;
- cliente;
- telefone conforme permissão/política;
- endereço;
- referência;
- forma de pagamento;
- total/troco;
- lista completa dos itens.

Templates devem ser desacoplados de transporte/driver.

## 11. Print Agent

Agente local será responsável por consumir jobs autorizados e imprimir em dispositivos que a nuvem não alcança diretamente.

Arquitetura:

`Cloud queue → Agent autenticado → spool local → rede/USB → térmica`

Requisitos:
- autenticação do dispositivo;
- escopo por organização/loja;
- heartbeat;
- atualização segura;
- spool/retry local;
- confirmação de job;
- não armazenar secrets desnecessários.

## 12. Saúde

Heartbeat do agente/impressora mantém:
- `online/offline`;
- `last_seen_at`;
- versão do agente;
- erro recente.

Painel mostra saúde das impressoras e alerta indisponibilidade.

## 13. Central de impressão

Rota prevista: `/configuracoes/impressoes`.

Seções:
- Impressoras;
- Estações;
- Roteamento;
- Templates;
- Fila;
- Histórico.

Monitor de fila mostra pedido, estação, impressora, status, tentativas e erro.

Ações autorizadas:
- tentar novamente;
- reimprimir;
- cancelar;
- ver erro.

## 14. Serviços

- `PrintService`
- `PrintRoutingService`
- `PrintQueueService`
- `PrintTemplateService`
- `PrinterHealthService`

## 15. Eventos

- `print.job_created`
- `print.processing`
- `print.completed`
- `print.failed`
- `printer.online`
- `printer.offline`

## 16. Testes obrigatórios

### Roteamento
Um pedido com itens de três estações produz três tickets segmentados + expedição completa.

### Falha
Impressora offline mantém job, tenta novamente, alerta e usa fallback se configurado.

### Duplicidade
Dois cliques/eventos de confirmação geram uma transição e um conjunto lógico de impressões.

### Reimpressão
Gera nova via marcada e auditada sem confundir com a impressão original.

### Compatibilidade
Testar ESC/POS e larguras térmicas comuns; detalhes de drivers devem ficar encapsulados no agente.
