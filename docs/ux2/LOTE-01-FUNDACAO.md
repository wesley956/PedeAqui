# Lote 01 — Fundação visual e correções gerais do painel

Preparado em 17/11/2026 sobre a main `095aa8dd`. Fonte UX2: árvore `dfa57c85`.
Branch: `release/ux2-fundacao`. Estado: preparado para revisão; não publicado.

## Escopo

- Tokens para seleção e links neutros; fundo sem brilho laranja; controles, abas, tema e campos compartilhados.
- Logo acompanha tema claro/escuro, e script de tema permanece dentro do body.
- Conteúdo do celular usa overflow-x: clip para permitir barras sticky; ajuste da barra inferior e do guia de primeiros passos.
- Mesmo horário no primeiro HTML e na hidratação do quadro de pedidos, nos fluxos padrão e personalizado; o relógio continua atualizando no navegador.
- Telas de erro em português, com orientação para conferir o pedido antes de repetir. Não prometer que uma gravação foi salva quando a causa do erro é desconhecida.
- Na área pública, a recuperação retorna ao cardápio da mesma loja; não encaminha o cliente ao painel administrativo.
- Contraste das ações de pedido e associação ARIA da busca de bairros corrigidos.
- Totais de pedido e links no histórico do cliente com contraste legível; gráfico de vendas rolável acessível pelo teclado.

São 23 arquivos de produto, este relatório, a configuração de quebra de linha das fontes e dois verificadores visuais com caminhos compatíveis com Windows. Não inclui arquivo de banco, workflow, script de publicação, dependência, segredo ou integração. As correções atuais de WhatsApp e VPS da main permanecem intactas.

As mudanças específicas de layout de cardápio, checkout, PDV, Salão e gestão ficam nos lotes posteriores. Algumas telas ainda usarão o estilo anterior até o respectivo lote; não declarar padronização de todo o produto a partir deste lote.

## Conferência antes de publicar

- [x] CI do código `05ea0820` aprovado.
- [ ] Browser Homologation adicional: ainda instalando navegadores nesta atualização; conferir o resultado atual no PR.
- [x] Homologação com banco fictício do código `05ea0820`, com roteiro crítico cliente → checkout → painel → conclusão e venda PDV até recebimento.
- [x] Auditoria automática em 360, 390, 768 e 1366 px, temas claro e escuro.
- [ ] Uso pelo responsável no computador e celular, conforme o critério já definido em `docs/ux2/ESTADO.md` na integração.
- [ ] Aprovação do responsável para publicar este lote; merge na main publica automaticamente.

## Volta

Reverter apenas o commit deste lote por PR. Não há alteração de banco a desfazer.

## Evidências automáticas

Aplicação `05ea0820b0822b435c6b689a06b081980e9c624c`, roteiro `01f34ae59f9b6f85178b1598d85b83e8be1b48fc`: 231 estados/verificações, 24 passos do fluxo crítico e zero falhas. Confirmados criação de pedido novo pelo cliente, identificação do mesmo pedido no painel, produção, retirada, pagamento, conclusão, acompanhamento público, venda com troco e fechamento do caixa.

[Evidências do lote](https://github.com/wesley956/PedeAqui/tree/ux2/evidencias/release_ux2-fundacao): `target.json`, `COMMIT`, `HARNESS_COMMIT`, `results.json`, `failures.json` e capturas. O roteiro adapta apenas a CSP para o banco local; `src/` permanece no commit registrado. Salão e integrações reais estão fora desta validação.

O status externo Vercel falha por conta bloqueada também na main de referência. Não foi removido ou desativado. O destino de produção do projeto é a VPS.

Atualização posterior ao código `05ea0820`: apenas este relatório; nenhum arquivo da aplicação foi alterado.
