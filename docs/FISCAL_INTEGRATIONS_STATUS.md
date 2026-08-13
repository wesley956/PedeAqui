# PedeAqui — Fiscal e Integrações [225]–[238]

## Estado

Milestone 22 implementado na branch `agent/fiscal-integrations-225-238`, draft PR #263, baseado diretamente no `main` consolidado até [224]. Não mesclar sem autorização explícita.

## Escopo entregue

- perfil fiscal por unidade e provider fiscal desacoplado;
- identificadores fiscais como `text`, preparados para formatos alfanuméricos;
- classificação fiscal versionada por produto com NCM/CEST/CFOP/CST-CSOSN/cClassTrib + `tax_data` extensível;
- `fiscal_documents`, `fiscal_items` e histórico fiscal próprios, sem reutilizar status de pedido;
- snapshots imutáveis de emissor, cliente, totais e classificação fiscal;
- State Machine `draft → queued → processing → authorized|rejected|contingency` e `authorized → cancelled`;
- fila persistente `fiscal_jobs` com `FOR UPDATE SKIP LOCKED`, lease, retry, dead state e idempotência;
- configuração transacional de integração/perfil/classificação;
- cancelamento assíncrono por job;
- contrato `FiscalProvider` explícito e registry de adapters fornecidos pelo código; banco nunca carrega código arbitrário;
- worker provider-agnostic para emissão/cancelamento;
- webhook fiscal inbound com verificação obrigatória pelo adapter, limite de payload, dedupe/replay protection e State Machine validada;
- bucket privado `fiscal-artifacts`; XML/PDF referenciados por path multi-tenant e XML protegido por SHA-256;
- URLs de artefato assinadas somente depois de `fiscal.view`;
- registry genérico de integrações;
- webhooks outbound duráveis sobre `domain_events`, com filtro por evento, fila idempotente e lease/retry/dead;
- worker outbound com HMAC-SHA256, timeout, redirect manual e egress allowlist por `OUTBOUND_WEBHOOK_ALLOWED_HOSTS`;
- `/fiscal` para configuração, classificação, criação de draft, fila, cancelamento e status operacional;
- snapshot de saúde/reconciliação: rejeições, contingência, stale, dead jobs, missing artifacts e produtos sem perfil.

## Migrations aplicadas no Supabase oficial

1. `fiscal_integrations_core_225_238`
2. `fiscal_operations_225_238`
3. `fiscal_configuration_225_238`
4. `fiscal_webhooks_storage_225_238`
5. `fiscal_fk_indexes_225_238`
6. `integration_outbound_webhooks_225_238`
7. `integration_webhook_configuration_225_238`

## Segurança

Validação direta após as migrations:

- 10/10 tabelas novas de Fiscal/Integrações com RLS;
- `anon`/`authenticated`: zero privilégios diretos nessas tabelas;
- `anon`/`authenticated`: zero EXECUTE nas RPCs internas Fiscal/Integrações;
- credenciais/certificados nunca são persistidos em claro: somente referências a secrets;
- artefatos fiscais em bucket privado;
- webhook inbound exige verificação do provider;
- outbound exige HTTPS e allowlist de egress;
- providers são registrados explicitamente em código; `provider_key` não permite carregar código dinâmico.

O Security Advisor mantém INFOs históricos `rls_enabled_no_policy` de tabelas server-only de outros milestones; este bloco não exige remover esses avisos para manter browser bloqueado.

## E2E PostgreSQL com rollback

Cenário Fiscal executado no Supabase oficial:

- CNPJ/identificador fiscal alfanumérico preservado no snapshot;
- criação de documento repetida retornou o mesmo documento;
- classificação do produto entrou no snapshot fiscal;
- envio repetido retornou o mesmo job;
- item fiscal ficou imutável após entrar na fila;
- claim inicial, erro temporário, retry e segundo claim;
- transições `processing → authorized → cancelled`;
- autorização exigiu chave/protocolo;
- documento sem classificação de item foi impedido de entrar na fila;
- exatamente 1 job para a emissão idempotente;
- rollback final: 0 organização, 0 documentos, 0 jobs e 0 usuário de teste.

O E2E SQL específico de webhook outbound com endpoint HTTPS foi bloqueado pelo filtro de segurança da ferramenta antes de chegar ao Supabase; não houve execução parcial. Seus contratos de dedupe/lease/retry/assinatura/egress são cobertos por código/testes, e a homologação de rede externa permanece separada.

## Limites honestos

- nenhum provider fiscal real está registrado ainda;
- nenhuma chamada real SEFAZ/NFC-e/NF-e foi homologada nesta sessão;
- regras tributárias específicas continuam pertencendo ao adapter/configuração fiscal versionada, não ao motor de pedidos;
- storage externo foi preparado, mas XML/DANFE reais dependem de provider real;
- marketplaces, adquirentes e plataformas logísticas usam o registry/webhooks genéricos, porém adapters concretos são integrações futuras sob demanda;
- emissão fiscal legal deve ser homologada com certificado, CSC/credenciais e ambiente real aplicáveis à UF/regime do estabelecimento.
