# Reconciliação do histórico de migrações — 11/10/2026

Comparação somente leitura entre `supabase/production-migrations.json` + `production-migrations-tail.json` (251 entradas) e `supabase_migrations.schema_migrations` do projeto conectado `idyjinpeijyqcejnunwm` (261 entradas).

## Resultado

- As 251 versões locais estão presentes no remoto.
- Não foram encontrados nomes diferentes para as mesmas versões.
- Há dez versões remotas adicionais, listadas abaixo.
- A comparação é de **versão e nome**, não de conteúdo SQL, schema completo ou políticas RLS. Não comprova equivalência estrutural.

| Versão remota | Nome |
| --- | --- |
| `20261004005737` | `pedeaqui_recovery_schema` |
| `20261004005816` | `pedeaqui_recovery_quarantine` |
| `20261004010715` | `pedeaqui_recovery_security` |
| `20261004011503` | `pedeaqui_recovery_realtime` |
| `20261004011551` | `pedeaqui_recovery_private_usage` |
| `20261004011603` | `pedeaqui_recovery_view_security` |
| `20261004045008` | `diagnostic_pin_whatsapp_embed_trigger_search_path` |
| `20261007231438` | `custom_payment_finance_account` |
| `20261010071418` | `pdv_fulfillment_consistency` |
| `20261010072147` | `ensure_order_quick_finish_atomic` |

## Evidência no checkout

As duas migrações de 10/10 estão em `supabase/migrations/`. Existe `supabase/sql/208_custom_payment_methods.sql`, mas a semelhança de nome não comprova equivalência com `custom_payment_finance_account`. A busca por nomes não localizou arquivos equivalentes às entradas de recuperação e ao ajuste de search_path.

## Continuidade

1. Confirmar o vínculo do ambiente desejado antes de trabalhar no banco.
2. Recuperar e revisar as definições correspondentes às entradas ausentes, sem publicar dados particulares ou credenciais.
3. Conferir se a recuperação é uma operação histórica específica do ambiente ou parte do schema necessário para um banco novo.
4. Validar a reprodução em banco descartável e então atualizar o baseline por uma alteração própria, revisada.

Não basta copiar as dez linhas para o JSON ou substituir o ref antigo: o checker local também depende do SQL canônico. Esta preparação não mudou SQL, histórico remoto ou dados.
