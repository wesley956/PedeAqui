# Matriz CRUD, contratos e encerramento — PA-DIAG-146–153 / PA-CRUD-001–015

Data de validação: 22/08/2026. Escopo: Super Admin, painel do restaurante, operação, banco e chamadas server-side.

## Regra transversal

- Toda mutação administrativa passa por Server Action/serviço, valida sessão, papel, organização, unidade, módulo e plano quando aplicável.
- `anon` e `authenticated` não recebem acesso direto às tabelas financeiras/contratuais da plataforma; somente `service_role`, usado exclusivamente no servidor.
- Pedidos, pagamentos, contratos, propostas, add-ons e auditoria usam `on delete restrict`, transição de estado, cancelamento, arquivamento ou anonimização. Não existe hard delete desses históricos.
- Mudanças comerciais registram motivo, protocolo, ator, preço anterior, preço proposto, aceite e vigência. Uma mudança futura não reescreve faturas ou versões anteriores.
- Módulo desligado desaparece da navegação e continua bloqueado pelos guards server-side/SQL já validados no lote PA-DIAG-067–079.

## Matriz CRUD segura

| Issue | Domínio | Create | Read | Update | Delete/Restore | Autorização e auditoria | Evidência |
|---|---|---|---|---|---|---|---|
| PA-CRUD-001 | Todas as entidades/telas | Contrato por serviço/RPC | Busca/lista/detalhe com escopo | Validação e concorrência | Sem exclusão genérica | Matriz abaixo é o inventário canônico | teste `final-crud-contracts` |
| PA-CRUD-002 | Organizações/unidades | Onboarding controlado | Super Admin e membros do tenant | Dados e situação | Suspender/reativar; histórico preservado | `PlatformAdminService` + trilha | testes de isolamento/acesso |
| PA-CRUD-003 | Módulos/presets/planos/versões | Criar catálogo/plano | Consulta server-only | Nova versão, nunca retroativa | Desativar/reativar venda | super_admin + `platform_financial_audit` | migrations 105–106/120/123 |
| PA-CRUD-004 | Contratos/assinaturas/add-ons/descontos | Proposta e add-on por RPC | Histórico completo | Aceite, agenda, aplicação | Cancelar add-on/desconto; sem apagar | super_admin, ator/motivo/protocolo | migration 123 + painel |
| PA-CRUD-005 | Cobranças/recebimentos/conciliação | Fatura/pagamento idempotente | Lista e detalhe sanitizados | Estados permitidos | Cancelamento/estorno por lançamento | ledger financeiro e auditoria imutáveis | migration 120 |
| PA-CRUD-006 | Usuários/convites/papéis/acessos | Convite sem definir senha | Escopo de tenant/unidade | Papel/unidade/revogação | Revogar/reativar acesso | sessão + RBAC server-side | migration 115 + testes auth |
| PA-CRUD-007 | Categorias/produtos/adicionais/imagens | Formulários validados | Catálogo por loja | Editar/ordenar/disponibilidade | Desativar/restaurar e mídia isolada | tenant + permissão + módulo | testes catalog/media |
| PA-CRUD-008 | Clientes/endereços | Cadastro/deduplicação por tenant | Somente organização | Atualização validada | Anonimizar sem quebrar pedido | RLS e políticas de privacidade | customer/privacy tests |
| PA-CRUD-009 | Entrega/regiões/taxas/entregadores | Cadastro por unidade | Escopo por loja | Regras/disponibilidade | Desativar/reativar | permissão delivery + tenant | delivery/driver tests |
| PA-CRUD-010 | Horários/pagamentos/impressão/configurações | Cadastro com dependências | Escopo por unidade | Atualização validada | Desativar/restaurar configuração | módulo + papel + loja | schedule/payment/printing tests |
| PA-CRUD-011 | WhatsApp/integrações | Conectar sem expor segredo | Saúde sanitizada | Reconectar/rotacionar | Desconectar preservando eventos | super_admin/owner + auditoria | WhatsApp/integration tests |
| PA-CRUD-012 | Pedidos/registros operacionais | Checkout idempotente | Token público ou tenant | State machine oficial | Cancelar com motivo; nunca apagar | guards SQL e serviço | order workflow tests |
| PA-CRUD-013 | Retenção | Não aplicável | Política documentada | Estado/anonimização | hard delete somente em dado efêmero sem vínculo | decisão explícita por domínio | esta matriz + triggers |
| PA-CRUD-014 | Todas as mutações | Sessão e input válidos | Escopo obrigatório | papel/módulo/plano/tenant | ação de domínio auditada | negativa por URL/RPC direto | testes de contratos/RLS |
| PA-CRUD-015 | E2E transversal | Caminho permitido | tenant A ≠ tenant B | papel e módulo | restauração/cancelamento | chamadas diretas negadas | suíte completa + jornadas E2E |

## Política de Delete e retenção

| Classe | Delete significa | Restauração | Retenção mínima |
|---|---|---|---|
| Pedido, pagamento, fatura, contrato e auditoria | cancelar/estornar/encerrar; nunca remover | nova transição compensatória | permanente enquanto houver obrigação comercial/legal |
| Plano e versão | retirar de novas vendas; versão imutável | reativar o plano atual ou criar nova versão | permanente |
| Add-on e desconto | cancelar com data, ator e motivo | nova proposta/novo desconto | permanente |
| Organização e unidade | suspender/encerrar | reativar quando permitido | preserva vínculos históricos |
| Usuário/acesso | revogar convite ou associação | novo convite/reativação | auditoria preservada |
| Catálogo/configuração operacional | desativar/arquivar | restaurar quando o domínio permitir | enquanto referenciado por pedido/histórico |
| Cliente/endereço | anonimizar conforme solicitação e base legal | não restaurar dado anonimizado | pedido mantém snapshot necessário, sem dado excedente |
| Sessão, tentativa de login e cache efêmero | expirar/limpar | não aplicável | somente janela operacional |

## Contratos finais PA-DIAG-146–153

- **146:** `subscription_addons` guarda melhorias separadas do plano-base.
- **147/150:** `subscription_change_quote_internal` calcula e persiste total atual e proposto antes de qualquer alteração.
- **148:** aceite, data, responsável, motivo e protocolo são obrigatórios e auditados.
- **149:** trigger impede mudança do preço-base travado; versões, propostas e faturas anteriores permanecem intactas.
- **151:** upgrade/downgrade passam por proposta aceita e `effective_at`; aplicação antecipada é recusada no banco.
- **152:** propostas, add-ons, versões, histórico de assinatura e auditoria compõem o histórico do contrato no Super Admin.
- **153:** o painel separa receita mensal por plano-base e por módulo adicional.

## Gate

Executar `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`, `npm run db:drift` e os advisors do Supabase. A entrega só fecha com CI e deploy aprovados.

Validação live executada em transação com rollback: criação de assinatura temporária, simulação de add-on, aceite, aplicação, confirmação do add-on e tentativa negada de alterar preço-base travado. Nenhum dado de teste permaneceu no projeto.
