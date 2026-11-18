# Lote 01 — Fundação visual e correções gerais do painel

Preparado em 17/11/2026 sobre a main `095aa8dd`. Fonte UX2: árvore `dfa57c85`.
Branch: `release/ux2-fundacao`. Estado: preparado para revisão; não publicado.

## Escopo

- Tokens para seleção e links neutros; fundo sem brilho laranja; controles, abas, tema e campos compartilhados.
- Logo acompanha tema claro/escuro, e script de tema permanece dentro do body.
- Conteúdo do celular usa overflow-x: clip para permitir barras sticky; ajuste da barra inferior e do guia de primeiros passos.
- Mesmo horário no primeiro HTML e na hidratação do quadro de pedidos, nos fluxos padrão e personalizado; o relógio continua atualizando no navegador.
- Telas de erro em português, com orientação para conferir o pedido antes de repetir. Não prometer que uma gravação foi salva quando a causa do erro é desconhecida.
- Contraste das ações de pedido e associação ARIA da busca de bairros corrigidos.

São 19 arquivos de produto, este relatório, a configuração de quebra de linha das fontes e dois verificadores visuais com caminhos compatíveis com Windows. Não inclui arquivo de banco, workflow, script de publicação, dependência, segredo ou integração. As correções atuais de WhatsApp e VPS da main permanecem intactas.

As mudanças específicas de layout de cardápio, checkout, PDV, Salão e gestão ficam nos lotes posteriores. Algumas telas ainda usarão o estilo anterior até o respectivo lote; não declarar padronização de todo o produto a partir deste lote.

## Conferência antes de publicar

- [ ] CI e Browser Homologation do commit exato aprovados.
- [ ] Homologação com banco fictício do commit exato, com roteiro crítico cliente → checkout → painel → conclusão e venda PDV até recebimento.
- [ ] Conferência em 360, 390, 768 e 1366 px, temas claro e escuro.
- [ ] Uso pelo responsável no computador e celular, conforme o critério já definido em `docs/ux2/ESTADO.md` na integração.
- [ ] Aprovação do responsável para publicar este lote; merge na main publica automaticamente.

## Volta

Reverter apenas o commit deste lote por PR. Não há alteração de banco a desfazer.
