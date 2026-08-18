# Hardening de plataforma pendente

Este arquivo registra ajustes administrativos que não são mutações de código ou banco e precisam ser aplicados nas configurações das plataformas.

## GitHub — proteção da `main`

Estado auditado em 2026-08-18: `main` ainda aparece como não protegida.

Configuração alvo:

- exigir Pull Request antes de merge;
- exigir o status check do workflow `CI` / job `validate` antes de merge;
- bloquear force push na `main`;
- bloquear exclusão da `main`;
- manter o CI em `push` para `main` como verificação pós-merge.

## Supabase Auth — proteção contra senhas vazadas

Estado auditado em 2026-08-18: o Security Advisor ainda informa `Leaked Password Protection Disabled`.

Configuração alvo, quando o plano do projeto oferecer o recurso:

- habilitar proteção contra senhas vazadas em Auth;
- executar novamente o Security Advisor;
- considerar concluído somente quando o aviso correspondente desaparecer.

## Observações

- Os RPCs `public.get_public_menu` e `public.get_public_product` permanecem `SECURITY DEFINER` intencionalmente para o cardápio público, com `search_path=''` e grants explícitos.
- Tabelas apontadas como `RLS Enabled No Policy` foram auditadas como server-only: `anon` e `authenticated` não possuem grants diretos; não criar policies artificiais apenas para silenciar o Advisor.
- Avisos de índices/FKs do Performance Advisor devem ser tratados com evidência de workload/plano de execução, não em massa.
