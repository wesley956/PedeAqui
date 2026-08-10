# PedeAqui — Infraestrutura e Ambientes

## GitHub

Repositório técnico oficial: `wesley956/cruz`.

A documentação de produto vive em `docs/`. O nome comercial e identidade visual oficiais do sistema são **PedeAqui**.

## Supabase oficial

Projeto reaproveitado: **Cruz**  
Project ref: `zsbsczjhiujnhdznrzck`  
Região: `sa-east-1`

### Reset realizado em 10/08/2026

Por autorização explícita do proprietário, o projeto Supabase antigo foi reaproveitado para o PedeAqui.

Antes do reset havia outro sistema no projeto. A limpeza removeu:

- todas as tabelas, views e rotinas de aplicação no schema `public`;
- usuários antigos do Supabase Auth;
- cron jobs antigos;
- histórico de migrations do produto anterior;
- extensão `pg_net` legada após a nova fundação estar instalada.

O Storage estava sem objetos. Permaneceram apenas dois buckets vazios (`evidence` e `logos`) porque operações de remoção de buckets devem ser feitas pela Storage API e o conector usado nesta manutenção não expõe essa ação. Eles não contêm arquivos nem dados do produto antigo.

As Edge Functions antigas não possuem ação de exclusão disponível no conector atual. Todas foram substituídas por stubs HTTP 410 (`legacy_function_retired`) e configuradas com `verify_jwt=true`, neutralizando a lógica anterior até que possam ser excluídas pela API/CLI.

## Schema PedeAqui instalado

O mesmo projeto agora contém a fundação e o catálogo do PedeAqui:

- `profiles`
- `organizations`
- `roles`
- `permissions`
- `role_permissions`
- `organization_members`
- `stores`
- `user_store_roles`
- `invitations`
- `audit_logs`
- `domain_events`
- `idempotency_keys`
- `categories`
- `products`
- `modifier_groups`
- `modifiers`
- `product_modifier_groups`

Também estão instalados:

- RLS multi-tenant;
- `private.is_org_member`;
- `private.can_access_store`;
- `private.has_permission`;
- RPC de bootstrap de organização/primeira loja;
- RPC de aceite seguro de convite;
- permissões iniciais;
- políticas explícitas de bloqueio para tabelas server-only.

## Validação

Após o hardening, o **Supabase Security Advisor retornou zero alertas**.

O Performance Advisor ainda pode listar índices não utilizados porque o banco acabou de ser recriado e está vazio, além de sugerir índices de algumas foreign keys. Essas sugestões devem ser avaliadas conforme o workload real, evitando criar índices indiscriminadamente antes de uso.

## Storage

O catálogo prevê um bucket `catalog-media` com JPEG/PNG/WebP e limite de 5 MB. A criação/remoção de buckets deve ser feita via Storage API. Não modificar `storage.objects` diretamente por SQL.

## Regra

A partir deste reset, `zsbsczjhiujnhdznrzck` é o backend oficial do **PedeAqui**. Não reutilizar nele migrations ou funções do produto antigo.
