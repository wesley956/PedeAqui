# Massa isolada para diagnóstico e apresentação — 22/08/2026

Documento de execução da `PA-DIAG-005` (#544).

## Tenant autorizado para testes

- unidade pública: `/m/santa-rita`;
- flag obrigatória: `platform_demo = true`;
- perfil atual: `restaurant` + preset `custom`;
- acesso: o platform `super_admin` ativo já possui membership nessa organização;
- isolamento atual: uma unidade demo e sete unidades não-demo.

O serviço `PlatformCommercialOnboardingService.ensureDemo()` é a única rotina autorizada
a criar/reutilizar a demonstração automática. Ele procura uma unidade `platform_demo`
antes de criar outra e mantém categorias, produtos, cardápio e pagamento demonstrativos
separados dos clientes reais.

## Regras de segurança

1. Testes de criação, edição, desativação, pedidos e módulos usam somente o tenant demo.
2. Nunca escolher organização real por posição de lista ou nome parecido.
3. Confirmar `platform_demo = true` server-side antes de limpeza ou reset demonstrativo.
4. Não armazenar e-mail, senha, token de convite, cookie ou service role em Git/docs/issues.
5. Pedidos, pagamentos, auditoria e histórico não recebem hard delete.
6. Falhas de WhatsApp, pagamento ou impressão não podem bloquear o pedido-base.
7. A conta de restaurante dedicada para o notebook da apresentação pertence à
   `PA-DIAG-111`; até ela existir, não compartilhar a sessão de super admin.

## Massa mínima esperada

- uma categoria visível;
- quatro ou mais produtos demonstrativos;
- cardápio ativo e aceitando pedidos;
- retirada habilitada;
- uma forma de pagamento manual segura;
- módulos customizados sem alterar as sete unidades reais.

## Reset permitido

O reset deve ser idempotente e por `organization_id` + `store_id` da demo. Reexecutar a
preparação não pode criar uma segunda demo nem alterar clientes reais. Qualquer limpeza
futura deve ser uma rotina específica, auditada e com allowlist de `platform_demo`.

