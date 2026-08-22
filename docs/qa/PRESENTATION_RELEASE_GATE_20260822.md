# Gate de correção, reteste, publicação e reversão

Data de corte: 2026-08-22  
Issue: `PA-DIAG-007` / GitHub #548

Este gate é obrigatório para cada lote do diagnóstico de prontidão comercial. O objetivo é impedir que uma correção urgente introduza uma regressão silenciosa antes da apresentação.

## Estados permitidos

| Estado | Significado | Pode publicar? |
| --- | --- | --- |
| `confirmado` | Falha reproduzida com entrada, saída e superfície identificadas | Ainda não |
| `corrigido-local` | Mudança mínima implementada e teste específico aprovado | Ainda não |
| `retestado` | Teste específico, suíte relacionada, tipos e lint aprovados | Sim, por PR |
| `publicado` | CI verde, PR incorporado e health check pós-publicação aprovado | Sim |
| `revertido` | Mudança retirada porque o gate pós-publicação falhou | Não, até novo diagnóstico |
| `bloqueado` | Dependência externa, credencial, equipamento ou permissão indisponível | Não fingir aprovação |

## Regra operacional

1. Reproduzir antes de editar. Registrar rota, papel, tenant, módulo, horário e resultado sem copiar dados pessoais ou segredos.
2. Corrigir somente a causa confirmada. Mudanças de escopo diferente vão para outra issue.
3. Adicionar teste que falhe antes e passe depois sempre que a falha for determinística.
4. Executar teste específico, suíte relacionada, `typecheck`, `lint` e build quando a mudança afetar runtime ou roteamento.
5. Publicar somente por branch e PR vinculados às cinco issues do lote. O PR precisa de CI verde.
6. Após incorporar, validar `/api/health` e pelo menos um caminho feliz afetado no domínio canônico `https://www.pedeaqui.pp.ua`.
7. Se o health check ou o caminho feliz falhar, interromper a demonstração desse fluxo e reverter o PR. Nunca corrigir diretamente em produção sem trilha de auditoria.

## Gate de dados e banco

- DDL usa migration append-only e nunca edita migration já aplicada.
- Testes de escrita em produção devem usar transação com `ROLLBACK` ou o tenant marcado `platform_demo=true`.
- É proibido apagar pedidos, pagamentos, contratos, auditoria, módulos ou histórico para “limpar” um teste.
- Mudança de módulo preserva dados; apenas controla disponibilidade e navegação.
- Operação irreversível exige backup verificável e plano de restauração antes da execução.

## Evidência mínima no PR

- issues cobertas e classificação final de cada uma;
- comandos/testes e resultado;
- impacto em tenant, papel e módulo;
- dependências externas ainda não homologadas;
- instrução objetiva de reversão;
- health check pós-publicação.

## Reversão deste lote

Este lote altera documentação, testes e normalização de URL base. A reversão é o `revert` do PR do lote. Não há migration nem alteração persistente de dados. O teste de provisionamento comercial foi executado dentro de `BEGIN ... ROLLBACK` e deixou zero organizações de diagnóstico.
