# Cobrança oficial por WhatsApp — #1195

Status: base de configuração preparada; **sem dispatcher e sem envio ativo**.

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
- Chave lógica determinística por notification.id. **Isso não substitui uma reserva atômica/durável nem certifica idempotência de envio.**

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
2. Implementar reserva durável e atômica por subscription_billing_notifications.id; concorrência não pode realizar dois POSTs.
3. Persistir estados de tentativa e externalMessageId. Timeout/aceitação ambígua nunca autoriza reenvio automático; exigir reconciliação/manual review.
4. Revalidar invoice/subscription/tenant e cancelar aviso obsoleto antes do envio.
5. Separar erros do dispatcher de criação e reconciliação do Pix/painel.
6. Implementar auditoria e reprocessamento apenas após rejeição comprovada sem entrega, preservando o histórico de tentativas.
7. Homologar com destinatário controlado, validar duplicidade/reexecução e só então ativar escopo autorizado.

Nenhuma fila/notificação existente foi marcada enviada por esta base. Nenhum token, destinatário real ou configuração produtiva foi alterado. #1195 deve permanecer aberta.

Rollback: reverter o PR; os metadados aditivos do contato podem permanecer desativados, sem qualquer dispatcher consumindo-os.
