# Gate de evolução fluida — issue #888

Este documento separa a homologação automatizável da validação que depende de pessoas e operação real. Nenhuma execução deste gate altera configurações ou cria pedidos em restaurantes ativos.

## Gate automatizado

Execute:

```bash
npm run test:fluid-rollout
```

| Risco | Evidência automatizada |
|---|---|
| Entrega sem motoboy | `manual-delivery-flow.test.ts` |
| Transições e capacidade de entrega | `delivery-operations.test.ts` |
| Realtime oscilando e reconciliação | `operational-realtime-resilience.test.ts` |
| Pedidos ativos nunca escondidos | `operational-queues-completeness.test.ts` |
| Impressão, token e configuração simples | `print-agent-token.test.ts`, `printing-simple-setup.test.ts` |
| Pedido duplicado/idempotência | `concurrency-contracts.test.ts` |
| Isolamento e permissões | `access-isolation-contracts.test.ts` |
| Módulos e entitlements | `commercial-plan-module-entitlements.test.ts` |
| 320–1920 px, toque e teclado | `mobile-full-layout-qa.test.ts`, `full-accessibility-qa.test.ts` |
| Roteiro móvel do entregador | `courier-route-residual-843.test.ts` |
| Pico de 50 pedidos com rollback | `supabase/tests/e2e_fluid_rollout_50_orders.sql` |

O CI completo continua obrigatório depois deste gate. O comando focal não substitui TypeScript, lint, banco, E2E, Print Agent nem build.

## Cenários controlados ainda necessários

Estes cenários devem usar conta de teste ou transação com rollback, nunca Dona Maria sem autorização:

- repetição de 50 pedidos em 30 minutos, em janela sustentada, além da rajada já validada;
- queda e retorno real de internet durante recebimento e atualização;
- Print Agent desligado, reiniciado e recuperado após boot do Windows;
- produto esgotado durante montagem e envio do carrinho;
- pagamento atrasado e política de conclusão selecionada;
- abertura, pausa, retomada e fechamento da operação;
- rollback para o commit anterior sem apagar dados nem configurações.

## Pilotos e autorização

1. Executar todos os cenários em conta controlada.
2. Registrar baseline de 14 dias antes de qualquer piloto.
3. Solicitar opt-in explícito da Dona Maria; preservar `manual` se essa for a escolha atual.
4. Observar métricas e relatos sem mudar configurações silenciosamente.
5. Incluir Dom Burger somente após retorno e concordância.
6. Liberar gradualmente apenas se métricas e operação melhorarem.
7. Exigir aprovação explícita antes do rollout geral.

## Critérios de interrupção e rollback

Interromper o piloto se ocorrer qualquer um destes eventos:

- pedido ativo escondido ou duplicado;
- impressão falhando sem alerta;
- aumento de pedidos esquecidos, suporte ou tempo por pedido;
- perda de acesso por papel, módulo ou plano;
- mudança inesperada no fluxo escolhido pelo restaurante.

Rollback de aplicação volta ao commit de produção anterior. Mudanças de configuração voltam aos valores registrados no baseline. Banco nunca é restaurado de forma destrutiva: qualquer reversão de schema exige migration posterior e auditável.

## Estado atual

- Gate automatizado: preparado e reproduzível.
- Conta controlada: login e fluxos essenciais validados na Santa Rita Açaí & Sorvetes, sem alterar a operação.
- Carga transacional: 50 pedidos em 514,44 ms (10,29 ms/pedido), todos visíveis, únicos e revertidos; nenhum resíduo permaneceu.
- Banco: checkout, PDV, cozinha, fallback de impressão e isolamento multiempresa passaram na produção com rollback.
- Operação real observada: Print Agent sem heartbeat e uma impressão parada foram sinalizados como P0 no painel e no Modo Movimento.
- Dona Maria: pendente de opt-in; configuração atual não foi alterada.
- Dom Burger: pendente de resposta humana.
- Rollout geral: bloqueado até evidência real e aprovação explícita.
