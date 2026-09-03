# Rollout seguro do núcleo modular — #520 / #521

## Objetivo

Introduzir o novo resolver modular e RBAC por módulo de forma progressiva, reversível e sem alterar automaticamente a configuração das lojas ativas.

## Estado seguro por padrão

- `enabled` ausente ou `false`: usa somente o resolver legado.
- `rollbackToLegacy=true`: kill switch absoluto; ignora store, organização, coorte e percentual.
- Nenhum dado ou configuração de cliente é mutado pelo mecanismo de rollout.
- O backfill de RBAC é um planejador puro/dry-run; persistência deve ser uma etapa explícita e separada.

## Seleção progressiva

A precedência de targeting é determinística:

1. store explícita;
2. organização explícita;
3. coorte explícita;
4. percentual determinístico por `organizationId:storeId`.

O percentual não usa aleatoriedade por request. A mesma loja permanece no mesmo bucket, evitando flapping.

## Modos

### Legacy

Executa apenas o comportamento atual. O resolver novo não é chamado.

### Shadow

Executa legado e novo, registra duração/divergência e **retorna sempre o resultado legado**. Exceção no novo resolver não afeta o usuário.

### New

Executa o novo resolver. Em exceção, faz fallback imediato para o legado e registra `fallbackUsed=true`.

## Diagnóstico

O callback de diagnóstico recebe somente contexto técnico de rollout, modo, motivo, tempos, fallback e divergência produzida pelo comparador. Não deve receber PII nem payloads de cliente. Métricas recomendadas:

- divergência por módulo/motivo;
- p50/p95 de cada resolver;
- taxa de fallback;
- número de módulos avaliados por request;
- consultas adicionais por request para detectar N+1/cold start.

## RBAC por módulo

O resolver aplica:

- módulo indisponível sempre nega;
- ausência de grant compatível nega;
- especificidade: `store > organization > global`;
- no mesmo escopo, `deny` vence `allow`;
- grants de outra organização/store são ignorados;
- navegação e guarda server usam a mesma `ModuleRbacDecision`.

Isso evita divergência em que o menu esconde uma ação que o backend permite, ou vice-versa.

## Backfill seguro

`planModuleRbacBackfill` é somente leitura e determinístico:

- `true` legado vira candidato `allow`;
- `false` vira `deny`;
- `null/undefined` é ignorado e nunca vira permissão;
- conflito no mesmo módulo/permissão/escopo colapsa para `deny`;
- `sourceIds` preserva rastreabilidade e `rollbackSourceIds` permite remoção/reversão da carga gerada;
- repetir o dry-run com os mesmos dados produz o mesmo plano.

Nenhum backfill deve ser aplicado diretamente em produção sem inspeção do dry-run, canário e plano de rollback.

## Sequência recomendada de promoção

1. deploy com rollout desabilitado;
2. shadow em stores internas/teste;
3. shadow em coorte pequena;
4. comparar divergência/performance;
5. `new` em stores explícitas;
6. ampliar percentual gradualmente;
7. manter kill switch durante toda a migração;
8. só remover caminho legado após período sem divergências/fallbacks e validação dos fluxos críticos.

## Rollback

Em incidente, definir `rollbackToLegacy=true` no controle de rollout. Como shadow/new não alteram a configuração da loja, o rollback não depende de desfazer dados. Backfills persistidos futuramente devem usar a lista de `rollbackSourceIds` do plano aprovado para reversão direcionada, sem apagar grants pré-existentes.
