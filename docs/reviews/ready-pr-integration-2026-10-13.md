# Integração dos PRs prontos — 13/10/2026

Solicitação: mesclar todos os PRs prontos em sequência, preservando o funcionamento e a coerência do sistema.

## Ordem e base

Base de produção: `4f837c14bd533c11d1598714ece075d669a5d2e2`.
Branch de preparação: `codex/integrate-ready-prs-2026-10-13`. As integrações intermediárias ficam nesta branch; a publicação ocorre por um único PR final para `main`, após os gates do conjunto. Isso evita publicar estados intermediários e disparar uma série de deploys de produção.

| Ordem | PR | Conteúdo |
| --- | --- | --- |
| 1 | #1240 | Escala de fontes, pesos e raios |
| 2 | #1241 | Cabeçalho compartilhado |
| 3 | #1242 | Estrutura móvel e barra compacta do PDV |
| 4 | #1243 | Ícones vetoriais |
| 5 | #1244 | Cores por tema e contraste |
| 6 | #1245 | Cabeçalhos nas páginas e controles na cor da marca |
| 7 | #1246 | Confirmação de exclusão no tema |
| 8 | #1247 | Gráfico de saldo diário no Financeiro |
| 9 | #1221 | Conta financeira para pagamentos personalizados |
| 10 | #1251 | Lista e ações rápidas do Cardápio Expresso |
| 11 | #1252 | Total ao vivo e barra fixa do produto |
| 12 | #1253 | Checkout em uma tela e separação dos pagamentos |
| 13 | #1254 | Contato da loja e prazo do Pix no acompanhamento |
| 14 | #1219 | Progresso por quantidade e passagem entre grupos de sabores |

Os PRs visuais mantêm a sequência original. A correção #1221 tem a migração `20261007231438` já aplicada no Supabase `idyjinpeijyqcejnunwm`; o mapeamento `custom_clearing` foi confirmado por leitura. Nenhuma migração foi reaplicada nesta integração.

## Revisões e correções

- O Cardápio Expresso estava empilhado sobre Fiscal e PagBank. Seu conteúdo foi reaplicado sobre a base visual, sem introduzir esses provedores. Os quatro PRs receberam novos heads e gates completos; o conflito no acompanhamento conservou contato da loja e validade do Pix sem trazer o formulário de CPF do PagBank.
- A barra de preço do produto não incluía o acréscimo do vasilhame. Agora o soma somente em `with_container`, antes de multiplicar pela quantidade. Troca simples, adicionais distintos, adicionais por quantidade e divisão mantêm os valores cobrados; o servidor continua sendo a autoridade final.
- #1219 tinha conflitos nos três arquivos de interface. Foram combinadas as instruções de quantidade/progresso/continuação com os novos tokens, IDs por grupo e barra de preço, preservando a ausência de numeração das etapas. Ações, grupos e preços existentes permanecem canônicos. Novos casos renderizados cobrem incompleto, completo e mínimo flexível.
- A barra compacta do PDV escondia o troco no celular. Quando há valor recebido em dinheiro, o resumo do troco continua visível com a barra recolhida; o pagamento e os campos permanecem montados.
- O checkout pediu e-mail do Pix em Pagamento, mas o erro ainda reabria Identidade. E-mail ausente ou inválido agora retorna a Pagamento; Pix é mantido selecionado se estiver entre os métodos disponíveis. A validação usa código específico para e-mail de pagamento e não altera a validação de identidade/WhatsApp. Os contratos de teste de recuperação foram atualizados para essa decisão, sem afrouxar a exigência de e-mail do Pix.

## Evidências

- Gates CI e Browser Homologation verdes em todos os heads integrados; os cinco PRs reaplicados/resolvidos foram novamente validados.
- Validação local final: 2.784 testes em 428 arquivos, lint sem erros (oito avisos anteriores) e build de produção aprovados. O gate remoto do PR final continua obrigatório antes da publicação.
- Chromium local com componentes React reais hidratados, ações de produção desativadas: quatro fluxos × seis larguras (360, 390, 768, 1024, 1366, 1920) × dois temas = 48 combinações. Verificados confirmação única, Voltar/Escape sem envio; preço de adicionais/vasilhame/quantidade; progresso e foco ao continuar entre grupos; escolha de pagamento, troco, retenção ao recolher e ausência de overflow no PDV.
- Os testes locais não criaram pedidos, pagamentos ou registros, não enviaram WhatsApp e não imprimiram. O gate público de navegador também não certifica todos os formulários privados autenticados.
- O tree de cada conjunto remoto foi comparado ao código local verificado. Fotos não foram substituídas ou recomprimidas.

## PRs ainda sem liberação

| PR | Pendência confirmada |
| --- | --- |
| #1248 Fiscal/Focus NFe | Homologação com CNPJ, certificado e CSC antes da liberação; adiciona worker/cron fiscal real |
| #1249 PagBank | Migração `20261013080000` ausente no projeto atual; configuração Connect e homologação sandbox obrigatórias |
| #1224 Documentação Codex | Conflitos com a base atual e referências de estado antigas a reconciliar |
| #1204, #1205 WhatsApp | Rascunhos, conflitos e Browser Homologation com falha nos heads consultados |
| #1171 Drift | Conflitos e CI com falha; configuração do gate remoto pendente |
| #1191 Campanhas | Rascunho, conflitos e homologação autenticada/piloto Meta pendentes |
| #1091 Print Agent Windows | Conflitos e gate físico Windows explicitamente NO-GO até evidência real |
| #740 Link público | Conflitos e CI com falha; precisa revisão contra os recursos atuais |

Esses nove PRs não são liberados por checks verdes de outra branch. Nenhuma integração financeira, cadastro externo, envio ou instalação física foi ativada para contornar as pendências.

## Publicação

O PR final deve passar CI e Browser Homologation no seu head exato antes do merge. Conferir deployment READY/production no SHA do merge e aliases `www.pedeaqui.pp.ua`/`pedeaqui.pp.ua`, `/api/health` e erros de runtime na janela observada. O diagnóstico visual #1234 permanece aberto para áreas e homologações não cobertas.
