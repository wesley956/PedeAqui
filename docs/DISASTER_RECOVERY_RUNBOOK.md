# PedeAqui — Disaster Recovery Runbook

Status: **contrato operacional em certificação**  
Owner: Plataforma PedeAqui  
Issue de certificação: #1176

> Este documento define como o PedeAqui deve responder a perda/corrupção de dados. A existência deste runbook **não prova** que backup, PITR ou restore estejam ativos ou certificados. Evidência do provedor e um restore drill isolado continuam obrigatórios.

## 1. Objetivo

Recuperar o serviço com o menor risco possível, preservando isolamento entre tenants, integridade de pedidos e rastreabilidade. Restore de teste nunca deve sobrescrever produção.

## 2. Alvos operacionais

Até a primeira medição real de restore, os seguintes valores são **alvos provisórios, não certificados**:

- **RPO alvo:** até 24 horas de perda máxima de dados.
- **RTO alvo:** até 4 horas para restaurar um ambiente funcional mínimo.

O primeiro restore drill deve medir RPO/RTO reais. Se os resultados excederem estes alvos, #1176 permanece bloqueada e o plano precisa ser ajustado antes de promessa comercial de recovery.

## 3. Escopo de recovery

### 3.1 PostgreSQL / Supabase

Dados críticos incluem, no mínimo:

- organizações, memberships, roles e escopos de loja;
- lojas e configurações operacionais;
- catálogo, produtos, complementos e disponibilidade;
- clientes, carrinhos e pedidos;
- itens, pagamentos e eventos de domínio;
- conversas e mensagens persistidas;
- filas/jobs persistidos, incluindo impressão e notificações;
- configurações de módulos e entitlement;
- auditoria e dados de governança.

**Regra:** não declarar PostgreSQL recuperável por PITR até existir evidência administrativa da política realmente habilitada no projeto Supabase.

### 3.2 Supabase Auth

Auth deve ser verificado separadamente no exercício. Restaurar tabelas de negócio não prova que identidades, sessões, MFA, providers ou vínculos Auth estejam recuperáveis.

### 3.3 Supabase Storage

Buckets e objetos devem ser tratados separadamente do banco. O drill deve verificar, ao menos:

- `conversation-media`;
- `evidence`;
- `fiscal-artifacts`;
- `catalog-media`;
- `logos`.

Referências no banco sem o objeto correspondente contam como recovery incompleto.

### 3.4 Configuração e segredos

Backup do banco não equivale a backup de:

- variáveis e configuração do Vercel;
- secrets do Supabase/Vault;
- tokens/chaves da Meta/WhatsApp;
- credenciais Mercado Pago;
- configuração de domínio/DNS;
- configuração local do Print Agent;
- credenciais de integrações externas.

Segredos nunca devem ser copiados para documentação ou evidência de CI. O runbook registra somente origem, responsável e procedimento de reconfiguração/rotação.

## 4. Dependências externas

Para recuperar operação completa, conferir separadamente:

1. Supabase — database, Auth, Storage, Vault/configuração aplicável.
2. Vercel — projeto, environment variables, domínios e deployment saudável.
3. Meta — WABA, Phone Number ID, webhook, templates e secrets.
4. Mercado Pago — OAuth/webhook/credenciais da plataforma e das lojas aplicáveis.
5. Print Agent — instalação local, token/ownership, spool e conectividade da loja.
6. DNS/domínios — `pedeaqui.pp.ua`, `www` e demais aliases de produção.

## 5. Quando acionar recovery

Abrir incidente antes de restore quando houver evidência de pelo menos um destes cenários:

- corrupção ou exclusão relevante de dados;
- indisponibilidade prolongada do banco sem recuperação automática;
- migration/DDL incorreta com impacto não reversível por rollback normal;
- perda de tenant/loja/pedidos ou relações críticas;
- incidente de segurança que exija reconstrução a partir de recovery point confiável.

Falha de uma rota, deploy ruim ou integração externa isolada **não autoriza restore de banco automaticamente**.

## 6. Autoridade e regra de segurança

- Produção nunca é usada como ambiente de treinamento de restore.
- Restore destrutivo exige incidente formal e decisão explícita do responsável da plataforma.
- Drill de certificação ocorre somente em ambiente isolado.
- Antes do drill, confirmar custo e autorização de qualquer branch/projeto temporário.
- Nunca reutilizar cookies/sessões de produção no ambiente restaurado.
- Nunca apontar webhook Meta, Mercado Pago ou Print Agent de produção para o ambiente de drill.

