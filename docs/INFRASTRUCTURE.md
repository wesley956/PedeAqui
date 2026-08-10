# Cruz — Infraestrutura e Ambientes

## GitHub

Repositório oficial deste novo sistema: `wesley956/cruz`.

A documentação de produto vive em `docs/` e a primeira fundação está sendo implementada no PR #17.

## Supabase — atenção

Em 10/08/2026 foi inspecionado o projeto Supabase existente chamado **Cruz**.

Ele **não está vazio** e já possui um sistema anterior de agenda/serviços, com migrations próprias e tabelas como:

- `appointments`
- `appointment_events`
- `availability_blocks`
- `businesses`
- `business_members`
- `clients`
- `professionals`
- `services`
- `reviews`
- `weekly_availability`
- tabelas de billing/admin relacionadas.

### Decisão atual

**Não aplicar a fundação do novo sistema de restaurantes/delivery nesse banco sem uma decisão explícita de arquitetura.**

A fundação nova usa entidades genéricas como `organizations`, `stores`, `profiles`, `roles`, `permissions`, `audit_logs` e outras. Misturar os dois produtos no mesmo schema público aumentaria risco de colisão, acoplamento e migrações perigosas.

### Caminho recomendado

Usar um projeto Supabase separado para o novo sistema, mantendo:

- Auth independente;
- migrations independentes;
- RLS independente;
- backups independentes;
- staging/produção independentes.

Criar um novo projeto Supabase pode envolver custo; portanto a criação deve ser confirmada antes de ser executada.

## Status da issue Database (#2)

O SQL canônico da fundação está versionado em `supabase/sql/`, mas **não foi aplicado no Supabase existente**. A issue só deve ser fechada quando um ambiente apropriado for definido, migration criada/aplicada e RLS validado.
