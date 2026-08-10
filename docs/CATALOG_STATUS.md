# Status do Catálogo — [017] a [024]

Branch: `agent/catalog-017-024`  
PR: #26  
Base: `agent/foundation-001-016`

## Implementado em código

- [017] Categorias: domínio, validação, serviço, UI inicial, auditoria/eventos e soft delete.
- [018] Produtos: domínio, preço em centavos, custo, SKU, barcode, preparo, serviço e UI inicial.
- [019] Imagens: serviço server-only, limite de 5 MB, JPEG/PNG/WebP e especificação do bucket.
- [020] Grupos de adicionais: regras min/max/obrigatório, serviço e UI inicial.
- [021] Adicionais: preço adicional, status, serviço e UI inicial.
- [022] Produto ↔ grupos de adicionais: vínculo tenant/store-safe e ordenação.
- [023] Duplicação: novo produto com novos IDs e cópia dos vínculos de adicionais.
- [024] Disponibilidade: `available`, `sold_out` e `inactive`, independente de exclusão.

## Banco especificado, não aplicado

Arquivos:

- `supabase/sql/08_catalog.sql`
- `supabase/sql/09_catalog_storage.sql`

Esses arquivos **não devem ser aplicados** no projeto Supabase legado chamado `Cruz`, que pertence a outro produto.

Quando o banco novo desta plataforma for provisionado:

1. transformar as especificações SQL em migrations reais;
2. aplicar primeiro em dev/staging;
3. rodar advisors de segurança/performance;
4. testar Empresa A x Empresa B;
5. testar Loja A1 x Loja A2;
6. validar upload e leitura de imagens;
7. validar CRUD do catálogo ponta a ponta.

## CI

GitHub Actions run #5: sucesso.

- install ✅
- lint ✅
- typecheck ✅
- tests ✅
- production build ✅

## Decisões relevantes

- valores monetários do catálogo usam centavos inteiros (`*_cents`), nunca float;
- `sold_out` não exclui/desativa o produto permanentemente;
- soft delete preserva histórico;
- categoria/produto/adicional sempre carregam `organization_id` + `store_id`;
- vínculos entre produto, categoria e adicionais possuem integridade cross-tenant/cross-store no schema;
- upload de imagem é server-only na primeira implementação;
- nenhum módulo desta fase depende de aplicar o Supabase agora para continuar desenvolvimento estrutural.

## Próximo bloco planejado

[025] Configuração do cardápio → [031] Navegação por categorias, conforme `IMPLEMENTATION_BACKLOG.md`.
