# UX2 — Site institucional, telas de acesso e painel da plataforma

Estado: **Parcialmente validado** (auditados e ajustados no que estava errado; sem redesenho de estrutura).

## Site institucional e acesso
Auditados em 1366 px e 360 px: início, como funciona, recursos, planos, pedidos e atendimento, entrega e fidelização, informações legais, criar conta, recuperar senha, acesso do entregador, termos e privacidade. Sem rolagem lateral e sem erro em nenhuma.

- Não foi alterado: o site usa o laranja como cor de marca (títulos e botões), o que é coerente com uma página de venda. A regra "laranja só na ação principal" vale para o painel.
- Ponto em aberto (não alterado): em **Criar conta** os três planos aparecem como links sublinhados; cartões com preço e destaque do plano escolhido deixariam a escolha mais clara. Fica como proposta porque mexe no fluxo de cadastro e cobrança.

## Painel da plataforma (`/platform`)
17 telas auditadas com o usuário fictício como administrador da plataforma (só na homologação local).

- **Corrigido**: em Diagnóstico de pedidos apareciam códigos internos (`pending_confirmation`, `pending`); em Receita e cobranças aparecia `not_started`. Agora em português.
- Já tinham recebido a varredura de cor (rótulos e links neutros).
- Ponto em aberto (não alterado): a tela inicial tem quatro botões laranja ("Abrir demonstração", "Novo restaurante", "Cadastrar cliente", "Abrir demonstração agora").

## Não coberto
Telas da plataforma que dependem de registro específico (empresa, unidade, pedido, WhatsApp da unidade, modo suporte) e as telas `/convite`, `/nova-senha`, `/onboarding`, `/mesa/[code]`, que precisam de um link válido.

## Atualização de 15/11/2026
- **Criar conta:** os três planos viraram cartões com nome, preço e "Escolher →" (mesmos links e mesmo fluxo de antes).
- **Plataforma:** auditadas as 15 telas que faltavam — 7 fixas (apresentação, demonstração, fundadores, incidentes, praticidade, privacidade, modo suporte) e 8 que dependem de empresa, unidade ou pedido. Total: 32 de 32.
- **Pedido 360°:** estados em português, com o código interno em letra pequena.
- "Apresentação" e "Abrir demonstração" falhavam na homologação por diferença de ambiente (P-05 em `PENDENCIAS-BANCO.md`).
- Não coberto: `/platform/empresas/[id]` — a tela inicial da plataforma não tem link direto para a empresa; a de unidade (`/platform/empresas/[id]/unidades/[id]`) depende dela.
