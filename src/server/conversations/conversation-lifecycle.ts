export const DEFAULT_CONVERSATION_AUTO_CLOSE_MESSAGE =
  "Como não tivemos novas mensagens, vou encerrar este atendimento por enquanto. Quando precisar, é só chamar novamente 😊";

export const MIN_CONVERSATION_AUTO_CLOSE_MINUTES = 5;
export const MAX_CONVERSATION_AUTO_CLOSE_MINUTES = 24 * 60;

export function validConversationAutoCloseMinutes(value: number) {
  return Number.isInteger(value)
    && value >= MIN_CONVERSATION_AUTO_CLOSE_MINUTES
    && value <= MAX_CONVERSATION_AUTO_CLOSE_MINUTES;
}
