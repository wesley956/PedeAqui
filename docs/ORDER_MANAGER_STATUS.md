# Gestor de Pedidos — status [083]–[091]

Branch: `agent/order-manager-083-091`

## Escopo oficial

- [083] Kanban de pedidos — GitHub #93
- [084] Card do pedido — GitHub #94
- [085] Detalhe do pedido — GitHub #95
- [086] Aceitar/rejeitar — GitHub #96
- [087] Iniciar produção — GitHub #97
- [088] Marcar pronto — GitHub #98
- [089] Concluir pedido — GitHub #99
- [090] Alerta sonoro — GitHub #100
- [091] Reimpressão — GitHub #101

O item [092] pertence ao Milestone 9 — Produção/KDS e não faz parte deste bloco.

## Kanban

`/pedidos` agora usa colunas derivadas somente para apresentação:

- Novos
- Confirmados
- Em produção
- Prontos
- Finalizados

**Nenhuma coluna é persistida como status.** O agrupamento é derivado de `order_status`, `payment_status`, `production_status` e `fulfillment_status`, preservando a arquitetura de quatro ciclos independentes.

O card apresenta número amigável, cliente, total, modalidade, pagamento, produção, fulfillment e tempo decorrido, além de ações contextuais.

## Realtime e alerta

O Gestor assina `orders` por `store_id` e atualiza o board em INSERT/UPDATE.

Novo pedido `pending_confirmation` gera:

- indicador visual acessível com `aria-live`;
- som somente quando o operador ativa explicitamente `Ativar som`;
- preferência persistida localmente por unidade;
- deduplicação por `order.id` durante a sessão para evitar toques repetidos.

O som é sintetizado via Web Audio; não há asset de áudio externo.

## Operação

As ações da UI chamam serviços/RPCs server-side. A interface não atualiza status diretamente.

Fluxos incluídos:

- aceitar;
- rejeitar com motivo;
- iniciar produção;
- marcar pronto;
- marcar pagamento como pago;
- retirada;
- fluxo manual de entrega;
- concluir pedido quando invariantes permitirem;
- cancelar com motivo;
- reimprimir uma via existente com motivo.

### Iniciar produção

`order_start_production_internal` mantém as transições formais e o histórico completo:

`pending_confirmation → queued → preparing`

As duas transições acontecem dentro da mesma transação. Um pedido em `queued` também pode avançar atomicamente para `preparing`.

## Detalhe do pedido

`/pedidos/[id]` reúne:

- quatro estados independentes;
- ações operacionais válidas;
- itens, adicionais e observações;
- subtotais, desconto, entrega, total, pagamento e troco;
- cliente/endereço;
- timestamps;
- histórico de estados;
- vias de impressão, estação, impressora, status, tentativas e erro;
- reimpressão usando a Central Profissional de Impressão.

A reimpressão continua criando novo `print_job`, exige motivo e preserva o original.

## Segurança Supabase

Migration: `supabase/sql/27_order_manager_workflow.sql`.

Validação após aplicação:

- função `SECURITY INVOKER`;
- `anon`: EXECUTE negado;
- `authenticated`: EXECUTE negado;
- `PUBLIC`: EXECUTE negado;
- `service_role`: EXECUTE permitido;
- Security Advisor: zero alertas.

## Testes

`tests/order-manager.test.ts` cobre:

- derivação das colunas do Kanban;
- precedência de estados terminais;
- tempo decorrido;
- regras/bloqueios de conclusão.

## Próximo bloco

[092]–[095] — Produção/KDS:

- painel de produção;
- filtro por estação;
- tempo de pedido;
- destaque para atraso.
