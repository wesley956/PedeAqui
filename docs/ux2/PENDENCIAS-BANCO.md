# UX2 — Pendências de banco (não aplicadas na produção)

Encontradas ao executar os fluxos de ponta a ponta na homologação local. **Nenhuma foi aplicada na produção.** Aplicar exige aprovação específica do responsável e deve entrar como migração própria, fora dos lotes visuais.

A homologação local aplica as marcadas como "aplicada na homologação" por meio de `scripts/homologacao-local/correcoes-pendentes.sql`, só para os testes continuarem.

## P-01 — Salão: "Enviar para produção" falha · confirmado na homologação · aplicada na homologação
- **O que acontece:** na mesa aberta, lançar um item e clicar em "Enviar para produção" mostra "Não foi possível concluir a operação do salão." O pedido por QR da mesa usa a mesma função.
- **Causa:** `public.dining_create_round_internal` (executada pelo servidor como `service_role`, `security invoker`) chama `private.dining_price_items`, e essa função teve a execução revogada de todos sem ser concedida a `service_role`. Erro do banco: `42501 permission denied for function dining_price_items`.
- **Por que é provável na produção também:** não existe concessão em `supabase/sql` nem em `supabase/migrations`. O mesmo tipo de falha já foi corrigido antes para Crescimento (`43_growth_private_execution_grants.sql`) e Impressão (`93_printing_private_execution_grants.sql`). **Não confirmado com dados da produção** (sem acesso — D-03); se nenhuma loja usa o Salão, o defeito pode nunca ter aparecido.
- **Correção proposta:**
  ```sql
  grant execute on function private.dining_price_items(uuid, jsonb) to service_role;
  ```
- **Como conferir na produção sem alterar nada:**
  ```sql
  select has_function_privilege('service_role', 'private.dining_price_items(uuid, jsonb)', 'execute');
  ```
  `false` confirma o defeito.

## P-04 — Salão: rodada de mesa falha ao criar o pagamento inicial · confirmado na homologação · aplicada na homologação
- **O que acontece:** corrigida a P-01, "Enviar para produção" continua falhando, agora com `23502 null value in column "method" of relation "payments"`.
- **Causa:** o gatilho `private.seed_order_payment_intent` (cria o pagamento inicial de cada pedido) pulava pedidos de mesa (`waiter`, `table_qr`) e pedidos sem forma de pagamento. A versão trazida por `20260906054000_omnichannel_canonical_order_import` (arquivo `193_…` do esquema consolidado) ficou só com `if new.channel in ('pdv','ifood','99food') or new.total_cents <= 0`. A rodada de mesa nasce sem forma de pagamento (é paga depois, na conta), então o gatilho tenta gravar um pagamento com forma nula.
- **Na produção:** essa migração consta como aplicada em `supabase/production-migrations-tail.json`. Portanto é **provável que o Salão esteja sem conseguir enviar rodadas desde 06/09/2026**. Não confirmado com dados (D-03).
- **Correção proposta:** recriar a função com a condição
  ```sql
  if new.channel in ('pdv','ifood','99food','waiter','table_qr') or new.total_cents <= 0 or new.payment_method_snapshot is null then return new; end if;
  ```
  (texto completo em `scripts/homologacao-local/correcoes-pendentes.sql`). Só deixa de criar pagamento em casos em que hoje a gravação falha; não muda pedidos do cardápio, PDV ou iFood.
- **Como conferir na produção sem alterar nada:** `select pg_get_functiondef('private.seed_order_payment_intent()'::regprocedure);` e procurar por `table_qr`.

## P-02 — Mesmo padrão em outras funções · a confirmar
A consulta de diagnóstico (`permissoes-faltando.txt` nas evidências) lista funções do schema `private` chamadas por funções do servidor sem concessão a `service_role`. Depois de descontar as que são chamadas pelo usuário logado (que tem a concessão), restam para conferir:

| Função `private` | Chamada por | Risco se o servidor chamar como `service_role` |
| --- | --- | --- |
| `integration_normalize_payment_method(text)` | `integration_import_external_order` | importação de pedido externo (iFood) |
| `subscription_can_transition(text, text)` | `subscription_apply_internal` | mudança de situação de assinatura |
| `has_permission(uuid, uuid, text)` | `driver_route_end_internal` | encerrar rota do entregador |

Não foram executadas na homologação (dependem de iFood, cobrança e rota de entrega). Conferir com a mesma consulta `has_function_privilege` antes de qualquer alteração.

## P-03 — Esquema consolidado desatualizado · sem efeito na produção
`supabase/sql` (usado para montar um banco do zero) não tem objetos e concessões que existem só em `supabase/migrations`: 18 migrações com tabelas/colunas/funções e 2 só de concessão (`manual_delivery_private_execution_grant`, `platform_super_admin_service_role_execute`). A homologação local aplica essas migrações por cima. Quem montar um ambiente novo a partir de `supabase/sql` terá telas quebradas.
