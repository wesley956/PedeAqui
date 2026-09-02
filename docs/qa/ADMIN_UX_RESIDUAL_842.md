# Inventário administrativo residual — issue #842

Revisão feita sobre a UX v3 já publicada, sem alterar ledger, regras fiscais, permissões ou dados de restaurantes.

| Rota | Situação auditada | Residual nesta issue |
|---|---|---|
| `/estoque` | cartões responsivos, estados vazios e movimentos já coerentes | nenhum redesenho necessário |
| `/estoque/fichas` | fichas e formulários preservam o fluxo operacional | nenhum redesenho necessário |
| `/compras` | sugestões conduzem estoque → compra → fornecedor | nenhum redesenho necessário |
| `/fornecedores` | fornecedores e catálogo usam cartões responsivos | nenhum redesenho necessário |
| `/financeiro` | operação financeira separada da cobrança SaaS | nenhum redesenho necessário |
| `/fiscal` | filas principais antes das configurações avançadas | nenhum redesenho necessário |
| `/equipe` | pessoas, convites e permissões permanecem juntos | nenhum redesenho necessário |
| `/escala` | expansão separada das permissões da equipe | tabela de reposição precisava de alternativa móvel e recursos segmentados ainda apareciam sem direito no plano |

## Resultado

- A reposição entre unidades mantém tabela densa no desktop e vira cartões rotulados no celular.
- Marca própria e domínios personalizados aparecem somente quando o entitlement correspondente está habilitado.
- Central de compras, BI e integrações continuam protegidos pelos entitlements existentes.
- Nenhuma configuração ativa de Dona Maria ou Dom Burger foi modificada.
