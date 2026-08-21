# Assistente inteligente de primeiros passos

## Problema

O guia antigo explicava telas em uma sequência de modais. Ele ensinava onde ficavam as áreas, mas não sabia se a loja já estava configurada, não detectava tarefas concluídas e não acompanhava a pessoa enquanto ela executava uma ação real.

## Objetivo

Transformar o tutorial em um assistente operacional que responda três perguntas:

1. O que falta para esta loja começar a operar?
2. Onde faço isso agora?
3. O PedeAqui consegue confirmar sozinho que a tarefa foi concluída?

## Experiência planejada

- checklist persistente com percentual de prontidão;
- detecção automática do estado real da unidade;
- tarefas adaptadas ao perfil de negócio e aos módulos disponíveis;
- orientação contextual flutuante na tela da tarefa;
- botão `Verificar progresso` para revalidar imediatamente;
- tarefas concluídas continuam disponíveis para revisão;
- perfis operacionais recebem guia por função, sem checklist administrativo;
- o assistente pode ser fechado e retomado pelo botão fixo `Guia`;
- uma nova versão de chave do guia evita misturar o progresso antigo com o novo modelo.

## Checklist inicial do proprietário

O conjunto é montado apenas com áreas que o usuário realmente pode acessar e chega a no máximo sete tarefas:

1. conferir dados principais da loja;
2. cadastrar o primeiro produto/cardápio;
3. configurar horários;
4. configurar formas de pagamento;
5. configurar entrega, quando o módulo existir;
6. cadastrar entregador e liberar acesso mobile, quando o módulo existir;
7. registrar e acompanhar o primeiro pedido de ponta a ponta.

## Detecção automática

O servidor consulta, sempre com organização e unidade explicitamente filtradas:

- dados da loja;
- produtos ativos;
- horários ativos;
- formas de pagamento habilitadas;
- configuração de entrega;
- entregadores ativos e entregadores com acesso mobile;
- pedidos existentes.

Esses dados são apenas leitura para o assistente. O tutorial não cria nem altera dados operacionais.

## Adaptação por segmento

- Restaurante: usa linguagem de cardápio, produção e operação de restaurante.
- Gás: usa catálogo, botijões, troca/casco, separação e entregadores.
- Comércio genérico: usa catálogo e vocabulário neutro.

## Adaptação por função

Proprietários recebem o checklist de implantação. Gerentes, caixa, atendentes, salão, cozinha, entregadores e financeiro recebem uma central curta de aprendizado contendo apenas as áreas liberadas para a função.

## Critérios de qualidade

- não bloquear o uso normal do sistema;
- permitir `Fazer depois` e retomada;
- não marcar tarefa como concluída apenas por clique;
- nunca vazar dados de outra organização/unidade;
- preservar acessibilidade de teclado e redução de movimento;
- manter responsividade no celular;
- cobrir a lógica de checklist e detecção com testes automatizados.
