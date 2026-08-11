# PedeAqui — Status do PDV [102]–[110]

## Escopo

Bloco oficial do PDV presencial, implementado sobre o motor existente de catálogo, pedidos, pagamentos, produção e impressão.

## Issues

- [102] #115 — Tela principal.
- [103] #116 — Navegação de categorias.
- [104] #117 — Busca rápida.
- [105] #118 — Carrinho lateral.
- [106] #119 — Seleção de adicionais.
- [107] #120 — Identificar cliente.
- [108] #121 — Finalizar pagamento.
- [109] #122 — Enviar para produção.
- [110] #123 — Imprimir pedido.

## Rota e experiência

Rota autenticada: `/pdv`.

A tela foi projetada para operação rápida em desktop/tablet e continua utilizável em celular:
- busca instantânea por nome, descrição, SKU e código de barras;
- filtros de categoria sem round-trip ao servidor;
- cards de produtos disponíveis;
- configurador de grupos/adicionais com mínimo/máximo;
- carrinho lateral com quantidade, adicionais, observação e total projetado;
- identificação opcional de cliente existente ou novo;
- dinheiro, Pix manual, crédito e débito presencial;
- múltiplas linhas de pagamento para split no próprio PDV;
- confirmação única da venda com feedback e link para o pedido criado.

## Autoridade de preço

O navegador nunca envia preço de produto/adicional como autoridade.

O cliente calcula apenas projeções para resposta instantânea. Na finalização, envia:
- `product_id`;
- quantidade;
- IDs dos adicionais;
- observação;
- distribuição dos pagamentos.

A função PostgreSQL recarrega catálogo, disponibilidade, vínculos de adicionais e preços atuais; recalcula o total e exige que a soma dos pagamentos feche exatamente com esse total.

## Fluxo transacional

Migration: `supabase/sql/30_pdv.sql`.

RPC interna: `pdv_create_order_internal(...)`, `SECURITY INVOKER`, execução exclusiva de `service_role`.

A mesma transação:
1. valida unidade e chave de idempotência;
2. resolve/cria cliente quando informado;
3. valida catálogo e adicionais;
4. calcula snapshots e valores;
5. gera número amigável;
6. cria `orders`, `order_items` e snapshots de adicionais;
7. cria e confirma cada linha do ledger `payments`;
8. confirma o pedido;
9. usa o trigger de confirmação já existente para a Central de Impressão;
10. inicia produção por `order_start_production_internal`;
11. grava auditoria e eventos;
12. conclui a chave idempotente.

Qualquer falha reverte a venda inteira.

## Pedido interno sem carrinho público falso

As colunas de origem de checkout (`source_cart_id`, `checkout_session_id`, `public_access_token_hash`) passam a aceitar `NULL` para canais internos.

A constraint `orders_digital_source_consistency` mantém as três obrigatórias para `channel='digital_menu'`. Portanto o cardápio público preserva a integridade original enquanto o PDV é um canal nativo.

## Pagamento

O PDV reutiliza o ledger `payments`; não escreve `orders.payment_status` diretamente.

- dinheiro: valor recebido e troco calculados no banco;
- Pix: confirmação manual, referência opcional;
- crédito/débito presencial: confirmação manual, sem PAN/CVV;
- split: cada parcela é uma linha do ledger e a soma precisa cobrir exatamente o pedido.

## Produção e impressão

O pedido nasce `pending_confirmation`, liquida seus pagamentos e então transita para `confirmed`.

Essa transição dispara o trigger existente `orders_enqueue_print_on_confirm`, portanto o PDV usa exatamente o mesmo roteamento durável, estações e Print Agent da Central Profissional de Impressão.

Depois da confirmação, `order_start_production_internal` leva a produção para `preparing` de forma atômica.

## Teste de banco com rollback

Foi executado um E2E real dentro de uma transação deliberadamente revertida:
- total: R$ 15,90;
- dinheiro recebido: R$ 20,00;
- troco: R$ 4,10;
- `order_status=confirmed`;
- `payment_status=paid`;
- `production_status=preparing`;
- `channel=pdv`;
- `fulfillment_type=counter`;
- 1 item persistido;
- cliente novo vinculado;
- 8 entradas de histórico;
- 0 `print_jobs`, esperado no banco vazio sem impressoras/estações.

A exceção final foi proposital para rollback. Verificação posterior confirmou zero resíduos do usuário, organização, loja, categoria, produto, cliente e chave idempotente usados no teste.

## Segurança

A RPC do PDV:
- não é executável por `PUBLIC`, `anon` ou `authenticated`;
- é executável apenas por `service_role`;
- é chamada somente após autorização server-side `orders.create`;
- não recebe preço como autoridade;
- mantém RLS/grants existentes nas tabelas públicas.

## Testes de aplicação

`tests/pdv.test.ts` cobre:
- busca normalizada, SKU e código de barras;
- filtro de categoria;
- mínimo/máximo de adicionais;
- adicional desconhecido/duplicado;
- projeção de preço;
- total do carrinho;
- parsing monetário brasileiro.

## Limites intencionais

- hardware real de impressão depende do primeiro ambiente operacional configurado;
- integração TEF/adquirente não pertence a esta fase; cartão é presencial/manual;
- fiscal/NFC-e fica para módulo fiscal futuro;
- o banco oficial ainda não possui tenant/usuário real, então o E2E autenticado visual depende do primeiro onboarding real.
