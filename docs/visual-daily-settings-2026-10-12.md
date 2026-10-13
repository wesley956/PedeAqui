# VISUAL-06 — Cardápio, Entregadores, Salão e Caixa

Continuidade de #1226/#1234. Base253efd0b5f09c43412b4bc94ba4e218456c7a55e.

## Mudanças

- Cardápio digital usa o layout compartilhado de configurações. Recebimento/pausa continua separado da aparência/publicação; logo/capa sob demanda, controles com rótulos e salvar acessível. Upload, remoção de imagem, arquivos originais e campos/defaults preservados.
- Entregadores: Novo sob demanda, resumo de serviço/capacidade/acesso e seções independentes para editar ou preparar acesso móvel. Nome/telefone/capacidade com rótulos persistentes e IDs únicos; ações, idempotencyKey, useActionState, capacidade mínima pelas entregas ativas, flags ativo/em serviço e guard de telefone preservados. Não foi gerado link/PIN nem enviado WhatsApp.
- Salão: cadastro de estrutura sob demanda, código/nome/capacidade/área/QR preservados, links reais das mesas e mesma autorização DINING_MANAGE. Não abre atendimento nem conta automaticamente.
- Caixa: cadastro sob demanda e edição apenas do caixa escolhido; resumo ativo/livre/turno aberto preservado. Mesma autorização CASH_MANAGE e updateCashRegisterAction.bind(null, register.id), sem modificar turnos/movimentos.
- FormDisclosure mantém os campos montados e abre diante de validação nativa, reutilizando a correção validada no lote anterior. Feedback dos formulários de entregador recebe role alert/status.

## Verificação

2.743 testes/416arquivos; lint0erros/8avisos preexistentes; build/typecheck aprovados. Render adicional verifica publicação separada da pausa, imagens originais/campos, IDs dos entregadores, idempotência, acesso desabilitado sem telefone, autorização de salão/caixa e separação entre cadastro físico e atendimento/turno.

QA de sete páginas de configuração (as quatro deste lote e três anteriores) com componentes reais e serviços/ações/realtime simulados:84 combinações de6larguras360/390/768/1024/1366/1920 e2temas. Sem overflow fechado/aberto, valores/FormData preservados, teclado/foco/Enter e capturas de referência avaliados. Não certifica hidratação autenticada de todos os fluxos, geração de credenciais, gravações produtivas ou teclado físico do celular. Nenhuma configuração, mesa, caixa, entregador, imagem ou acesso real foi criado/alterado durante QA.

## Continuidade

Próxima família: Pagamentos, WhatsApp, Fluxo de pedidos e Impressão, mantendo tarefas e salvamentos independentes. MASTER/diagnóstico permanecem abertos; demais áreas e homologação autenticada ampliada pendentes.
