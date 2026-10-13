# VISUAL-06 — Promoções e Sugestões

Continuidade de #1226/#1234 após PR #1235. Base d43a15799eba2e88acc09e09c5955f34afd65ded.

## Mudanças

- Nova promoção sob demanda; campanhas e programação cadastradas acessíveis sem atravessar o formulário de todos os produtos.
- Nome/texto, preço, datas e horários usam os controles compartilhados. Dias/horário/período de cada produto em uma única seção recolhível, mantendo todos os inputs no mesmo formulário.
- Preço promocional neutro e programação por linha; seleção destaca o produto sem ativar automaticamente ou alterar seus preços.
- Remover promoção exige confirmação com nome da campanha e explicação sobre os preços normais preservados; mesma ação/groupId.
- Sugestões distingue regra por categoria de Sugestões gerais. O seletor de origem continua consulta GET; salvamentos específicos e gerais permanecem separados.
- Grade de regra específica corrige três campos em duas colunas: seleção/título/ordem no desktop; uma coluna no celular. IDs únicos nos controles repetidos; título e seleções existentes preservados.
- Regras, serviços, prioridade entre programação de promoções, fallback das sugestões, categorias inativas, preços, fotos e permissões permanecem iguais.

## Evidências

2.734 testes em415 arquivos; lint0erros/8avisos preexistentes; build e typecheck aprovados. Novos casos de render verificam programação individual, groupId da remoção, separação de payloads, título existente, categorias desabilitadas e catálogo vazio. Contrato textual antigo atualizado de Sugestões globais (fallback) para Sugestões gerais.

QA local dos componentes reais, com dados/serviços/ações simulados:72 combinações (seis páginas do Cardápio,6 larguras360/390/768/1024/1366/1920 e2 temas). Abrir/recolher, foco/Enter, sem overflow horizontal, FormData e valores preenchidos preservados; inclui seleção de produto/dia, preço/data/hora e título de sugestão. Capturas de referência avaliadas. Não certifica hidratação autenticada, salvamento produtivo nem teclado físico do celular. Não criamos ou removemos promoções reais nem salvamos sugestões da loja.

## Próximo lote

Dados da loja, horários e entrega/bairros/taxas, conforme diagnóstico #1234. A MASTER e o diagnóstico transversal continuam abertos; demais páginas e homologação autenticada ampliada permanecem pendentes.
