# UX2 — Passo a passo de integração (para o agente que for integrar)

Este arquivo é para quem vai levar o trabalho do UX2 para a `main` e para a produção — pessoa ou agente (GPT/Codex). Leia inteiro antes de executar qualquer comando.

## 0. Contexto em uma página
- O UX2 é a modernização visual e de usabilidade do PedeAqui. Todo o trabalho fica em branches `ux2/*` e é reunido em **`ux2/integration`**.
- A produção é publicada **automaticamente** quando um commit entra na `main` e o CI passa (workflow `Deploy VPS`). Portanto: **merge na `main` = publicação**. Não existe passo manual de deploy para segurar.
- Estado atual, módulos prontos e bloqueios: `docs/ux2/ESTADO.md`. Decisões: `docs/ux2/DECISOES.md`. Ambiente de teste: `docs/ux2/HOMOLOGACAO-LOCAL.md`.
- Baseline do UX2: commit `534c3091` da `main`.

## 1. O que você NÃO pode fazer
1. Fazer merge de `ux2/integration` inteira na `main` de uma vez. A integração é por lote (seção 4).
2. Integrar um lote que está como "Não iniciado", "Bloqueado" ou "Parcialmente validado" em `ESTADO.md` sem autorização escrita do responsável.
3. Alterar ou criar migrações de banco como parte de um lote visual. Se um lote trouxer arquivo em `supabase/`, pare e peça autorização: migração em produção é aplicada à parte e precisa de aprovação específica.
4. Mexer em `.github/workflows/deploy-vps.yml`, segredos, DNS, VPS ou variáveis de produção.
5. Rodar a homologação local, seeds ou testes apontando para o banco de produção.
6. Usar `git push --force` em `main` ou `ux2/integration`, ou reescrever histórico.
7. Declarar um lote integrado sem ter executado a seção 5.

## 2. Preparar a máquina
```bash
git clone https://github.com/wesley956/PedeAqui.git
cd PedeAqui
git fetch origin
git checkout ux2/integration
node scripts/homologacao-local/iniciar.mjs      # sobe banco local + sistema; ver HOMOLOGACAO-LOCAL.md
```
Se a pasta já existe: `git fetch origin && git checkout ux2/integration && git pull --ff-only`.

## 3. Manter `ux2/integration` em dia com a `main`
A `main` recebe correções de outras frentes (WhatsApp, impressão, entregas) quase todo dia. Antes de qualquer integração:
```bash
git checkout ux2/integration && git pull --ff-only
git checkout -b ux2/sync-main-AAAAMMDD
git merge origin/main
git push -u origin ux2/sync-main-AAAAMMDD
```
Abra PR com **base `ux2/integration`**, espere o CI e a homologação passarem, e faça o merge. Conflito em arquivo de regra de negócio (`src/server/**`, `supabase/**`): a versão da `main` vence; reaplique por cima só a parte visual.

## 4. Integrar um lote na `main`
Um lote = um módulo listado como **Validado** em `ESTADO.md`, com relatório em `docs/ux2/modulos/<módulo>.md` listando os commits/PRs que o compõem.

1. Confirme com o responsável qual lote entra. Um lote por vez; o próximo só depois de 24 h sem incidente.
2. Crie a branch a partir da `main` atual e traga só os commits do lote:
   ```bash
   git fetch origin
   git checkout -b release/ux2-<módulo> origin/main
   git cherry-pick <commits do lote, na ordem do relatório>
   ```
   Se o lote depender da fundação visual (tokens, botões, ícones), a fundação é o primeiro lote e entra antes de todos.
3. `git diff --stat origin/main` — confira que só há arquivos do lote. Qualquer arquivo em `supabase/`, `.github/` ou `print-agent/` fora do esperado: pare.
4. Abra PR com base `main`. No corpo: lote, relatório do módulo, issues relacionadas, resultado da seção 5.
5. Espere **todos** os checks do PR ficarem verdes.
6. Peça a aprovação do responsável no PR. **Só então** faça squash merge. O `Deploy VPS` publica sozinho; acompanhe até terminar com sucesso.

## 5. Verificação obrigatória antes de pedir o merge
- [ ] CI do PR verde.
- [ ] Homologação local rodando a branch `release/ux2-<módulo>`: `node scripts/homologacao-local/iniciar.mjs --zerar`.
- [ ] Roteiro do módulo (em `docs/ux2/modulos/<módulo>.md`) executado no computador e no celular, do início ao fim, sem erro de tela.
- [ ] Fluxo crítico intacto: cliente faz pedido no cardápio → pedido aparece em Pedidos → aceitar → avançar etapas → finalizar. Venda no PDV até o pagamento.
- [ ] Nenhuma função removida: compare com o inventário do módulo.
- [ ] Tema claro e escuro; larguras 360, 390, 768, 1366 px.

## 6. Depois de publicar
1. Abra o painel de uma loja real **só para olhar** (não crie pedido de teste em loja real sem autorização): Pedidos, PDV e o cardápio público carregam?
2. Acompanhe por 30 minutos em horário de movimento: novos pedidos entram e mudam de etapa.
3. Atualize `docs/ux2/ESTADO.md` (lote publicado, data, commit) num PR de documentação.

## 7. Como desfazer
- Problema depois de publicar: `git revert <commit do squash>` em uma branch, PR para a `main`, merge. O revert publica a versão anterior do mesmo jeito. Não use reset nem force push.
- Lote visual não altera banco; por isso o revert é suficiente. Se um lote com migração tiver sido autorizado, o plano de volta do banco precisa estar escrito no relatório do módulo antes do merge.

## 8. Quando parar e perguntar
Conflito em regra de negócio que você não entende; teste que falha e só passa se o teste for alterado; arquivo de banco no diff; `Deploy VPS` com falha; qualquer coisa que envolva cobrança, mensagem a cliente ou impressora de loja.
