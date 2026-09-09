# Checkout V1+V3 — Gate final de homologação

Escopo: issues #980, #981 e #982. Este documento registra o contrato final do redesign sem alterar regras de negócio.

## Shell e navegação

- Delivery: Recebimento → Dados → Endereço → Pagamento → Revisão.
- Pickup: Recebimento → Dados → Pagamento → Revisão.
- Voltar é contextual e não limpa `checkout_sessions`.
- Progresso deriva do fluxo real (5/4 etapas).
- Total exibido vem de `cart.total_cents`; subtotal, desconto e frete usam os valores oficiais carregados.
- Confirmação final continua em `confirmCheckoutOrderAction`.

## Viewport e acessibilidade

Matriz alvo: 320, 360, 390, 430, 768, 1024, 1366, 1440 e 1920 px, incluindo viewport baixa/teclado móvel quando aplicável.

Contratos:
- `100dvh` com fallback de `min-height:100vh`;
- safe-area superior e inferior;
- sem overflow horizontal;
- overflow vertical apenas na área central como fallback de segurança;
- foco visível em links, botões, choices e summaries;
- mensagens server-side com `role=alert` + `aria-live`;
- reduced-motion respeitado;
- telas baixas priorizam conteúdo no topo em vez de centralização vertical forçada;
- tokens oficiais de tema continuam sendo usados, sem tema paralelo.

## Matriz funcional obrigatória

### Recebimento
- delivery-only;
- pickup-only;
- delivery + pickup.

### Cliente e reconhecimento
- cliente novo;
- cliente reconhecido;
- token ausente/inválido;
- endereço salvo válido;
- endereço salvo indisponível;
- endereço salvo nunca exposto apenas por telefone.

### Endereço e entrega
- bairro cadastrado válido;
- pesquisa/troca de bairro;
- bairro não atendido;
- mínimo do bairro;
- endereço manual;
- CEP vazio;
- quote válida/inválida;
- taxa e ETA oficiais.

### Pagamento
- Pix;
- Pix exigindo e-mail;
- crédito;
- débito;
- dinheiro sem troco;
- dinheiro com troco;
- troco inválido;
- método desabilitado após seleção.

### Recursos opcionais
- Growth desligado;
- Growth ligado sem benefício;
- benefício aplicado e removido;
- ASAP;
- agendamento válido;
- agendamento inválido.

### Estado e navegação
- refresh em cada etapa;
- voltar/avançar;
- erro server-side reabrindo etapa correspondente;
- alteração de modalidade;
- alteração de endereço/frete;
- alteração de benefício/total.

### Confirmação e pós-pedido
- checkout válido;
- `checkout_not_ready`;
- dupla submissão/replay;
- bloqueio operacional;
- redirect de acompanhamento;
- cookie do carrinho removido;
- recognition cookie quando aplicável;
- Pix e notificações pós-pedido preservados.

## Gates técnicos

O PR final só pode ser considerado pronto quando estiverem verdes:
- lint;
- TypeScript;
- suíte completa;
- contratos Public UX;
- E2E em 3 passagens consecutivas;
- Print Agent;
- build de produção;
- Browser Homologation com Chromium e WebKit.

Não usar Dona Maria ou Dom Burger para testes destrutivos e não alterar migrations/schema/dados reais apenas para homologação.
