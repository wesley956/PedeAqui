# Adicionais no produto público

Issue lógica: **[299]**.

Cada grupo mostra nome, descrição, obrigatório/opcional, mínimo, máximo e contador de seleção. Para grupos de escolha única, radio + `required` cobre a validação nativa. Para múltiplas escolhas, o componente impede exceder o máximo e usa `setCustomValidity` para comunicar mínimo não atendido antes da submissão.

Essa validação melhora a experiência, mas não é autoridade de negócio. `addToCartAction` e os serviços de carrinho continuam recalculando produto, adicionais e regras no servidor. Produto esgotado desabilita todos os controles e o envio.
