# VISUAL-06 — Primeira aplicação nos editores do Cardápio

Relacionado a #1226 e #1234. Base: c9e8741aed6f9d18207fb2868a1a14a10105b4c5.

## Comportamento

- Categorias: Novo sob demanda; lista com nome, ordem e situação; editores e duplicação preservados; remoção em seção própria com confirmação existente.
- Adicionais: Novo grupo e Nova opção sob demanda; grupos com regra e quantidade de opções; opções com nome/preço e gerenciamento recolhido. Formulários nativos permanecem montados ao recolher.
- Produtos: título24px, seção18px e ajuda13px; Salvar produto separado de Salvar vínculo do grupo. Novo e editar compartilham layout responsivo. Barra de salvar considera a navegação inferior no celular e safe area.
- IDs explícitos e únicos nos editores repetidos de categoria, grupo/opção e vínculo do produto; names/defaults, divisão igual/manual, quantidade, disponibilidade e alcance matching_name preservados.
- Fotos, ações/serviços, autenticação, permissões, preços e regras de pedido não foram alterados.

## Verificação

História: abrir cadastro/edição → formulário correto → dados existentes ou preenchidos → serviço canônico já existente. Esta alteração organiza a interface; serviços não mudaram.

2.731 testes em415 arquivos aprovados. Lint sem erros,8 avisos preexistentes. Build aprovado. Typecheck independente inclui testes e foi corrigido após apontar acesso possivelmente indefinido à fixture (sem impacto em código de produção).

Componentes reais renderizados com serviços/ações simulados e dados fictícios: quatro páginas (categorias, adicionais, novo produto e editar produto),6 larguras360/390/768/1024/1366/1920 e2 temas claro/escuro:48 combinações. Sem overflow horizontal fechado/aberto; payload de FormData idêntico antes/depois de abrir; campo digitado preservado ao recolher/reabrir; summary utilizável por teclado. Capturas de referência inspecionadas. Este teste não certifica gravação no banco, hidratação autenticada ou comportamento do teclado físico do celular.

Teste de render adicional verifica IDs únicos/labels, valores existentes, defaults e formulários independentes. Contrato visual antigo do botão de vínculo atualizado para o novo nome; ação linkModifierGroupAction preservada.

## Continuidade

Este lote cobre produtos/categorias/adicionais. Promoções/sugestões, outras configurações, telas de gestão, plataforma e público continuam no diagnóstico #1234 e lotes anteriores. Não encerrar a MASTER nem declarar todo o sistema redesenhado por esta entrega. Homologação autenticada ampliada permanece como acompanhamento.
