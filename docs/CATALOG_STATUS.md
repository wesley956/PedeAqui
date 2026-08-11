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

## Banco real

Supabase oficial: `zsbsczjhiujnhdznrzck`.

Em 10/08/2026 o banco legado foi resetado com autorização explícita e a fundação + catálogo do PedeAqui foram aplicados como migrations reais. Após hardening, o **Security Advisor retornou zero alertas**.

## Storage

O Storage antigo contém zero objetos. Dois buckets vazios legados permanecem temporariamente porque o conector não expõe remoção via Storage API. O contrato do futuro `catalog-media` está documentado em `supabase/sql/09_catalog_storage.sql` sem mutação direta do schema gerenciado.

## CI

O catálogo passou em install, lint, typecheck, testes e build. Alterações posteriores de branding PedeAqui e documentação serão novamente validadas no PR.

## Identidade

Produto oficial: **PedeAqui**. Paleta: laranja + grafite. A arte original foi localizada na File Library, mas o binário não pôde ser exportado pelo conector; `docs/BRAND_IDENTITY.md` registra a fonte oficial e evita redesenho silencioso.

## Decisões relevantes

- valores monetários usam centavos inteiros (`*_cents`), nunca float;
- `sold_out` não exclui o produto;
- soft delete preserva histórico;
- catálogo sempre carrega `organization_id` + `store_id`;
- vínculos possuem integridade cross-tenant/cross-store;
- upload de imagem é server-only na primeira implementação.

## Próximo bloco

[025] Configuração do cardápio → [032] Clientes.
