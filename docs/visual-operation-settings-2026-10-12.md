# Configurações de pagamentos, WhatsApp, fluxo e impressão — 12/10/2026

Continuação do diagnóstico #1234 e do plano visual #1226. O bloco cobre seis rotas e sete cenários renderizados (pagamento manual e OAuth são cenários distintos).

## Aplicação

- **Pagamentos:** cabeçalho, superfícies e tipografia do padrão de configurações; inclusão de forma personalizada sob demanda; nomes com rótulos persistentes e IDs específicos; salvamentos de nome, ativação, remoção, métodos locais e Pix independentes. Remoção e desconexão pedem confirmação no próprio sistema. A conta OAuth conectada continua distinta do Pix habilitado. Configuração manual mantém campos de senha sem valor preenchido e o comportamento de manter a credencial quando o campo fica vazio.
- **WhatsApp:** conexão e saúde permanecem visíveis. Avisos, saudação/menu, transferência e encerramento ficam em seções expansíveis; atendimento automático e aceitação de pedidos continuam destacados. Todas as preferências continuam dentro do único formulário original e são salvas pelo mesmo botão. Campos montados, textos e preferências preservados ao recolher as seções; `FormDisclosure` abre a seção quando a validação nativa encontra um campo inválido. Estados, gatilhos e razões da automação ficam legíveis e quebram linha no celular. Textos de cada aviso recebem nome acessível; edição e prévia continuam locais. Cadastro oficial Meta e seus estados permanecem no mesmo componente.
- **Fluxo de pedidos:** cabeçalho de 24 px, escolhas compactas, ajuda de 13 px, cartões de 12 px e foco visível. Botão de salvar acima da navegação inferior no celular. Legenda acessível do grupo usa ocultação visual efetiva. Completo, Simplificado, Personalizado, finalização rápida, etapas obrigatórias, campos ocultos e prévias mantêm a lógica original.
- **Impressão:** configuração guiada, gerenciamento de conexões e formato/vias recebem tipografia e tamanhos coerentes, controles de pelo menos 44 px, foco visível e estados semânticos. Impressora manual e criação de local são abertas por tarefa na configuração avançada. Nome do computador recebe rótulo persistente no formulário real de conexão; idempotência e estado de processamento permanecem iguais. Reimpressão recebe nome acessível para o motivo. Vias padrão e por local continuam em formulários independentes; confirmação de desvínculo e visualização sem permissão permanecem intactas.

## Validação

- 2.750 testes em 417 arquivos; sete novos casos renderizam páginas e componentes reais com serviços e ações simulados. Verificam isolamento dos formulários, nomes dos campos, IDs, OAuth com Pix desligado, idioma/modelo do WhatsApp, minutos distintos, etapas obrigatórias ocultas, destinos de impressão, vias e confirmação de desvínculo, além de listas vazias e acesso somente de leitura.
- TypeScript e build de produção passam. Lint: zero erros, oito avisos anteriores ao bloco.
- Chromium local: sete cenários × seis larguras (360, 390, 768, 1024, 1366 e 1920 px) × dois temas = 84 combinações. Verifica ausência de transbordamento horizontal com seções fechadas e abertas, igualdade de FormData, retenção do texto ou seleção após recolher/reabrir e foco de teclado em disclosures existentes. Inspeção das imagens de pagamentos, fluxo, WhatsApp e impressão em celular/desktop.
- Esta matriz usa dados fictícios e componentes renderizados; não equivale a homologação autenticada de todas as rotas nem verifica gravações reais. Não houve criação de pagamentos, envio de mensagens, geração de credenciais, teste físico de impressão ou alteração de configurações de clientes.

## Contratos preservados

Nenhuma mudança em ações, serviços, permissões, banco, regras financeiras, estados de pedidos, integração Meta/OAuth, roteamento de impressão ou processamento de filas. Fotos e otimização de mídia não fazem parte deste bloco.

O diagnóstico permanece aberto: há outras famílias de páginas e a homologação autenticada ampliada ainda está pendente. CI e Browser Homologation devem passar no mesmo commit antes do merge; produção deve ficar READY e ser conferida no domínio PedeAqui.
