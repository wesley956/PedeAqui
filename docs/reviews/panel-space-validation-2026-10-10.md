# Validação do painel — 10/10/2026

## Conferência no navegador

Prévia autenticada `6474ca8`, viewport de 1363 × 936 CSS px.

- Menu expandido: 216 px. Ícone em x=10, y=14; alvo de 40 × 40 px.
- Menu recolhido: 64 px; nomes acessíveis preservados. Reabertura conferida.
- Topo: 56 px; largura do documento: 1363 px, igual à viewport.
- Painéis de conta e operação abertos e controles existentes acessíveis, sem submissão.
- PDV habilitado: montagem de seis itens, total visual de R$ 90,10. Nenhuma finalização executada.
- Carrinho: área de itens com 592 px e conteúdo de 995 px. Rolagem até 403 px.
- Finalização: botão em y=863–911 antes e depois da rolagem, dentro da viewport.
- Catálogo e carrinho possuem rolagem independente.

A montagem foi apenas em estado local, sem criar pedido ou pagamento. A prova visual foi disponibilizada separadamente.

## Correções seguintes

- Projeções inicial, histórico/recente e incremental incluem `payment_method_snapshot`.
- Seleção respeita 50 IDs distintos e rejeita IDs fora da lista elegível atual.
- Seleção geral usa os primeiros 50 pedidos do filtro; informa o limite e permite liberar espaço no lote ao desmarcar um item.
- Controles de seleção ficam indisponíveis durante processamento, e pedidos adicionais não podem ser marcados quando o lote está cheio.
- Marca da barra lateral usa a variante oficial para fundo escuro.

As regras de elegibilidade e os serviços canônicos de conclusão foram preservados. A ampliação da conclusão em lote para fluxos com mais de duas etapas permanece no lote seguinte; esta correção não habilita esse recurso para a Dona Maria.

## Limites da validação

Sem homologação transacional de venda ou conclusão em lote, sem pedidos ativos na tela observada, sem teste físico de Windows em 125%, celular ou touch. O teste no navegador não substitui esses cenários. O PR permanece em revisão, sem merge ou publicação em produção.
