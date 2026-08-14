# Caixa — interface operacional

A rota `/caixa` foi mantida como superfície do turno. O fluxo visível é:

1. abrir turno quando não existe sessão atual;
2. acompanhar saldo esperado e principais entradas/saídas;
3. registrar suprimento ou sangria somente quando a permissão já permite;
4. conferir e fechar o turno;
5. consultar os movimentos do turno e, em segundo nível, o histórico de sessões.

Cadastro e manutenção de caixas físicos ficam em `/configuracoes/caixa`, protegidos por `cash.manage`. As actions `createCashRegisterAction` e `updateCashRegisterAction` continuam as mesmas; apenas saíram da superfície diária.

A operação continua usando `CashService.loadDashboard()`, o ledger atual e as mesmas abilities `open`, `supply`, `withdraw` e `close`. Nenhuma fórmula de saldo, regra de sangria, regra de fechamento, permissão ou RPC foi alterada.

Valores usam alinhamento/ênfase visual sem depender exclusivamente de cor. Em touch os controles adotam a altura grande do design system.
