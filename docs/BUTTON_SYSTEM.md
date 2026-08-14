# PedeAqui — Sistema oficial de botões

> Issue lógica: **[262]**. Dependências: [259]–[261].

## Princípio

Toda ação nova da interface deve usar `Button` de `src/components/ui/button.tsx`. Não criar novos estilos de botão por módulo quando uma variante existente resolver a intenção.

## Variantes

| API | Intenção | Exemplos |
|---|---|---|
| `tone="primary"` | ação principal da etapa | Salvar, Continuar, Finalizar |
| `tone="secondary"` | ação importante porém não dominante | Voltar, Atualizar, Ver detalhes |
| `tone="ghost"` | ação discreta/terciária | Fechar, dispensar, opções auxiliares |
| `tone="danger"` | ação destrutiva/crítica | Excluir, cancelar definitivamente |

A cor nunca deve ser a única informação para uma ação crítica: o rótulo precisa explicar claramente o efeito.

## Tamanhos

- `sm`: 36 px em dispositivos de ponteiro preciso; indicado para controles densos de baixa prioridade.
- `md`: 42 px e padrão da plataforma.
- `lg`: 48 px para ações de maior destaque.
- em `pointer: coarse`, todo botão mantém alvo mínimo de 48 px, inclusive `sm`.

## Botão de ícone

Usar `iconOnly` apenas quando o símbolo for reconhecível no contexto. O TypeScript exige `aria-label` para essa variante.

```tsx
<Button iconOnly tone="ghost" aria-label="Fechar">
  ×
</Button>
```

Não usar ícone sem nome acessível.

## Loading

`loading`:

- desabilita o botão nativamente para impedir duplo envio;
- aplica `aria-busy`;
- mostra indicador visual;
- preserva o rótulo original ou usa `loadingLabel` quando fornecido.

```tsx
<Button loading={saving} loadingLabel="Salvando">
  Salvar
</Button>
```

O estado de loading deve representar uma operação real em andamento; não usar como animação decorativa.

## Disabled

Usar `disabled` somente quando a ação realmente não pode ser executada. Quando o motivo não for evidente, a tela deve explicar a condição necessária em texto próximo.

## Pressed/toggle

Botões de alternância podem usar o atributo nativo `aria-pressed`. O sistema possui feedback visual consistente para `aria-pressed="true"`.

## Foco e teclado

Todos os botões usam o `--focus-ring` oficial e continuam acionáveis por teclado através do elemento HTML `<button>` nativo. Não substituir por `div` clicável.

## Motion

Hover, active, pressed e loading usam os tokens de motion da [260]. `prefers-reduced-motion` é respeitado automaticamente.

## White-label

O botão usa tokens semânticos da plataforma. O AppShell já preserva o contrato atual de acento configurável por restaurante através dos aliases semânticos existentes. Não hardcodar cor de restaurante dentro do componente.

## Migração

A [262] define o componente e o contrato oficial. A remoção ampla de botões inline/hardcoded de módulos legados continua na etapa [269], evitando uma migração massiva e arriscada nesta issue.
