# Barra de pagamento do PDV — 10/10/2026

Proposta aprovada pelo usuário: pagamento, recebido, troco, total e finalização numa barra inferior fora do carrinho. Itens do carrinho mais compactos; pagamentos divididos numa janela própria.

## Implementação

- O formulário envolve a área de trabalho e a barra inferior; catálogo e carrinho mantêm rolagem independente no desktop.
- A barra não faz parte da área de rolagem dos itens. Tem botões para as formas habilitadas, recebido em dinheiro, troco/valor faltante, total e finalização.
- Detalhes e parcelas ficam em diálogo modal nativo, usando o mesmo estado/validação da venda. O total, benefícios, limite de dez parcelas e bloqueio de pagamentos inválidos são preservados.
- A busca do catálogo impede submissão implícita com Enter. Os demais controles de operação são botões com type=button.
- Linhas do carrinho têm menos padding e separação, mantendo controles maiores para toque.
- A barra reorganiza os campos em telas estreitas e fica acima da navegação inferior no mobile. A homologação autenticada do navegador ainda depende da disponibilidade da observação da sessão.

## Validação

Suíte completa: 2.714 testes em 409 arquivos passaram. Build local concluído. O contrato de layout foi atualizado para verificar que recebido e finalização estão depois do fechamento do carrinho, dentro do formulário e fora da rolagem. Cinco testes desse contrato passaram após a atualização.

Sem nova migração, cobrança ou criação de pedidos nesta alteração. O relatório registra validação de código; não representa uma conferência visual que a proteção do navegador tenha impedido.
