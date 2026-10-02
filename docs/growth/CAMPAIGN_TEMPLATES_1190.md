# Campanhas configuráveis no PedeAqui — #1190

## Fluxo entregue no código

Em Crescimento > Campanhas, a unidade cria um modelo de marketing de texto em português, opcionalmente com `{{1}}` para nome do cliente. O envio do modelo para análise não dispara uma campanha. A tela consulta a Meta para exibir status e oferece somente modelos MARKETING, APPROVED e compatíveis com o worker atual. Imagens, cabeçalhos, rodapés e botões não são selecionáveis nesta versão.

A campanha salva o texto aprovado como versão canônica; a prévia não é uma oferta independente do modelo enviado. Escolher envio após confirmação salva um rascunho; escolher data/recorrência mantém o contrato existente de ativação do agendamento ao salvar, agora explicado no formulário. Rascunhos internos existentes continuam editáveis.

O serviço exige RBAC Growth, acesso aos módulos Growth e Conversas, unidade selecionada e campanhas habilitadas para gravações. WABA e referência de credencial vêm da configuração dessa organização/unidade, nunca do formulário. O provider consulta por nome antes de criar: uma tentativa repetida reaproveita o mesmo conteúdo; conteúdo diferente exige outro nome. A auditoria registra ator, unidade, ID externo do modelo, texto e status; o ID externo fica no payload, pois audit_logs.entity_id é UUID local.

Antes de enfileirar e antes de enviar, a aplicação consulta aprovação/categoria/formato/parâmetros na Meta. O worker também compara o texto com a versão da campanha/ocorrência: mudança exige revisão. Falha temporária mantém o contrato de retry; suspensão/rejeição/incompatibilidade termina como falha permanente. Uma mensagem já aceita permanece idempotente. Consentimento, supressões e limites existentes continuam obrigatórios.

## Respostas

O webhook preserva `context.id` como `whatsapp_reply_to_message_id`. O resolver exige outbound system enviado na mesma organização, unidade e conversa e destinatário de campanha com mesmo cliente, ID de provider e identidade campanha/destinatário. Apenas respostas vagas com essa correlação recebem o caminho comercial do cardápio. Não é inferido contexto apenas por campanha recente. Sessões ativas, ownership humano, emprego/fornecedor explícitos e pedidos de atendente prevalecem. O shadow router usa a mesma regra.

## Validação e liberação

Build, typecheck e lint locais; suíte completa de 2.614 testes passou. Após pequenos ajustes na prioridade de atendimento humano e auditoria, testes relevantes foram repetidos. O teste antigo do campo manual foi atualizado para verificar o novo seletor. Os testes de drift usam arquivos de baseline e não acessam banco remoto.

A homologação autenticada do painel e o piloto real Meta permanecem pendentes. A ferramenta CLI de browser não está instalada neste ambiente; o build não prova funcionamento autenticado ou permissões reais da Meta. Nenhum modelo real foi submetido, nenhuma campanha enviada, nenhuma recorrência/credencial/consentimento de produção alterado. PR fica em rascunho até revisão, CI e homologação conforme #1051/#1068.

## Rollback

Reverter este PR. Não há migration nem backfill. Modelos já criados futuramente na Meta permanecem externos e devem ser revisados separadamente; reverter código não os apaga. Não há alteração de flags globais, impressão, pedido ou pagamento neste lote.
