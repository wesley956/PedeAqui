# Publicação Expresso — PR #1256

Escopo: cardápio público, gaveta do produto e checkout único do protótipo Expresso.

Revisão do commit 710f19d552f55cd400ab8d173eed2623c05721ac antes da publicação:

- Ações de quantidade e benefícios validam e salvam partes completas no servidor. Campos incompletos não passam nessa validação. O formulário agora atualiza a base do reset automático do React antes das ações, preservando os valores atuais em memória enquanto o checkout permanece montado. Nenhum dado pessoal novo é persistido no navegador. Uma recarga completa continua recuperando apenas os dados válidos salvos no servidor.
- A gaveta usa dialog.showModal(): o navegador restringe o foco e impede interação com o conteúdo de fundo. Escape, botão fechar e clique fora retornam pela navegação; o foco anterior e a rolagem do documento são restaurados na desmontagem.
- Serviços canônicos, regras de preço e pagamento, imagens originais e isolamento de lojas permanecem sob as validações existentes.

Validação local: 2.788 testes em 428 arquivos passaram; lint sem erros, com oito avisos preexistentes; build de produção passou. Verificação em navegador isolado com componentes reais e ações simuladas: campos incompletos após quantidade/cupom; Tab/Shift+Tab, Escape e restauração do foco da gaveta. Nenhum carrinho, pedido ou pagamento real foi criado para homologação.
