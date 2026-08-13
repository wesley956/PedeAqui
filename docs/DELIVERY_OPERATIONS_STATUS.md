# PedeAqui — Status Entregas Operacionais [175]–[185]

## Estado

Milestone 18 concluído e mesclado em `main` pelo PR #206. Merge commit: `b866ce5c2972791dd7674dbad219a6f7f5411227`.

Issues #195–#205 encerradas como `completed`.

## Princípios preservados

- `orders.fulfillment_status` continua sendo a fonte de verdade do ciclo de entrega.
- `deliveries` registra execução logística, entregador e timestamps; não cria uma segunda State Machine concorrente.
- `delivery_history` é imutável e registra atribuições, reatribuições e marcos operacionais.
- Mutações usam RPCs internas service-role-only depois de autorização e escopo org/unidade na aplicação.
- Usuário entregador só pode avançar entrega vinculada ao seu próprio `driver.user_id`.

## [175]–[180] Motor operacional

- cadastro `drivers` por organização/unidade, com vínculo opcional a usuário;
- `active`, `on_duty` e capacidade simultânea;
- `deliveries` 1:1 com pedido de entrega;
- SLA por `promised_by_at` derivado da estimativa gravada no pedido;
- atribuição e reatribuição atômicas/idempotentes;
- reatribuição exige motivo;
- capacidade é validada no banco;
- retries são reconhecidos antes de revalidar capacidade/estado;
- fluxo usa o State Machine existente: `awaiting_assignment -> assigned -> picked_up -> out_for_delivery -> delivered`;
- entrega paga pode concluir o pedido pela regra existente, sem bypass da State Machine.

## [181] Cotação por endereço

A regra pedida para taxa de entrega foi centralizada em `DeliveryQuoteService`.

Ao inserir/selecionar endereço:

1. o servidor normaliza bairro/cidade/UF;
2. busca configuração da unidade e bairro atendido;
3. valida entrega habilitada;
4. valida pedido mínimo do bairro;
5. calcula taxa por bairro ou taxa padrão;
6. aplica frete grátis quando atingir o limite configurado;
7. calcula ETA com minutos adicionais do bairro;
8. grava a cotação no checkout.

Na revisão final do checkout, a cotação é executada novamente. Se subtotal ou configuração de entrega mudaram, status, taxa e ETA são atualizados antes da criação do pedido. O navegador nunca é autoridade do frete.

O mesmo contrato agora é reutilizado pelo domínio de configuração/consulta de entrega, evitando lógica duplicada e preparando Cardápio, WhatsApp e canais futuros para usar a mesma regra.

## [182]–[184] Interfaces

### `/entregas`

- fila de pedidos de entrega por unidade;
- endereço e telefone operacional;
- taxa já cobrada no pedido;
- estimativa/SLA e destaque de atraso;
- entregador e carga atual/capacidade;
- atribuir/reatribuir;
- retirada, saiu para entrega e entregue;
- cadastro/estado/capacidade de entregadores conforme `delivery.manage`;
- Realtime sobre orders/deliveries/drivers.

### `/entregador`

- mobile-first;
- somente entregas atribuídas ao usuário vinculado;
- endereço/referência/telefone necessários para executar a entrega;
- ações: retirado, saiu para entrega, entregue;
- sem exposição de dados financeiros ou pedidos de outros entregadores.

## Segurança

Verificações no Supabase oficial:

- Security Advisor: 0 alertas;
- 3/3 tabelas novas com RLS;
- `anon`: 0 privilégios diretos nas tabelas novas;
- `authenticated`: 0 privilégios de mutação nas tabelas novas;
- `anon/authenticated`: 0 EXECUTE nas RPCs internas de logística.

O Performance Advisor apontou sete FKs novas sem índice de cobertura. Foram adicionados índices somente para essas FKs em `55_delivery_fk_indexes.sql`; avisos históricos de outras áreas não foram alterados sem evidência de uso.

## E2E PostgreSQL com rollback

Cenário validado no Supabase oficial:

- dois entregadores, capacidades 1 e 2;
- dois pedidos delivery prontos;
- pedido 1 pago via Pix;
- envio para fila;
- atribuição ao entregador 1;
- retry da mesma atribuição sem duplicar histórico;
- segunda entrega para entregador 1 bloqueada por capacidade 1/1;
- reatribuição do pedido 1 para entregador 2 com motivo;
- `picked_up` + retry;
- `out_for_delivery`;
- `delivered` + retry;
- pedido 1 terminou `completed` + `delivered` por já estar pago;
- histórico final: exatamente 6 eventos, sem duplicatas dos retries;
- rollback final: zero resíduos em auth/org/store/orders/drivers/deliveries/history.

## Hardening adicional de bootstrap

Durante a revisão foi detectado que triggers antigos de módulos concediam permissões a `owner/manager` no INSERT do papel, antes de o bootstrap conceder o catálogo completo. Como `role_permissions` usa PK `(role_id, permission_id)`, isso podia colidir na criação de uma organização nova.

A migration `54_role_bootstrap_trigger_hardening.sql` mantém os grants automáticos apenas para papéis operacionais. `owner/manager` continuam recebendo o catálogo completo pelo bootstrap.

Teste com rollback:

- owner: 0 grants antecipados, depois 44/44 permissões sem colisão;
- manager: 0 grants antecipados, depois 44/44 permissões sem colisão;
- zero resíduos.

## Migrations oficiais

- `delivery_operations_core_175_185`;
- `delivery_operations_175_185`;
- `role_bootstrap_trigger_hardening`;
- `delivery_fk_indexes_175_185`.

## CI

O run #128 detectou apenas erros de tipagem estrita no serviço novo, sem falha de lint ou banco. As assinaturas foram corrigidas sem afrouxar validações.

O **CI final #133**, no head `fca200e2aa40531e9f79af14bbcbcf4e87a54c2c` que foi mesclado, passou lint, TypeScript, testes, Print Agent e build.

## Limites honestos

- não houve GPS/rastreamento externo real;
- não houve geocoding real;
- o cálculo atual permanece baseado em bairro/configuração da unidade, preparando extensão futura para raio/polígono;
- não houve teste físico com entregador em campo.
