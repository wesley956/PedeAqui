# Salão — fluxo de atendimento da mesa

A tela de uma mesa segue a ordem operacional:

1. abrir atendimento;
2. adicionar itens e enviar rodada;
3. acompanhar produção das rodadas;
4. pedir a conta;
5. registrar pagamentos;
6. concluir e liberar a mesa quando o saldo chegar a zero.

O estado `settling` continua sendo a transição existente para o acerto da conta. Fechamento continua disponível somente quando o saldo é zero conforme as regras atuais.

Pessoas/divisão, transferência, cancelamento de comanda vazia, estado administrativo e QR continuam disponíveis, mas ficam em painéis secundários nativos para não competir com a próxima ação do atendimento. O conteúdo permanece montado e todas as actions server-side originais foram preservadas.

Nenhuma state machine, regra financeira, regra de sessão, autorização ou lógica de rodada foi modificada.
