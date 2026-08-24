# ADR — Canal único com dois modos de conexão

Decisão: PedeAqui mantém um único subsistema de WhatsApp. `cloud_api` e `coexistence` são modos de onboarding/conexão, não providers paralelos.

Consequências:
- mesmo webhook;
- mesmo provider Meta Cloud;
- mesma inbox;
- mesmas regras de tenant;
- mesmas automações;
- diferenças ficam confinadas ao onboarding e lifecycle do canal.
