## Decisões aprovadas em 12/10/2026
Fonte: PDFs "Diagnóstico visual completo — PedeAqui" e "Pedidos — redesenho", revisados com o responsável. Autorização: registrar detalhadamente e aplicar as melhorias.

## Objetivo
Mais espaço útil, menos cliques e identidade consistente no painel, preservando praticidade e funções existentes.

## Pedidos: combinação B + C
- Fila C como entrada padrão; Lista B como alternativa de conferência; preservar Quadro como alternativa compatível.
- Número, cliente, modalidade, pagamento, canal, etapa, tempo, total e próxima ação visíveis.
- Detalhe sob demanda; desktop ao lado, celular em tela própria. Conteúdo completo: itens, adicionais, observações, endereço/entrega, subtotal, taxas, descontos, total, pagamento, recebido/troco, impressão.
- Não ocupar espaço permanente com painel sem seleção.
- Prioridade: novos a confirmar antes de pendências administrativas de pedidos atendidos; ordenar mais antigos dentro da etapa; atraso destacado sem mudar etapa real. Não inventar urgência nem concluir automaticamente.
- Ações usam serviços e projeções canônicas; pagamento, modalidade, impressão, entrega manual/gerenciada, externo/iFood e modos standard/simplified/custom preservados.
- Filtros por etapa e busca; contagens coerentes com conjunto exibido. Sem rolagem horizontal obrigatória; botões utilizáveis por teclado/touch.

## Padrão visual compartilhado
- Cabeçalhos compactos: título 24px, ações na mesma linha, descrição opcional útil.
- Tipografia: título 24, seção 18, indicador 28, corpo/controle 14, apoio 13, etiqueta mínimo 12; cozinha mantém leitura grande.
- Uma família de cinzas, menu um tom acima; claro/escuro consistentes.
- Laranja em CTA, item ativo e foco; preço neutro. Verde sucesso/pago, âmbar atenção, vermelho atraso/erro, azul informação.
- Não impor um único CTA laranja quando ações independentes exigirem destaque; links devem parecer clicáveis.
- SVGs de traço consistentes em vez de símbolos digitados/emojis de interface. Reusar biblioteca/sistema sem downloads de dependência desnecessários.
- Raios 8 controles / 12 cartões / pílula etiquetas, espaços em múltiplos de 8; evitar sombra excessiva no escuro.
- Controles temáticos, estados vazios úteis, foco visível, toque >=44px.
- Não normalizar automaticamente nomes cadastrados.

## Escopo por área
1. Menu/topo: ícones; seletor de loja real; atalhos operacionais autorizados, RBAC/módulos preservados; distinguir ferramenta ativa de Mais ferramentas.
2. Início: remover títulos repetidos, cartões de atalhos neutros, contagens consistentes.
3. PDV: preservar barra fixa total/troco/finalizar; cartões inteiros clicáveis, miniaturas quando disponíveis, preços neutros. Dinheiro calcula troco, modalidades preservadas.
4. Cardápio: tabela/lista com miniatura, preço, disponibilidade e menu de ações; abas em linha responsiva; CRUD, sabores/adicionais/composição/promoções preservados.
5. Conversas: corpo >=13px; terceira coluna só quando necessária; preservar atendimento/handoff e contexto.
6. Caixa: saldo/abertura/fechamento claros; fechar turno neutro com confirmação apropriada.
7. Salão: mesa, tempo, consumo e conta destacados; tempos legíveis e alertas adequados, nomes originais.
8. Produção: leitura à distância; vermelho somente atraso; itens/observações destacados; indicadores sem ambiguidades.
9. Entregas: aguardando saída/em rota em destaque; atribuição e atualização claras; disponibilidade de cadastro preservada.
10. Estoque/fornecedores: formulários sob demanda, rótulos >=13px, ações reais.
11. Compras: passos neutros, número em círculo; sem sugerir links inexistentes.
12. Clientes: lista com iniciais e ações legíveis.
13. Financeiro: resumo/filtros primeiro, depois gráfico útil; calendário no tema; remover timezone técnico da UI sem mudar cálculo.
14. Crescimento: tokens comuns, preservar funções.
15. Equipe: nomes reais; ações no menu; exclusão/suspensão com confirmação.
16. Assinatura: estado vazio útil; Plano e unidades substitui rótulo ambíguo Escala; traduções.
17. Modo Movimento: tela aproveitada, menu recolhido, Urgente em vez de P1.
18. Login: benefício concreto e título moderado; Abrir/fechar mantém padrão funcional atual.

## Lotes e critérios de aceite
- [ ] Lote 1: Pedidos + base visual/menu.
- [ ] Lote 2: PDV, Conversas, Cardápio.
- [ ] Lote 3: Caixa, Salão, Produção, Entregas.
- [ ] Lote 4: Estoque, Fornecedores, Compras, Clientes.
- [ ] Lote 5: Início, Financeiro, Crescimento, Equipe, Assinatura, Plano/unidades, Movimento, Login e controles residuais.
Cada lote: branch/PR, lint/typecheck, testes existentes relevantes, build e homologação visual claro/escuro em desktop/tablet/mobile; documentar evidências e pendências antes de encerrar.
Matriz visual: 360, 390, 768, 1024, 1366, 1920px; teclado, toque, zoom e textos longos.

## Restrições de integridade
Não alterar preços, resolução de fotos, dados de clientes, contratos de APIs, estado de pedidos, autorização, módulos, Pix/WhatsApp, política de pagamento ou configuração de impressão. Não tocar migração de hospedagem #1225, DNS, compra ou banco neste trabalho visual. Fotos existentes apenas reutilizadas. Correções funcionais encontradas devem ser reproduzidas e registradas separadamente; não considerar diagnóstico antigo prova do estado atual.
## Conclusão
Esta issue só fecha após todos os lotes entregues e validados; iniciar Lote 1 agora.
