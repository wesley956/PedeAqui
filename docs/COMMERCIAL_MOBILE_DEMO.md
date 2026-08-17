# PedeAqui — demonstração e onboarding comercial pelo celular

## Objetivo

Permitir que o proprietário do PedeAqui apresente e inicie um restaurante durante uma visita comercial sem depender de computador, Meta Business ou do número de WhatsApp já estar definido.

## Fluxo da visita

1. Abra `/platform` no celular.
2. Toque em **Abrir demonstração**.
   - Na primeira vez, o PedeAqui cria uma única unidade marcada internamente como demonstração.
   - A demo recebe cardápio próprio e não entra na fila de clientes reais.
3. Mostre o cardápio e o fluxo público ao prospect.
4. Se o cliente avançar, volte ao Painel do Proprietário e toque em **Novo restaurante**.
5. Informe somente nome da empresa e nome da unidade.
6. E-mail do proprietário é opcional.
7. O WhatsApp nasce como **Configurar depois** e não bloqueia o restante.

## Depois da visita

A fila comercial do Painel do Proprietário mostra as unidades reais cujo WhatsApp ainda está pendente. Abra a visão 360 da unidade quando o cliente decidir qual número utilizar.

## Segurança

- Provisionamento cross-tenant é exclusivo de `super_admin`.
- A RPC de banco é executável somente por `service_role`.
- O administrador da plataforma não vira membro do restaurante criado.
- Não existe senha padrão.
- Convite opcional do proprietário expira em 7 dias e é vinculado ao e-mail informado.
- Convites normais continuam sem permissão para escalar para `owner`.
- A demo é identificada por `stores.platform_demo` e excluída da fila comercial real.
