# Auditoria de fechamento — estabilização #819 a #831

Data da auditoria: 03/09/2026. Base técnica: PR #908, head posterior ao CI #1261.

**Regra:** `CI verde` não é sinônimo de `issue concluída`. Uma issue só deve fechar quando todos os critérios escritos estiverem demonstrados no ambiente apropriado e a implementação necessária estiver integrada/promovida.

| Issue | Estado técnico | Evidência pronta | O que ainda impede fechamento |
| --- | --- | --- | --- |
| #819 Idempotência | **Parcial forte** | checkout replay por carrinho; state transitions same-state + `FOR UPDATE`; delivery keys; driver keys na migration 181; rota e PIX/WhatsApp com dedupe próprio; matriz documentada | criação manual de estação/impressora, teste de impressão e criação/reconexão de agente ainda dependem de UI/state e não são totalmente reconciliáveis após resposta perdida; alguns updates podem repetir auditoria |
| #820 Segurança/Auth | **Parcial forte + bloqueio externo** | service role somente backend; RPCs públicas auditadas; `search_path` seguro; 47 tabelas backend-only sem grants cliente; security tests | Leaked Password Protection é recurso Supabase Pro+; projeto atual está Free. Não alterar plano sem decisão explícita |
| #821 RBAC/multi-tenant | **Parcial forte** | 101 testes da matriz; papéis reais; org/store revalidados; módulo + entitlement + permissão; service role backend | critério pede prova dinâmica negativa com contas/fixtures de todos os papéis e troca de unidade; não criar fixtures em produção. Executar em staging/branch Supabase |
| #822 Migration drift | **Parcial forte** | baseline real reconciliado; 181/182 pendentes corretamente; CI detecta ordem/lacunas; comparação live manual confirmou cauda de produção | CI atual não possui `SUPABASE_DB_URL`; critério de banco limpo e pós-deploy precisa staging/branch DB; migrations 181/182 ainda não promovidas |
| #823 Índices/FKs | **Parcial forte** | único par duplicado confirmado; 134 FKs sem leading index classificados como baixo volume; nenhuma criação/remoção em massa; migration 181 remove só duplicata | medir `depois` exige promover 181 e repetir plano/latência/storage; teste de carga específico deve ser comparado pós-migration |
| #824 Integridade | **Parcial forte** | diagnóstico read-only, service_role, sem PII; 17/17 invariantes live = zero na auditoria; testes de severidade | função da migration 182 ainda não está promovida; CI não executa o diagnóstico contra staging/DB e portanto ainda não bloqueia release por violação live |
| #825 Responsividade | **Bloqueio externo de homologação** | contratos mobile/tablet/desktop no CI; layout regressions estáticos verdes | screenshots/browser real nas larguras/zoom/orientações. Preview existe, mas conector Vercel não tem acesso ao scope `pede-aqui` |
| #826 Feedback/erros | **Código forte; homologação visual pendente** | Button pending, loading/empty/error/success, confirmação destrutiva, classificação validation/timeout/dependency/internal e logs técnicos | critério “toda ação”/preservação de contexto exige amostragem browser operacional; pode ser homologado junto #825/#827 |
| #827 Acessibilidade/browser | **Bloqueio externo de homologação** | foco/reduced-motion/labels/controles e suite de acessibilidade no CI | teclado ponta a ponta + axe/Lighthouse/browser alvo reais na preview. Vercel scope bloqueado |
| #828 Crawler | **Parcial forte** | inventário 110 páginas; 228 refs; redirects; 404 baseline; assets literais; arquivo/linha; CI falha em referência estática quebrada | critério inclui HTTP 404/500 real, IDs/deep links autenticados e módulos/papéis em runtime; exige preview/staging acessível |
| #829 E2E principal | **Parcial forte** | total autoritativo, checkout replay, opções/quantidades, cash/card/PIX condicionado, delivery/pickup, cliente reconhecido/endereço, side effects posteriores; 3 passagens do journey | issue pede screenshots mobile/desktop e jornada browser real. Preview sem acesso pelo conector atual |
| #830 Falhas/concorrência | **Parcial forte** | matriz chaos documentada; timeout/dependency/session; Realtime fallback; locks/state machine; impressão independente; redaction; testes verdes | critérios pedem caos repetível em staging com falha real de infraestrutura/serviço. Não executar deliberadamente em clientes ativos |
| #831 Observabilidade | **Parcial forte** | novos alertas de pedido/entrega/Realtime/checkout/impressão/pagamento; limiares/dedupe/recovery; origem; runbooks P0/P1; retenção 180d | 404/500/latência/runtime logs da hospedagem precisam acesso ao projeto Vercel correto; teste operacional dos runbooks externos permanece pendente |

## Resultado da auditoria

Nenhuma dessas issues deve ser fechada automaticamente **antes do merge/promoção e das evidências externas acima**. Isso não significa que o lote falhou: o código está verde e várias issues estão próximas do fechamento, mas a definição de pronto exige ambiente e/ou ação externa.

## Ordem segura para destravar

1. Corrigir os resíduos de idempotência de impressão/Print Agent da #819 no branch, sem alterar produção.
2. Obter acesso à preview/observabilidade do scope Vercel `pede-aqui` e homologar #825/#826/#827/#828/#829/#831.
3. Usar staging/branch Supabase para matriz dinâmica #821, banco limpo #822, diagnóstico #824 e caos #830. Criar branch Supabase pode ter custo; confirmar antes.
4. Após aprovação/merge, promover migrations 181/182 de forma controlada e medir #823/#824 pós-deploy.
5. #820 só fecha integralmente quando a política de senha vazada puder ser habilitada (Pro+) ou o critério for formalmente replanejado — não mascarar a limitação do plano Free.

## Segurança de produção

Nenhuma configuração real de Dona Maria, Dom Burger ou outro cliente foi modificada nesta auditoria. O pedido Dona Maria #35 foi apenas lido para calibrar o alerta de pedido confirmado sem avanço; não houve transição, pagamento, impressão ou alteração de fulfillment.
