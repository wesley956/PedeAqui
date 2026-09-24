# SAAS-05 — Certificação de isolamento entre tenants

Data da evidência: 2026-09-24.

Esta certificação complementa a estabilização #821 e a issue #1174. Ela não substitui a matriz adversarial A/B em banco isolado e não usa produção como laboratório.

## Fase 1 — evidência sem mutação

| Superfície | Evidência | Estado |
| --- | --- | --- |
| Contexto autenticado | `src/server/access/context.ts` autentica o usuário, resolve membership ativo por `user_id`, revalida `organization_id` solicitado e só resolve loja dentro da organização do membership | PASS por contrato/código |
| Autorização | `authorize.ts` delega a `has_permission` com organização/loja e nega quando a permissão não é verdadeira | PASS por contrato/código |
| Inbox / mídia privada | `conversation-media` é bucket privado; signed URL só é criada após `CONVERSATIONS_VIEW` e lookup por mídia + conversa + organização + loja | PASS por contrato/código + inspeção read-only |
| Mídia inbound Meta | tenant é resolvido pelo `whatsapp_phone_number_id`; o worker só busca mídia pendente da organização/loja resolvida | PASS por contrato/código |
| Atualização de mídia | sucesso e falha atualizam `message_media` com `id + organization_id + store_id` | PASS por contrato/código |
| Server-only | múltiplas RPCs internas e tabelas sensíveis são acessadas via service role/RPCs internas; os testes existentes congelam partes desses grants | PASS parcial; continuar inventário na #1174 |
| Projeções públicas | menu/produto possuem RPCs públicas intencionais; promoções possuem achado separado SAAS-06 e não são consideradas certificadas por este documento | SEPARADO / SAAS-06 |
| Supabase advisors | há achados de hardening (57 tabelas RLS sem policy por desenho server-only em vários casos, 1 função com `search_path` mutável e 3 RPCs públicas SECURITY DEFINER) | REVISÃO SAAS-12; não é prova isolada de leak |

## O que NÃO está certificado ainda

A Fase 1 não prova sozinha que uma identidade real do tenant A falha em todas as tentativas contra recursos conhecidos do tenant B. A #1174 só pode ser concluída depois de executar, em ambiente não produtivo, pelo menos:

1. A lê recurso de A e recebe somente o permitido pelo RBAC.
2. A tenta ler e mutar pedido, cliente, conversa e configuração de B.
3. A troca `organization_id` e `store_id` no request/cookie/body.
4. A chama RPCs com UUIDs conhecidos de B.
5. A tenta obter signed URL de mídia pertencente a B.
6. Eventos/webhooks de A não roteiam nem atualizam B.
7. Workers não claimam nem finalizam jobs de outro tenant por ids manipulados.
8. URLs públicas retornam apenas a projeção explicitamente pública.

## Ambiente isolado

Na abertura desta certificação, o projeto Supabase não possuía Development Branch. Nenhum usuário, organização ou loja artificial será criado em produção para executar os ataques A/B.

Se não existir outro ambiente reutilizável, a Fase 2 deve usar um Supabase Development Branch. Como a criação possui custo associado, ela exige consulta de custo e aprovação explícita antes da criação.

## Regras de não regressão

- Não confiar em `organization_id`/`store_id` fornecidos pelo browser sem revalidar vínculo server-side.
- Não emitir signed URL antes de vincular recurso a organização, loja e entidade pai autorizadas.
- Não resolver tenant de webhook por nome, telefone textual ou parâmetro arbitrário quando existir identificador autoritativo do provider.
- Não liberar RPC/tabela interna a `anon` ou `authenticated` apenas para simplificar o frontend.
- Não usar `service_role` no cliente.
- Não considerar `RLS enabled` sozinho como evidência de isolamento; grants, policies, funções e caminhos server-side também precisam ser auditados.

## Pendências relacionadas, mas fora do escopo deste lote

- SAAS-06: reduzir a projeção pública de `get_public_product_promotions`.
- SAAS-12: tratar advisors de segurança de forma dirigida, incluindo `whatsapp_embed_preserve_failure_stage`, grants de funções públicas e leaked-password protection.
- SAAS-05 Fase 2: executar matriz adversarial real A/B em ambiente isolado.
