# PagBank — revisão de finalização

O PR foi separado da branch fiscal #1248 e integrado à base atual, conservando o acompanhamento Expresso e acrescentando a entrada de CPF para PagBank.

Correções: download autenticado de QR restrito à origem exata da API, sem redirecionamento; renovação de token somente nos cinco minutos finais, evitando renovar tokens válidos de uma hora a cada consulta; configuração manual Mercado Pago e troca de provedor na mesma transação, com serialização por unidade e rollback em falha de validação. Cópias SQL/migração mantidas idênticas. Os testes adicionados simulam a API, sem cobranças reais.

## Gate externo ainda pendente
Não há variáveis PAGBANK na Vercel e a migração 20261013080000 não está aplicada no projeto idyjinpeijyqcejnunwm (verificados por leitura). Antes de mesclar/liberar: cadastrar aplicação Connect sandbox, configurar credenciais em armazenamento seguro, aplicar a migração revisada, verificar OAuth, QR, confirmação/webhook, reconciliação, expiração, desconexão e regressões Mercado Pago. A migração não foi aplicada em produção nesta preparação. Nenhuma conexão, cobrança, pagamento ou alteração de loja real realizada.

## Limites
Testes com API simulada não substituem homologação PagBank. A atualização otimista dos tokens protege a gravação, mas chamadas simultâneas à renovação externa ainda precisam de homologação de concorrência. A revisão não habilita o PagBank nem autoriza o módulo fiscal incidental.
