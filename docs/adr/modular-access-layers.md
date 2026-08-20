# ADR — Módulos, perfis, entitlements e RBAC são camadas independentes

Status: aceito para o ciclo [352]–[369].

## Contexto

O PedeAqui já possui RBAC e um motor de planos/entitlements. A expansão para Restaurante, Revenda de Gás e Comércio genérico precisa reduzir complexidade sem criar aplicações paralelas nem permitir que um toggle visual conceda acesso indevido.

## Decisão

A disponibilidade efetiva segue esta composição:

`perfil suportado ∩ módulo habilitado na unidade ∩ entitlement/plano ∩ RBAC/contexto ∩ estado operacional`.

Preferências de experiência (ex.: Modo Fácil) são aplicadas **depois** dessa resolução e só podem reduzir/reorganizar a interface.

### Perfil do negócio

Define semântica e defaults recomendados. Perfis v1:
- `restaurant`;
- `gas`;
- `generic_commerce`.

Perfil não concede permissão e não cria tabela de pedidos/clientes específica.

### Módulo da unidade

Expressa se a unidade deseja operar determinada ferramenta. Desabilitar:
- impede novas operações quando o gate estiver integrado;
- remove a superfície da navegação futuramente;
- preserva todo o histórico;
- não modifica ledger/state machine.

### Entitlement/plano

Continua autoritativo no mecanismo existente de `organization_entitlement_internal`/`EntitlementService`. O catálogo modular só declara uma chave de ponte quando houver um mapeamento comercial aprovado.

### RBAC

Continua autoritativo em `roles`, `role_permissions`, `user_store_roles`, `private.has_permission` e `authorize()`. Um módulo habilitado não cria role nem permission.

### Núcleo

`dashboard`, `orders`, `catalog`, `customers` e `settings` são classificados como core no catálogo v1 e não podem ser desligados. Isso preserva conta/configuração e a espinha dorsal comercial. A visibilidade de uma tela do core ainda pode ser reduzida por RBAC ou, futuramente, por Modo Fácil.

## Catálogo v1

Chaves estáveis:

`dashboard, orders, conversations, dining, catalog, pdv, cash, finance, fiscal, production, deliveries, driver, inventory, suppliers, purchases, customers, growth, scale, team, settings`.

A chave não muda com o texto. Exemplo: `catalog` pode ser “Cardápio” no Restaurante e “Catálogo” em Gás.

## Dependências v1

- `dining -> orders + catalog`
- `pdv -> orders + catalog`
- `cash -> orders`
- `fiscal -> orders`
- `production -> orders`
- `deliveries -> orders`
- `driver -> deliveries`
- `purchases -> inventory + suppliers`
- `growth -> customers + orders`

Dependências adicionais só entram com evidência de domínio. O catálogo possui teste contra dependência desconhecida e ciclo.

## Presets

`essential`, `complete`, `custom` são configurações iniciais, não planos comerciais.

- `essential`: conjunto recomendado pequeno por segmento;
- `complete`: todos os módulos suportados pelo perfil;
- `custom`: core + seleção explícita do proprietário, respeitando dependências.

Unidades existentes não são recalculadas a partir de preset: o backfill habilita as superfícies atuais explicitamente para evitar regressão.

## Concorrência

A configuração da unidade possui `module_config_revision`. Alterações server-side usam optimistic concurrency dentro de uma transação SQL e falham se a revisão mudou desde o preview. O cliente deve recarregar/recalcular em vez de sobrescrever silenciosamente uma decisão concorrente.

## Segurança

- `store_modules` é somente leitura para `authenticated` via RLS e `private.can_access_store`.
- Escrita ocorre somente por serviço server-side autorizado e RPC interna concedida a `service_role`.
- O RPC valida tenant/unidade, chaves conhecidas, módulos core, perfil e dependências.
- Mudanças são auditadas.
- Nenhum toggle de módulo apaga dados.

## Rollout

Neste primeiro lote a nova resolução **não substitui a navegação atual**. Ela cria o contrato e os serviços. A conexão com menu/deep links pertence a [357]; shadow/canário/feature flags para clientes existentes pertencem a [367].

## Consequências

Benefícios:
- um único PedeAqui para múltiplos segmentos;
- simplificação sem enfraquecer segurança;
- dados preservados ao desligar recursos;
- decisões de acesso explicáveis e testáveis.

Custos:
- toda nova capacidade precisa declarar módulo/perfil/dependências;
- mudanças de plano precisam de ponte explícita;
- rotas/jobs devem ser progressivamente integrados ao gate server-side antes da liberação geral.
