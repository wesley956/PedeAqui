# Matriz RBAC e isolamento — estabilização #821

Esta matriz documenta o contrato de acesso do PedeAqui. Ela não substitui RLS nem autorização server-side; serve como especificação verificável no CI.

## Camadas obrigatórias

Toda operação privada deve passar, na ordem lógica, pelos limites aplicáveis:

1. usuário autenticado;
2. vínculo ativo com a organização;
3. unidade pertencente à mesma organização;
4. módulo ativo na unidade;
5. dependências do módulo satisfeitas;
6. entitlement/plano autorizado;
7. permissão do papel no contexto organização/unidade;
8. regra de domínio específica da operação.

`Modo Fácil` altera experiência, nunca autorização. Um deep link não pode contornar nenhuma das camadas acima.

## Perfis

| Perfil | Escopo | Baseline de acesso | Restrições essenciais |
| --- | --- | --- | --- |
| Anônimo | público | cardápio, produto e demais rotas explicitamente públicas | nunca recebe contexto de organização privada nem `service_role` |
| Proprietário (`owner`) | organização + unidades autorizadas | catálogo completo de permissões da organização | ainda respeita tenant, unidade, módulo e entitlement |
| Gerente (`manager`) | organização + unidades autorizadas | operação/administração, exceto `organization.manage` | não assume propriedade da organização |
| Caixa (`cashier`) | unidade | dashboard, pedidos operacionais, abertura/sangria/fechamento de caixa e clientes conforme baseline | não recebe gestão de organização/equipe por padrão |
| Atendente (`attendant`) | unidade | dashboard, catálogo em leitura, pedidos e clientes conforme baseline | não recebe administração estrutural por padrão |
| Garçom (`waiter`) | unidade | pedidos e clientes necessários ao atendimento | não recebe caixa/administração por padrão |
| Produção/Cozinha (`kitchen`) | unidade | visualizar/atualizar pedidos conforme workflow | não recebe financeiro/equipe/organização |
| Entregador (`driver`) | unidade/entregas atribuídas | baseline mínimo + capacidades de entrega liberadas pelo fluxo específico | não recebe gestão geral da loja e deve permanecer limitado às operações de entrega autorizadas |
| Financeiro (`financial`) | organização/unidade conforme concessão | dashboard/relatórios no baseline + módulos financeiros quando explicitamente concedidos | não recebe operação de cozinha/entrega/equipe por padrão |
| Super admin controlado | plataforma | somente superfícies de plataforma explicitamente protegidas | autorização de plataforma é separada de RBAC da organização; nunca deve surgir de cookie, menu ou permissão organizacional |

## Isolamento multi-tenant

- `organization_id` vindo de cookie/request é apenas uma preferência; o servidor revalida vínculo ativo do usuário.
- `store_id` vindo de cookie/request só é aceito se a loja pertencer à organização já validada.
- `private.has_permission` sempre vincula a avaliação a `auth.uid()`, `organization_id` e, quando aplicável, `store_id`.
- `user_store_roles` exige a mesma organização e a unidade exata; um ID de outro tenant/unidade deve retornar negação, não fallback permissivo.
- `service_role` existe apenas no backend e não é uma forma de autorização de UI.

## Contrato módulo × entitlement × permissão

| Módulo ativo | Entitlement | Permissão | Resultado |
| --- | --- | --- | --- |
| não | qualquer | qualquer | negar (`disabled_by_store`) |
| sim | não | qualquer | negar (`not_in_plan`) |
| sim | sim | não | negar (`permission_denied`) |
| sim, dependência faltando | sim | sim | negar (`missing_dependency`) |
| sim | sim | sim | permitir, desde que tenant/unidade e regra de domínio também sejam válidos |

## Troca de unidade

A unidade selecionada não é autoridade persistente. A cada resolução de contexto o servidor:

- revalida o membro ativo na organização;
- consulta a loja limitada pela organização validada;
- só então usa o `store_id` solicitado;
- recalcula módulos/capacidades/permissões para a nova unidade.

Portanto, contexto, módulo ou permissão obtidos na unidade A não podem ser reutilizados para a unidade B sem nova resolução.

## Evidência contínua

O CI deve manter, no mínimo:

- testes negativos de organização/unidade e cookie não confiável;
- matriz de módulos para `disabled_by_store`, `not_in_plan`, `permission_denied` e `missing_dependency`;
- verificação dos papéis de sistema realmente criados pelo onboarding;
- isolamento da autorização de plataforma;
- ausência de `service_role` em módulos cliente;
- deep links sujeitos às mesmas guards do servidor.

Testes não devem depender de dados reais de restaurantes.
