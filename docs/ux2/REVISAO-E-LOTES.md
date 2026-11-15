# Revisão e preparação da integração UX2

Data: 15/11/2026. Fonte revisada: `86cf259c5`. Comparação: `origin/main` em `c07cea68`.
Trabalho isolado: branch `ux2/codex-validacao`, fora da pasta recebida do Claude.

## Escopo confirmado

As mudanças de WhatsApp dos PRs #1329 e #1330 já estão na main. Não devem ser reaplicadas como parte do UX2.
Na comparação atual não há alteração de arquivo em `supabase/`: as correções pendentes estão apenas no script local.

| Mudança de comportamento | Arquivos principais | Tratamento proposto |
| --- | --- | --- |
| Mesmo horário na primeira renderização dos pedidos | `pedidos/page.tsx`, `order-manager-board.tsx`, `custom-order-workflow-board.tsx` | Preservar no lote Pedidos; conferir os dois tipos de fluxo e atualização do relógio |
| Explicação para usuário sem vínculo de entregador | `entregador/page.tsx`, `delivery-operations-service.ts` | Preservar; testar usuário sem vínculo e entregador com vínculo |
| Erros de pagamento e fechamento voltam à mesa com mensagem | `dining/actions.ts`, `salao/[tableId]/page.tsx` | Preservar no lote Salão; testar saldo, caixa, pedido em preparo e sucesso |
| Link para abrir caixa em outra aba | `pdv/pos-shell.tsx` | Preservar; conferir que o carrinho continua e a venda funciona após abrir caixa |
| Planos do cadastro em cartões | `cadastro/page.tsx` | Preservar; mesmos destinos, sem mudança de preço ou cobrança |
| Logo acompanha tema e script do tema dentro do body | `pedeaqui-brand.tsx`, `app-shell.tsx`, `layout.tsx` | Fundação; conferir hidratação e mudança de tema |
| Capa da loja e posição das fotos | `menu/public-brand.tsx`, `m/[slug]/page.tsx`, CSS público | Lote cardápio; testar com e sem foto/logo e com marca própria |
| Estados traduzidos e nomes de recursos | telas platform e `escala/page.tsx` | Preservar; não mudar os códigos internos |
| Formulários de gestão com colunas flexíveis | Financeiro, Fiscal, Compras, ficha técnica e Vasilhames | Preservar no lote gestão; conferir campos e envio |
| Filtros e estações com botão secundário | catálogo e `kitchen-board.tsx` | Fundação visual; conferir seleção e atualização |
| Telas de erro em português | `error.tsx`, `global-error.tsx` | Fundação; revisar o texto que promete dados salvos sem saber a causa da falha |
| Correções SQL P-01/P-04 e concessões locais | `scripts/homologacao-local/*` | Só homologação; nenhuma migração de produção autorizada ou aplicada |

## Lotes e critérios

0. **Validação:** reprovar a auditoria por falhas encontradas, confirmar resultados das operações e impedir execução contra endereço remoto.
1. **Fundação e celular:** tokens, logo, tema, navegação, barras sticky e correções de largura; conferir 360, 390, 768 e 1366 px, temas claro/escuro.
2. **Pedidos e PDV:** relógio, avisos e apresentação. Conferir dinheiro/troco, Pix/cartão manual, caixa fechado/aberto, cancelamento e fluxo de pedido até conclusão.
3. **Cardápio:** produto e adicionais → carrinho → checkout → novo pedido identificado no painel → atendimento → acompanhamento público. O roteiro antigo não cria pedido no checkout: avança um pedido já existente.
4. **Salão:** confirmar P-01/P-04 no banco correto por leitura, preparar migrações separadas e validar rodada, conta e fechamento. Homologação corrigida não prova produção corrigida.
5. **Gestão, cadastro e plataforma:** formulários e textos, com conferência das operações relevantes.

Não fazer cherry-pick cego por PR: alguns commits misturam fundação, telas públicas e operações. Preparar cada diff sobre a main atual e revisar dependências. O merge na main publica automaticamente.

## Estado da execução nesta revisão

- Instaladas dependências somente na cópia isolada.
- Auditoria agora gera `failures.json` e retorna código de erro para falhas de navegação, fluxo, console, largura, controles cortados e acessibilidade grave.
- Caixa aberto/fechado, venda em dinheiro com troco e conclusão do pedido passam a exigir resultado visível. Cada avanço do pedido exige mudança no quadro de situação.
- O último passo do Salão testa a recusa do fechamento com pedido em preparo; não equivale a fechamento completo da mesa.
- A auditoria exige URL HTTP de loopback antes de abrir o navegador ou alterar dados.
- Docker não instalado, conforme confirmado pelo responsável. Testes com banco e navegação completa ainda pendentes; não marcar módulo como Validado.
- Preparação do banco ainda aceita migrações extras com erro. Resolver e executar a preparação em banco descartável antes de considerar o lote 0 concluído.

Nenhum lote de produto publicado por esta revisão.
