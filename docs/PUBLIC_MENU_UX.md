# Cardápio público — hierarquia mobile-first

Issue lógica: **[297]**.

A entrada do cardápio mostra primeiro identidade e situação do restaurante, depois entrega/retirada/prazo/mínimo e somente então busca, categorias e produtos. O carrinho permanece como ação explícita no cabeçalho e ocupa largura total em telas pequenas.

A cor do restaurante é aplicada por variáveis CSS derivadas do schema público já validado. Superfícies, textos, bordas e espaçamentos usam os tokens do PedeAqui. A assinatura PedeAqui permanece canônica e discreta no rodapé.

Busca e filtros continuam client-side apenas para apresentação; o catálogo público continua vindo do RPC e do `PublicMenuService`. Nenhuma regra de disponibilidade, preço ou checkout foi alterada.
