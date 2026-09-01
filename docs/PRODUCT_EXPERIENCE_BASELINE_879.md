# Baseline de praticidade — issue #879

## Objetivo

Medir a experiência atual de Dona Maria e Dom Burger antes do programa FLUXO. A medição é observacional, separada por organização e unidade, e não altera módulos, pedidos ou configuração dos pilotos.

## Janela de comparação

- período atual: últimos 14 dias;
- referência: 14 dias imediatamente anteriores;
- primeiro e quinto pedidos: histórico completo disponível;
- início da telemetria de interação: primeira ocorrência gravada após a migration #171;
- dado anterior inexistente aparece como **Não medido**, nunca como zero.

## Fontes e métricas

| Métrica | Fonte | Regra |
|---|---|---|
| primeiro e quinto pedidos | `orders` | ordem crescente de criação por unidade |
| pedidos e conclusão | `orders` | quantidade criada e percentual concluído na janela |
| ações por pedido | `product_experience_events` | eventos `px.order.action` / pedidos concluídos |
| tempo por ação | `product_experience_events` | média de `duration_ms` das ações medidas |
| Realtime | `product_experience_events` | falha e recuperação de `px.realtime.connection` |
| impressão | `print_jobs` | falhas e reimpressões concluídas |
| pausa/retomada | eventos `px.operation.pause` | duração entre pausa e retomada após instrumentação |
| abandono | eventos de onboarding/checkout | somente após existir início sem conclusão na janela definida |

## Contrato estável de eventos — versão 1

- `px.order.action`
- `px.realtime.connection`
- `px.operation.pause`
- `px.onboarding.step`
- `px.checkout.step`
- `px.print.recovery`

Somente chaves allowlisted são persistidas. Endereço, telefone, nome de cliente, conteúdo de conversa, credencial, token e dado financeiro não pertencem a esses eventos.

## Isolamento e disponibilidade

- tabela protegida por RLS e sem acesso de navegador;
- leitura e escrita somente pelo servidor;
- FKs compostas impedem combinar organização, unidade e pedido de tenants diferentes;
- falha de captura gera apenas log sanitizado;
- captura não participa da transação de pedido;
- retenção padrão: 180 dias;
- painel disponível somente no Painel do Proprietário em `/platform/operacao/praticidade`.

## Roteiro de observação sem interferência

1. Não orientar o funcionário enquanto ele executa uma tarefa.
2. Registrar somente horário, objetivo, ação esperada e se pediu ajuda.
3. Não solicitar compartilhamento de senha, tela de pagamento ou conversa.
4. Não alterar módulos durante o expediente.
5. Perguntar depois da tarefa: “o que você esperava que acontecesse?”
6. Classificar a dificuldade como descoberta, excesso de passos, linguagem, falha técnica ou configuração.
7. Comparar o relato com os eventos técnicos; relato humano não é substituído por telemetria.

## Baseline inicial

Pedidos e impressão anteriores à instrumentação podem ser reconstruídos no painel. Cliques, tempo por ação, perda de Realtime, pausa e abandono anteriores aparecem como **Não medido**. A primeira comparação antes/depois só será válida após uma janela observável suficiente; nenhum número sintético será usado para antecipá-la.

### Snapshot de produção antes do rollout — 01/09/2026

Consulta somente agregada, sem nome de cliente, contato, endereço, itens ou valores financeiros:

| Piloto | Pedidos totais | Pedidos em 14 dias | Concluídos | Conclusão | Checkouts | Abandonados após 30 min | Impressões com falha | Reimpressões concluídas |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dona Maria Salgados e Porções | 33 | 33 | 29 | 87,9% | 39 | 6 (15,4%) | 2 | 2 |
| Dom Burger | 2 | 2 | 2 | 100% | 2 | 1 (50%) | 0 | 1 |

- Dona Maria: primeiro pedido em 23/08/2026; quinto em 25/08/2026.
- Dom Burger: primeiro pedido em 27/08/2026; ainda não possui quinto pedido.
- A amostra do Dom Burger é pequena demais para conclusões sobre abandono ou facilidade.
- A janela anterior possui zero pedidos nos dois pilotos; por isso ainda não representa uma comparação sazonal útil.
- “Reimpressão concluída” não afirma necessariamente que houve falha na mesma janela; registra apenas a recuperação/segunda via existente.
