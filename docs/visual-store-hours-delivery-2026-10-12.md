# VISUAL-06 — Dados da loja, Horários e Entrega

Continuidade de #1226/#1234; base4ae78c8da17ab2db1a62eb0da6d3382f506fd3bd.

## Entrega

Regras da entrega, preferência de histórico do entregador e cadastro/edição de bairro mantêm formulários e ações independentes. Cadastro sob demanda e lista de bairros substituem grade rígida de duas áreas. Taxa neutra, situação12px e ajuda13px. IDs únicos nos editores repetidos; UF, taxa, pedido mínimo e minutos adicionais preservados. Pausar/ativar continuam acessíveis, e remover bairro exige confirmação contextual.

O controle de histórico continua sendo salvo exclusivamente pelo serviço existente; nenhuma preferência de acesso foi alterada. Os bairros continuam renderizados quando entrega está desativada, sem novo bloqueio de módulo na página.

## Loja e horários

Cabeçalhos24px, seções18px e grade2colunas/1no celular. Dados públicos opcionais recolhidos sem desmontar campos; link/slug público preservado e fora do formulário. Barra de salvar dados considera a navegação inferior móvel. Botões existentes já têm estado pendente pelo useFormStatus; não foi criado wrapper redundante.

FormDisclosure abre a seção de informações públicas quando um campo dispara validação nativa. Teste de navegador do componente real hidratado: preencher URL inválida, recolher e validar; seção reabre e foco vai para websiteUrl. Sem esse tratamento, a seção permanecia fechada e o erro não ficava acessível. Não altera validação do servidor nem valores.

Novo período sob demanda; lista de horários, fechamento no dia seguinte e identificador da remoção preservados. Remover período exige confirmação pelo dia e horário. Sem alterações às regras de funcionamento, timezone, checkout, preços ou taxas da loja.

## Verificação

2.739 testes/416arquivos; build/typecheck aprovados; lint0erros/8avisos preexistentes. Novo teste de render cobre campos/valores do perfil, slug não editável, horário noturno, entrega desativada, política de histórico separada, bairros individuais e listas vazias. Contrato de texto da cobertura atualizado para a orientação sobre bairros, mantendo ausência de configuração por distância e maxDistanceKm.

Componentes reais com serviços/ações e dados simulados:36 combinações (3páginas×6larguras360/390/768/1024/1366/1920×2temas). Sem overflow fechado/aberto; payload e preenchimentos preservados ao recolher/reabrir (inclui horário/dia seguinte, bairro, taxa e minutos). Summary/foco/Enter verificados; capturas de referência avaliadas. Não certifica hidratação autenticada, salvamento em produção ou teclado físico do celular. Nenhum dado, horário, bairro, taxa ou permissão real foi salvo/removido durante QA.

## Continuidade

Próxima família: configurações de pagamentos, WhatsApp, fluxo de pedidos e impressão, por tarefas independentes. MASTER/diagnóstico seguem abertos; demais módulos e homologação autenticada ampliada pendentes.
