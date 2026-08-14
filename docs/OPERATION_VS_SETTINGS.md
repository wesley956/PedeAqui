# PedeAqui — Operação diária x Configurações

> Issue lógica: **[276]**

## Princípio

Telas usadas durante o turno permanecem diretas: **Pedidos, PDV, Caixa, Salão, Produção, Entregas e Meu roteiro**. Configurações concentra parâmetros, equipamentos e cadastros que não precisam competir com essas ações rápidas.

## Hub de Configurações

`/configuracoes` agora organiza dois blocos:

1. **Loja, canais e equipamentos** — cardápio digital, horários, entrega, pagamentos, conversas/WhatsApp e impressões.
2. **Cadastros e estrutura** — atalhos para módulos administrativos já permitidos pelo RBAC, como catálogo, estoque, fornecedores, compras, equipe, escala e salão/mesas quando esse módulo já está disponível para o usuário.

Os atalhos administrativos são derivados de `NavigationAccessService`; portanto Configurações não cria uma nova forma de autorização.

## Preservação de URLs

Nenhuma rota existente foi removida ou renomeada. Os módulos continuam podendo ser acessados por seus deep links originais e pelas rotas operacionais/contextuais quando apropriado.

## Permissões

Os cards de configuração usam sinais de permissões já existentes (`stores.view`, `integrations.view`, `conversations.view`, `printing.view`). A página não concede acesso: a própria rota/serviço de destino continua validando a permissão autoritativa.

## Resultado esperado

- durante o expediente, funções especializadas veem primeiro o que precisam executar;
- gestores/administrativo têm um lugar previsível para manutenção e cadastros;
- impressão e integrações não poluem a navegação de caixa, salão, cozinha ou entregador;
- nenhuma funcionalidade foi retirada.
