# Diagnóstico de apresentação — lote PA-DIAG-021 a PA-DIAG-025

Data de corte: 2026-08-22  
Master: GitHub #539  
Issues executadas neste lote: #561, #562, #563, #564 e #560

## Resultado

| Diagnóstico | Issue | Estado | Evidência |
| --- | --- | --- | --- |
| `PA-DIAG-021` indisponível, categoria vazia e cardápio fechado | #561 | Aprovado após correção | esgotado permanece consultável e bloqueado; inativo some; categoria vazia não aparece; fechado/pausado bloqueia inclusão no carrinho no cliente e no servidor |
| `PA-DIAG-022` ordenação | #562 | Aprovado após implementação | categoria usa `sort_order, name`; produto ganhou ordem editável e usa `sort_order, name` |
| `PA-DIAG-023` imagens | #563 | Aprovado para novos uploads | JPEG/PNG/WebP é validado, rotacionado, redimensionado e convertido para WebP; miniaturas continuam lazy e o detalhe prioriza apenas a imagem principal |
| `PA-DIAG-024` público sem login | #564 | Aprovado | requisição sem cookie retornou HTTP 200 e funções públicas mantêm execução para `anon` sem SELECT anônimo nas tabelas internas |
| `PA-DIAG-025` busca, categorias e detalhes | #560 | Aprovado | busca sem acento, filtro somente com categorias úteis, vazio contextual e detalhe público tenant-safe |

## Falhas reproduzidas e corrigidas

1. A página do produto oferecia “Adicionar ao carrinho” mesmo quando o menu informava “Fechado”. A interface agora desabilita opções, quantidade e envio, mostra a causa e o serviço do carrinho repete o bloqueio com horário e pausa atuais.
2. Categorias sem produtos públicos podiam aparecer nos botões de filtro e levar a um vazio confuso. A projeção SQL e o navegador de menu agora ocultam essas categorias.
3. Produtos eram ordenados apenas por nome. A migration `116_public_menu_readiness.sql` adicionou `products.sort_order`, índice e ordenação determinística; criar e editar produto expõem o campo.
4. A camada pública buscava `business_type` com uma segunda consulta administrativa após cada RPC. O contexto passou a fazer parte da projeção pública validada, eliminando essa ida extra ao banco para restaurantes.
5. Arquivos de até 4 MiB eram armazenados e entregues como recebidos. Novos uploads agora respeitam a orientação EXIF, limitam a dimensão conforme o uso e saem em WebP com qualidade 82.
6. O cabeçalho live mostrava execução da Function em `iad1`, enquanto o Supabase está em São Paulo. `vercel.json` passou a selecionar a região única `gru1`, suportada também no plano Hobby, para aproximar aplicação e banco.

## Evidência live sem login

Em `https://www.pedeaqui.pp.ua/m/santa-rita`, uma requisição sem cookie retornou:

- HTTP `200`, sem redirecionamento para login;
- `x-matched-path: /m/[slug]`;
- busca, identificação do estabelecimento, estado operacional e carrinho presentes no HTML;
- tempo antes da correção: TTFB `6,12 s`, total `6,17 s`, 39.277 bytes.

O detalhe de um produto público também retornou HTTP `200`, sem login. Antes da correção, levou TTFB `8,02 s` e ainda renderizou “Adicionar ao carrinho” enquanto o menu estava fechado; esse foi o caso que confirmou a falha operacional.

Na simulação local do build final, conectada ao projeto live e ainda sem sessão, cardápio e detalhe retornaram HTTP `200`. O detalhe respondeu em `0,68 s`, exibiu “Cardápio fechado” e não renderizou “Adicionar ao carrinho”. A medição definitiva de produção será repetida depois que o deployment deste lote estiver ativo em `gru1`.

## Evidência transacional live

Uma transação no tenant de demonstração criou três categorias (incluindo uma vazia) e produtos com ordens invertidas, estados disponível, esgotado e inativo. A projeção pública retornou:

- `category_order=true`;
- `product_order=true`;
- `empty_category_hidden=true`;
- `sold_out_visible=true`;
- `inactive_product_hidden=true`;
- `product_detail_available=true`;
- `cross_tenant_hidden=true`.

A mesma verificação confirmou `business_type`, horário e estado de recebimento no payload público, além de execução das duas RPCs para `anon`. Tudo terminou com `ROLLBACK`; nenhum item de diagnóstico permaneceu.

O índice novo é composto por unidade, categoria, ordem e nome, com filtro parcial para registros não removidos — o mesmo padrão das consultas do cardápio. Em `EXPLAIN (ANALYZE, BUFFERS)` a massa atual, com apenas 23 produtos, foi resolvida em `0,427 ms`; o planner preferiu varredura curta e ordenação em memória de 25 kB, comportamento esperado nesse volume. O índice fica preparado para o crescimento do catálogo.

Após a migration, os Advisors mantiveram os mesmos 35 avisos de segurança já conhecidos. O Advisor de performance passou a listar o índice recém-criado como ainda não utilizado, esperado imediatamente após a criação; não surgiu índice duplicado novo.

## Imagens e carregamento

Os quatro objetos já existentes no bucket tinham média de 106.597 bytes e máximo de 197.682 bytes, portanto não precisaram de migração destrutiva. Um arquivo sintético PNG de 2.400 × 1.800 foi processado para WebP de 1.600 × 1.200; o teste automatizado valida formato, dimensões e redução.

URLs HTTPS legadas continuam compatíveis. As imagens de cards têm largura/altura explícitas, carregamento lazy e decode assíncrono; somente a imagem principal do detalhe recebe prioridade. O Storage usa cache imutável de um ano porque cada upload recebe nome UUID novo.
