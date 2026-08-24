# Rollout seguro — WhatsApp PedeAqui

1. Merge somente com CI verde.
2. Deploy preserva canais existentes como `cloud_api`.
3. Não alterar `meta_billing_mode` automaticamente.
4. Não habilitar coexistência comercialmente sem configuração Meta correspondente.
5. Primeiro teste real do novo fluxo deve usar tenant controlado.
6. Depois, homologar segundo restaurante real via botão, sem configuração técnica manual.
7. Somente após A/B multi-tenant verde considerar #445 concluída.
8. Se houver regressão no onboarding, canais já conectados continuam funcionando pelo provider/webhook existente; WhatsApp permanece opcional para novos clientes.
