# PedeAqui — Sistema de formulários

> Origem: issue **[263]**. Esta camada usa os tokens definidos em [259] e [260].

## Componentes oficiais

- `Input`: texto, e-mail e campos gerais.
- `Textarea`: observações e conteúdo multilinha.
- `SelectField`: escolhas em lista.
- `Checkbox`: opções independentes.
- `Radio`: escolha exclusiva dentro de um grupo.
- `Switch`: estado liga/desliga.
- `SearchInput`: pesquisa.
- `MoneyInput`: entrada monetária com teclado decimal.
- `PhoneInput`: telefone/WhatsApp.
- `AddressInput`: endereço com autocomplete semântico.
- `QuantityInput`: quantidade numérica.

Os componentes ficam em `src/components/ui/form-controls.tsx`. O antigo import `src/components/ui/input.tsx` e o `Select` de `primitives.tsx` continuam funcionando, mas apontam para esta implementação canônica.

## Contrato de campo

Todo campo deve ter nome acessível. Campos visuais usam `label`; texto auxiliar usa `hint`; validação usa `error`. Quando houver erro, o controle recebe `aria-invalid` e a mensagem é associada por `aria-describedby`. Erros são anunciados com `role="alert"`.

Campos obrigatórios mostram explicitamente `Obrigatório`; não dependem apenas do asterisco. `required` também é aplicado ao elemento nativo.

## Loading e disabled

`loading` aplica `aria-busy` e bloqueia a edição enquanto a operação está em andamento. `disabled` mantém a semântica HTML nativa. Nenhum dos dois estados remove a label ou o contexto do campo.

## Teclado e touch

Controles usam a altura estrutural `--control-height`. Em dispositivos `pointer: coarse`, a fundação [260] amplia o alvo principal e escolhas usam área mínima adequada para toque. Foco visível usa `--focus-ring`.

## Validação visual

Erros usam `--state-danger`, `--state-danger-surface` e `--state-danger-text`; nunca cor literal. Estado de erro deve sempre ter texto, não apenas mudança de borda.

## Tipos especializados

`SearchInput`, `MoneyInput`, `PhoneInput`, `AddressInput` e `QuantityInput` são especializações semânticas da base `Input`. Eles não calculam preço, validam endereço no servidor ou aplicam regra de negócio; apenas fornecem teclado, autocomplete e semântica apropriados.

## Responsabilidade dos módulos

Cada módulo continua responsável por regras de domínio, validação de servidor e mensagens específicas. O design system fornece estrutura, acessibilidade, ergonomia e consistência visual.
