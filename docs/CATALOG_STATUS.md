# Status do Catálogo — [017] a [024]

Branch: `agent/catalog-017-024`  
PR: #26  
Base: `agent/foundation-001-016`

## Implementado em código

- [017] Categorias: domínio, validação, serviço, UI inicial, auditoria/eventos e soft delete.
- [018] Produtos: domínio, preço em centavos, custo, SKU, barcode, preparo, serviço e UI inicial.
- [019] Imagens: serviço server-only, limite de 5 MB, JPEG/PNG/WebP e contrato do bucket.
- [020] Grupos de adicionais: regras min/max/obrigatório, serviço e UI inicial.
- [021] Adicionais: preço adicional, status, serviço e UI inicial.
- [022] Produto ↔ grupos de adicionais: vínculo tenant/store-safe e ordenação.
- [023] Duplicação: novo produto com novos IDs e cópia dos vínculos de adicionais.
- [024] Disponibilidade: `available`, `sold_out` e `inactive`, independente de exclusão.

## Banco real — aplicado em 10/08/2026

O projeto Supabase `zsbsczjhiujnhdznrzck`, anteriormente ocupado por outro produto, foi resetado por autorização explícita e passou a ser o backend oficial do PedeAqui.

Aplicado:

- fundação multi-tenant;
- RLS/RBAC;
- onboarding e convites;
- auditoria/eventos/idempotência;
- `categories`;
- `products`;
- `modifier_groups`;
- `modifiers`;
- `product_modifier_groups`.

Após hardening, o **Security Advisor retornou zero alertas**.

O Performance Advisor apresenta principalmente recomendações informativas de índices de foreign keys e índices ainda não utilizados. Como o banco acabou de ser recriado e está vazio, essas recomendações serão avaliadas contra o workload real, evitando indexação indiscriminada.

## Storage

O Storage antigo possui zero objetos. Dois buckets vazios legados ainda existem porque o conector utilizado não expõe exclusão via Storage API.

O bucket futuro `catalog-media` deve ser criado pela Storage API/CLI com:

- público;
- limite de 5 MiB;
- JPEG/PNG/WebP;
- mutação apenas server-side na primeira versão.

`supabase/sql/09_catalog_storage.sql` agora é somente um contrato documentado e não modifica diretamente o schema gerenciado `storage`.

## CI

Último CI de código do catálogo antes da ativação do banco: sucesso em install, lint, typecheck, tests e production build. A branch recebeu depois apenas alterações de identidade/documentação/storage contract e deve ser revalidada pelo PR.

## Identidade

O produto oficial é **PedeAqui**, com laranja + grafite. A UI provisória vermelha foi substituída pelos tokens oficiais:

- `#FF6B00`
- `#E65300`
- `#171717`
- `#242424`
- `#FFFDF9`

A arte original foi localizada na File Library, mas o conector não expôs o binário para versionamento; ver `docs/BRAND_IDENTITY.md` no `main`.

## Decisões relevantes

- valores monetários usam centavos inteiros (`*_cents`), nunca float;
- `sold_out` não exclui/desativa o produto permanentemente;
- soft delete preserva histórico;
- categoria/produto/adicional sempre carregam `organization_id` + `store_id`;
- vínculos possuem integridade cross-tenant/cross-store;
- upload de imagem é server-only na primeira implementação.

## Próximo bloco

[025] Configuração do cardápio → [032] Clientes, conforme `IMPLEMENTATION_BACKLOG.md`.
