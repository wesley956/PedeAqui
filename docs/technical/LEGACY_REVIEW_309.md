# [309] Revisão de legado técnico

Data: 2026-08-14  
Supabase oficial: `zsbsczjhiujnhdznrzck`

## Escopo e método

A revisão cruzou quatro evidências antes de tomar decisão:

1. lista real de Edge Functions implantadas no projeto oficial;
2. conteúdo da versão atualmente implantada de **cada uma das 11 funções**;
3. referências no código atual do PedeAqui;
4. logs de `edge-function` do Supabase nas últimas 24 horas.

Nenhuma função foi julgada apenas pelo nome.

## Resultado principal

As 11 funções antigas continuam aparecendo no painel com `status: ACTIVE` porque ainda existe um deployment, porém o deployment atual de **todas elas** é um tombstone explícito:

```text
HTTP 410
{"error":"legacy_function_retired"}
```

Todas permanecem com `verify_jwt: true`. A consulta de logs `edge-function` do projeto oficial retornou **0 invocações nas últimas 24 horas** no momento desta homologação.

Não existe diretório `supabase/functions/` no repositório atual e os slugs aposentados não são utilizados pelo código de aplicação em `src/` nem pelo `print-agent/`.

## Inventário e decisão

| Função implantada | Conteúdo atual verificado | Evidência de uso PedeAqui | Decisão |
|---|---|---|---|
| `create-employee` | tombstone 410 `legacy_function_retired` | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `create-company` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `update-company-status` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `sync-offline-event` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `scan-absences` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `send-alert` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `validate-handover-employee` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `update-employee-field-access` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `mobile-history-feed` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `review-presence-status` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |
| `reset-user-password` | tombstone 410 | nenhuma | **RETIRED — manter tombstone temporariamente** |

## Por que não remover fisicamente agora

A janela de log disponível pela ferramenta é de 24 horas. Ela mostrou zero uso, e o código implantado já rejeita qualquer chamada com 410, o que é forte evidência de aposentadoria. Ainda assim, remover o endpoint físico imediatamente reduziria a capacidade de diagnosticar um cliente externo muito antigo que eventualmente apareça depois dessa janela.

A decisão segura desta issue é **manter os tombstones aposentados**, documentados e protegidos contra reintrodução no app. Remoção física pode ser feita em uma manutenção posterior após janela operacional maior e confirmação de que não há consumidor legado. Não há ferramenta de remoção de Edge Function exposta nesta sessão e não seria correto simular essa exclusão por outro meio.

## Critério para remoção futura

Uma função dessa lista só pode ser apagada quando todos os itens abaixo forem verdadeiros:

- continua sem referência no repositório atual;
- continua respondendo apenas tombstone 410;
- não apresenta invocações úteis durante a janela operacional definida para a remoção;
- não existe cron/job/webhook/configuração externa apontando para o slug;
- existe registro da data da remoção e procedimento de rollback/redeploy do tombstone.

## Configuração e deploy

- Nenhuma dessas funções faz parte do deploy do PedeAqui.
- Não há código-fonte delas em `supabase/functions/` no Git atual.
- O manifesto `supabase/retired-edge-functions.json` registra a lista canônica de tombstones conhecidos.
- Novas funcionalidades do PedeAqui não podem importar, invocar ou reutilizar esses slugs.
- Se uma função Edge nova for necessária, ela deve nascer versionada no Git com propósito e contrato próprios; não se deve reciclar um slug legado para uma responsabilidade nova.

## Guardrail

`tests/legacy-edge-functions.test.ts` garante que:

- a lista contém exatamente as 11 funções verificadas;
- o estado esperado é `410 / legacy_function_retired / verify_jwt=true`;
- nenhum slug aposentado reaparece em código de aplicação/Print Agent;
- não existe uma pasta local de funções antigas sendo enviada acidentalmente.

## Conclusão

O legado está **aposentado, não ativo funcionalmente**. O painel do Supabase mostra deployments ativos tecnicamente, mas todos são tombstones 410 e não registraram uso na janela observável de 24 horas. A decisão é manter os tombstones como barreira/telemetria por enquanto, em vez de excluir por nome ou aparência.
