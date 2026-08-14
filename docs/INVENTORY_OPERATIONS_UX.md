# Estoque e fichas — hierarquia operacional

Issue lógica: **[291]**.

## Estoque

A tela prioriza saldo por unidade, mínimo e criticidade. O saldo permanece derivado do ledger imutável; não existe controle de edição direta. Correções continuam ocorrendo por movimento, contagem física e transferência, sempre pelas actions e serviços existentes.

Criticidade é comunicada por texto + símbolo + tom semântico: normal, baixo ou negativo. A configuração do insumo fica em divulgação progressiva para não competir com as tarefas do turno.

## Fichas técnicas

A tela distingue claramente a versão ativa do histórico. Uma mudança gera uma nova versão; versões anteriores permanecem somente leitura. O custo estimado usa o custo médio atual apenas como instrumento de análise e não altera quantidades históricas.

## Mobile

Saldo, ações e histórico colapsam para uma coluna. O objetivo no celular é consultar criticidade, registrar movimento/contagem e conferir a ficha sem reproduzir uma grade de desktop.

## Invariantes preservados

- saldo nunca editado diretamente;
- histórico de ficha nunca alterado em lugar;
- autorização continua server-side;
- sem alteração de schema, RLS ou cálculo de custo.
