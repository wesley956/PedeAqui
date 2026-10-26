# Recuperação do atendimento WhatsApp

## Comportamento

- Reclamação explícita, atraso, falha no site, dúvida sobre conclusão e encomenda vão ao atendimento humano antes de criar outro pedido. Encomenda não confirma agenda, preço ou pagamento automaticamente.
- Durante a montagem, o encaminhamento usa a preservação canônica do checkout por até 12 horas. Perguntar a localização não troca o passo da montagem.
- Uma intenção desconhecida após fallback recente (últimos 10 minutos, até 5 respostas consultadas) é encaminhada à equipe. O histórico é limitado à organização, loja e conversa.
- Localização usa os campos cadastrados da loja; disponibilidade usa o catálogo oficial. Sem endereço cadastrado, pede confirmação à equipe.
- Elogios isolados não iniciam outro menu. Elogios acompanhados de perguntas continuam no roteamento.
- Webhooks guardam campos limitados de referência de anúncio e ID da mensagem citada; esses campos são contexto não confiável, nunca instruções nem autorização.
- Saída com status failed deixa de contar como resposta ao inbound. A recusa Meta 131042 nas últimas 24 horas aparece no diagnóstico como ação necessária de elegibilidade/cobrança.

## Limites

Não há migração de dados, alteração de credenciais, reenvio histórico em massa ou ativação do roteador unificado em shadow. Não se presume que um pedido sem confirmação pode ser criado de novo. O operador verifica o pedido canônico. Não há transcrição automática nova nem aprendizado sem supervisão.

O alerta 131042 informa a categoria da recusa, não prova que um cartão foi recusado. É preciso verificar a conta na Meta, especialmente se a falha persistir. O estado conectado não garante que todas as mensagens possam ser enviadas.

## Tráfego do VPS

Diagnóstico de 26/10/2026: amostra de 5 segundos mostrou aproximadamente 4 KB/s de saída (~0,033 Mbps). Históricos do sysstat de 18 a 25/10 indicaram cerca de 150 a 490 MiB/dia de saída; são estimativas de amostras, não a medição de faturamento da hospedagem. No dia 25, a maior média de 10 minutos foi cerca de 19,52 KiB/s. Isso não mede picos instantâneos.

O gráfico de upload sozinho não comprova esgotamento de franquia. O limite contratual e a regra de contabilização da hospedagem não foram informados. Compressão gzip e cache imutável dos arquivos estáticos já foram verificados. Chamadas frequentes do agente de impressão foram observadas, mas contagem de requisições não demonstra que sejam a origem de tráfego excessivo. Não reduzir sua frequência sem medir impacto na impressão.

Imagens de deploy transferidas para o VPS são entrada/download do servidor. Continuar compilando no GitHub, usando o deploy com health check e rollback existente; não compilar no VPS de produção.

## Verificação

Testes cobrem classificação de recuperação, preservação do checkout, isolamento da consulta de histórico, não interferência no atendimento humano, endereço cadastrado, metadados limitados e diagnóstico de cobrança. O CI Linux completo é o gate de publicação. Não enviar mensagens de teste a clientes reais sem solicitação.
