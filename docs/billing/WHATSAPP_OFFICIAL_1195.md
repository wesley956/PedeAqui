# Cobrança oficial por WhatsApp — #1195

Status: configuração, dispatcher e reserva durável preparados; **migration aplicada; envio desativado**.

O responsável informou em 02/10/2026 que ainda escolherá o número oficial.
Campanhas dos restaurantes (#1190/#1191) ficam fora deste lote.

## Entregue nesta base

- Empresa 360, somente Super Admin: cadastro explícito do responsável financeiro.
- DDI/DDD completos e consentimento confirmado quando o contato estiver habilitado.
- Metadados da assinatura preservados, escopo organization/subscription no servidor e controle otimista por updated_at.
- Identificação do administrador e instante da alteração no próprio registro do contato.
- Remetente da plataforma validado com referências dedicadas; nunca utiliza fallback do token de restaurante.
- Preparação dos cinco tipos de aviso com modelo aprovado UTILITY, idioma pt_BR e parâmetros compatíveis.
- Valor/data reais obrigatórios nos três avisos de vencimento; nenhuma chave Pix inventada.
- Reserva atômica por notification.id, com token exclusivo, revisões de subscription/invoice, escopo organization e revalidação do estado financeiro no banco.
- Tentativas duráveis; aceitação registra externalMessageId. Timeout, erro de rede, sucesso malformado ou falha de persistência não liberam nova tentativa. Uma reserva interrompida permanece sending e exige revisão.
- Histórico de tentativas no Empresa 360, com indicação de aceitação ou resultado incerto e formulário de reprocessamento somente para rejeições.
- Reprocessamento server-only: Super Admin + motivo + auditoria, somente rejeição explícita; unknown/sending/sent nunca são liberados. Histórico anterior permanece preservado.
- Verificação do vínculo Phone Number ID/WABA e bloqueio de número já usado por restaurante.
- Dispatcher opcional separado dos resultados Pix/painel. Desativado não abre DB nem chama Meta.

## Configuração proposta, ainda não aplicada

Variáveis server-only:

- PEDEAQUI_BILLING_WHATSAPP_ENABLED: ausente/false mantém desativado.
- PEDEAQUI_BILLING_WHATSAPP_PHONE_NUMBER_ID
- PEDEAQUI_BILLING_WHATSAPP_BUSINESS_ACCOUNT_ID
- PEDEAQUI_BILLING_WHATSAPP_ACCESS_TOKEN: token próprio da plataforma.
- PEDEAQUI_BILLING_WHATSAPP_TEMPLATES: objeto JSON com due_soon, due_today, overdue, suspended e reactivated, contendo os nomes efetivamente aprovados.

As três mensagens de vencimento usam {{1}} = valor e {{2}} = vencimento.
Suspensão/reativação usam zero parâmetros. Antes de ativar, conferir aprovação/categoria/formato real na Meta e vínculo do Phone Number ID à WABA oficial.

## Próximo lote obrigatório antes de envio

1. Escolher e conectar o número/WABA oficiais. Conferir que o número não pertence à configuração operacional de restaurante.
2. A migration passou no PostgreSQL temporário em três passagens e foi aplicada em 02/10/2026 como 20261002055804_subscription_whatsapp_delivery_ledger. Fonte gerada pelo CLI, nome de arquivo alinhado à versão efetiva retornada pelo provedor. A cópia append-only 225 permite bootstrap limpo; não aplicar ambas ao mesmo projeto.
3. Homologar destinatário controlado e modelos efetivamente aprovados, conferir consentimento, duplicidade/reexecução e só então ativar escopo autorizado.
4. Validar o histórico e a ação de reprocessamento do Empresa 360 com destinatário controlado. Interface e operação server-only exigem Super Admin; rejeição confirmada é a única ação disponível.
5. Obter evidência operacional de aceitação/rejeição controlada. Resultado sent significa aceito pela API Meta, não confirmação de leitura/entrega por webhook.

## Provas de desenvolvimento

- Testes de contrato/contato, transporte e dispatcher: 38 casos, incluindo concorrência simulada na reserva, persistência indisponível após aceitação, timeout, isolamento de remetente e autorização.
- Cenário PostgreSQL real e reversível adicionado à matriz Isolated Chaos, em três passagens. Só registrar PASS depois do workflow terminar.
- Supabase: schema aditivo aplicado; zero tentativas/envios, RLS ativo, acesso anon/authenticated negado e service_role autorizado. Nenhum segredo, destinatário real ou configuração de envio foi alterado. Nenhum POST para Meta foi executado nesta homologação.

Nenhuma fila/notificação existente foi marcada enviada por esta base. Nenhum token, destinatário real ou configuração de envio foi alterado. #1195 deve permanecer aberta.

Rollback: desativar PEDEAQUI_BILLING_WHATSAPP_ENABLED antes de reverter o aplicativo. Preservar tabelas/tentativas e reservas sending/unknown; nunca apagar histórico para liberar reenvio.