## 7. Pré-check do restore drill

Registrar na issue/evidência:

- timestamp UTC de início;
- recovery point selecionado;
- tipo de backup/recovery fornecido pelo provedor;
- janela de retenção declarada pelo provedor;
- ambiente isolado de destino;
- SHA da `main` correspondente ao início do exercício;
- migrations esperadas;
- snapshot de contagens mínimas de produção **somente agregadas**, sem exportar PII para a issue.

## 8. Procedimento do restore drill

1. Criar/selecionar ambiente Supabase isolado autorizado.
2. Restaurar o recovery point pelo procedimento oficial do provedor.
3. Não conectar domínios, webhooks ou workers de produção.
4. Aplicar somente reconciliation de código/migrations necessária para reproduzir a versão que será validada; não improvisar DDL em produção.
5. Executar validações da seção 9.
6. Registrar horário em que o ambiente mínimo ficou utilizável.
7. Calcular RTO medido.
8. Comparar timestamp do recovery point com o início do incidente/drill para obter RPO observado.
9. Registrar gaps, owners e correções.
10. Desativar/destruir o ambiente temporário conforme política/custo, depois de preservar evidências não sensíveis.

## 9. Validação pós-restore

### 9.1 Integridade de tenant

Validar agregados e relações sem publicar PII:

- organizações > 0;
- lojas com `organization_id` válido;
- pedidos com organização/loja válidas;
- itens associados ao pedido correto;
- conversas/mensagens no mesmo tenant;
- jobs de impressão/notificação no mesmo tenant;
- memberships e RBAC coerentes.

Qualquer cross-tenant inconsistente é **FAIL**.

### 9.2 Fluxos mínimos

Em ambiente isolado e com integrações externas bloqueadas/mocked quando necessário:

- autenticação de identidade de teste;
- resolução de contexto organization/store;
- leitura de catálogo da loja de teste;
- criação de pedido de teste;
- leitura do pedido criado;
- claim/finish de jobs de teste sem atingir produção;
- RPCs críticas e RLS;
- signed URL somente para objeto de teste autorizado.

### 9.3 Storage

Para amostra controlada de objetos:

- referência DB existe;
- objeto esperado existe;
- bucket e path correspondem ao tenant/recurso;
- privado continua privado;
- signed URL exige autorização apropriada.

### 9.4 Auth e secrets

- identidade de teste funciona sem sessão de produção;
- secrets necessários estão presentes/reconfigurados pelo canal seguro;
- nenhum secret aparece em log, issue ou artifact público.

## 10. Critérios PASS/FAIL

### PASS

Somente quando todos forem verdadeiros:

- origem do backup/recovery point comprovada;
- restore concluído em ambiente isolado;
- integridade mínima aprovada;
- Auth/Storage/configuração relevante verificados dentro do escopo declarado;
- RPO observado <= RPO alvo;
- RTO observado <= RTO alvo;
- nenhuma dependência produtiva foi acionada pelo ambiente de drill.

### FAIL

Qualquer um destes mantém #1176 aberta:

- PITR/backup presumido sem evidência;
- restore não executado;
- dados/relações críticas ausentes;
- Auth/Storage fora do escopo sem plano explícito;
- RPO/RTO acima do alvo;
- risco de chamada a webhook/provider/Print Agent de produção;
- necessidade de intervenção manual não documentada para tornar o restore utilizável.

## 11. Rollback e escalonamento

Se o drill falhar, não tentar "consertar" produção como consequência do teste. Registrar a falha, classificar causa e corrigir procedimento/infraestrutura em branch/issue própria.

Em incidente real, se o recovery point escolhido estiver incorreto ou incompleto, interromper a promoção do restore e escalar antes de substituir produção.

## 12. Evidência obrigatória por exercício

Cada exercício deve registrar:

- data/hora UTC;
- responsável;
- recovery point;
- ambiente de destino;
- RPO alvo e observado;
- RTO alvo e observado;
- checklist da seção 9;
- falhas encontradas;
- ações corretivas;
- decisão final PASS/FAIL;
- SHA/versão de código usada.

## 13. Estado atual da certificação

Em 24/09/2026:

- runbook versionado: **em implementação pela #1176**;
- evidência administrativa de backup/PITR: **PENDENTE**;
- retenção confirmada: **PENDENTE**;
- restore drill isolado: **PENDENTE**;
- RPO medido: **PENDENTE**;
- RTO medido: **PENDENTE**;

Até esses itens serem concluídos, o PedeAqui **não deve declarar recovery/restore como certificado**.
