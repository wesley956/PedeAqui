# Detalhe do pedido — hierarquia operacional

A tela `/pedidos/[id]` segue uma ordem fixa de decisão:

1. identificação resumida, total e situação atual;
2. próxima ação permitida pelas state machines existentes;
3. itens, modificadores e observações;
4. pagamento;
5. cliente e modalidade de atendimento;
6. histórico e impressões como informação secundária recolhível;
7. ações administrativas por último.

## Regras

- A interface nunca grava estados diretamente. Todas as transições continuam passando por `OrderActionForm`/actions e validação server-side.
- Cancelamento preserva a action e as condições existentes.
- IDs internos não são apresentados como informação operacional.
- Histórico técnico continua disponível, mas não domina a primeira dobra.
- Impressões/reimpressões continuam acessíveis em uma seção secundária.
- `PaymentPanel` permanece como fonte da operação de pagamento.
- Status usam a linguagem semântica do design system e nunca dependem somente de cor.
- Em telas menores o layout vira uma coluna; alvos interativos secundários respeitam o tamanho touch do design system.

Nenhuma state machine, permissão, consulta de pedido, regra de pagamento ou regra de impressão foi alterada nesta etapa.
