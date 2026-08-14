# Supabase — PedeAqui

Os arquivos em `supabase/sql/` formam a especificação canônica e **append-only** do schema do PedeAqui. O projeto oficial atualmente reconciliado é o Supabase `zsbsczjhiujnhdznrzck`.

## Regra de ouro

- Migrations já representadas em produção **não devem ser renumeradas, reordenadas ou reescritas** para “embelezar” o histórico.
- Correções posteriores entram como novos arquivos no final da sequência.
- O estado final de um ambiente novo deve convergir para o estado do banco oficial sem depender de edição manual.
- Alterações DDL novas devem passar primeiro por desenvolvimento/staging, advisors e testes antes de produção.

## Anomalias históricas preservadas

A sequência possui duas irregularidades antigas e conhecidas:

1. Existem dois arquivos com prefixo `14`: `14_cart.sql` e `14_delivery_fk_indexes.sql`.
2. Não existe arquivo com prefixo `17`; a sequência segue de `16_cart_fk_indexes.sql` para `18_checkout.sql`.

Essas irregularidades **não são corrigidas por renomeação**, porque os arquivos já fazem parte do histórico reproduzido/aplicado. A ordem canônica para esses arquivos é a ordem lexicográfica atual do diretório, documentada e protegida por teste. Novos arquivos continuam a partir do maior prefixo existente.

## Reconciliação com produção

Em 2026-08-13, o Supabase oficial recebeu a migration remota `onboarding_role_permission_conflict_hotfix`. Ela corrige uma colisão em `role_permissions_pkey`: triggers adicionados por módulos posteriores podem conceder permissões durante a criação dos roles e o bootstrap original tentava inserir a mesma tupla novamente.

O equivalente versionado no Git é:

- `90_onboarding_role_permission_conflict_hotfix.sql`

O arquivo usa `ON CONFLICT DO NOTHING` exclusivamente nos grants baseline do bootstrap e **não altera** o arquivo histórico `04_bootstrap_organization.sql`. Assim, um ambiente novo percorre o histórico original e termina com a mesma definição funcional observada em produção.

## Aplicação correta em ambiente novo

1. Instalar/atualizar Supabase CLI.
2. Vincular o projeto correto.
3. Aplicar os arquivos de `supabase/sql/` na ordem canônica registrada no repositório.
4. Nunca “preencher” o prefixo `17` nem renomear um dos arquivos `14` durante a aplicação.
5. Rodar os testes de schema/histórico.
6. Rodar advisors de segurança e desempenho.
7. Validar RLS com no mínimo:
   - proprietário global;
   - funcionário restrito a uma unidade;
   - segundo tenant independente.
8. Confirmar que usuário restrito a uma loja não consegue selecionar outra loja por ID/cookie/API.
9. Gerar/confirmar types do banco para o app.
10. Só depois promover novas migrations para produção.

## Segurança

- RLS deve permanecer habilitado em toda tabela exposta.
- `service_role` é somente servidor e nunca deve ser prefixado com `NEXT_PUBLIC_`.
- Policies precisam restringir tenant/ownership; `TO authenticated` sozinho não autoriza acesso ao tenant.
- Não usar `user_metadata` para decisões de autorização.
- Funções `SECURITY DEFINER` auxiliares ficam em schema `private`, têm `search_path` vazio e validam `auth.uid()`.
- Roles globais ficam em `organization_members.role_id`; roles de unidade ficam em `user_store_roles`.
- Convite padrão nunca concede `owner` e cria role apenas nas lojas explicitamente atribuídas.
- Caso as configurações de Data API do projeto exijam grants explícitos, conceder apenas o mínimo necessário e manter RLS habilitado.

## Status

Histórico local e hotfix remoto de onboarding reconciliados até `90_onboarding_role_permission_conflict_hotfix.sql`. A verificação automática de drift pertence à issue [305].
