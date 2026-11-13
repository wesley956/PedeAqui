# PedeAqui — instruções para trabalhar no repositório

## Contexto
- Este é `wesley956/PedeAqui`. “cruz” é contexto/nome histórico; não confundir com `cruzlabs`.
- Use `docs/CURRENT_STATE.md` para retomada e prioridades; `docs/CODEX_SETUP.md` para ambiente; `docs/CODE_MAP.md` para localizar um fluxo.
- Consulte documentos especializados somente conforme a tarefa. Baselines antigos e contagens de testes não são prova do estado de produção atual.
- Comunique-se em português simples e preserve decisões já confirmadas pelo usuário.

## Implementação
- Interfaces e ações ficam em `src/features`; serviços e regras em `src/server`; páginas/APIs em `src/app`.
- Reutilize primitives em `src/components/ui` e tokens existentes antes de criar estilos.
- Preserve isolamento por organização/unidade, autorização server-side, RLS, idempotência, auditoria e separação dos domínios. Navegação ou ocultar botões não autoriza acesso.
- Alterações em pedidos/pagamentos devem preservar valores, troco, modalidade, estados operacionais e efeitos nos outros módulos. Consulte os testes do domínio.
- Print Agent e fila são componentes próprios. Não iniciar agente, gerar pedidos de teste, imprimir ou alterar conexão de loja para validar documentação.

## Ambientes e segredos
- Não copie credenciais, tokens, dados de clientes ou configurações privadas de computadores para arquivos versionados.
- `.env.local` permanece ignorado. `NEXT_PUBLIC_` é público; `SUPABASE_SERVICE_ROLE_KEY` é exclusivamente do servidor.
- Confirme o destino real antes de SQL/migrações. O ref antigo `zsbsczjhiujnhdznrzck` aparece em baselines; o conector de 11/10/2026 disponibilizou `idyjinpeijyqcejnunwm`.
- `supabase/sql`, `supabase/migrations` e o histórico remoto não são intercambiáveis. Não renumere SQL nem reaplique o histórico para “sincronizar”.
- Preparar ambiente/documentação não autoriza deploy de produção, migrações ou alterações em dados de lojas. Quando essas ações fizerem parte da solicitação, valide primeiro destino e impacto.

## Validação e entrega
- Use os scripts reais de `package.json`. Para código, rode verificações relevantes ao fluxo e os gates exigidos pelo CI antes de merge.
- Para documentação, confira links locais, comandos, caminhos, consistência e `git diff --check`; não crie testes que apenas repitam o texto.
- Separe no relato: teste local, evidência histórica, observação em navegador e validação física.
- Entregue alterações em branch/PR revisável; não faça merge/deploy como consequência implícita de uma preparação.
- Atualize a documentação afetada ao mudar comportamento. O README deve apontar para o estado atual, sem apagar evidências históricas.
