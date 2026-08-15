# Cliente recorrente e endereço seguro — [324]

## Objetivo

Permitir que um cliente que já concluiu um pedido no mesmo dispositivo reutilize seus dados e endereço sem transformar o telefone em uma chave pública de consulta de dados pessoais.

## Contrato de reconhecimento

- o primeiro pedido continua exigindo nome/WhatsApp e, em delivery, endereço completo;
- o pedido cria ou reutiliza o `customer` pela regra autoritativa já existente de telefone normalizado;
- depois que o pedido é criado com sucesso, o servidor emite um token aleatório de 256 bits;
- somente o SHA-256 do token é persistido em `customer_recognition_tokens`;
- o token bruto fica em cookie HttpOnly, `SameSite=Lax`, `Secure` em produção e escopado ao cardápio da unidade;
- validade padrão: 180 dias;
- tokens expirados ou revogados não reconhecem o cliente;
- o token é escopado por organização + unidade + cliente.

## Privacidade

Digitar um telefone conhecido em um navegador novo **não libera endereço salvo**. O telefone pode continuar sendo usado internamente para vincular o checkout ao mesmo `customer`, mas os endereços só são devolvidos ao Server Component quando existe um token de reconhecimento válido daquele restaurante/unidade.

Nenhuma rota pública recebe `SELECT` direto em `customers`, `customer_addresses` ou `customer_recognition_tokens`. A tabela de reconhecimento usa RLS e não concede privilégios a `anon` ou `authenticated`.

## Persistência de endereço

O endereço não é gravado quando o cliente apenas digita o formulário. Ele é persistido somente após a criação bem-sucedida de um pedido `delivery`, por trigger do banco a partir do snapshot autoritativo do pedido.

A migration adiciona um fingerprint normalizado para deduplicar o mesmo endereço por cliente. A primeira morada ativa vira endereço principal; pedidos posteriores no mesmo endereço atualizam dados auxiliares sem criar duplicata.

## Segunda compra no mesmo dispositivo

1. o Server Component lê o cookie HttpOnly;
2. `CustomerRecognitionService` valida hash, organização, unidade, expiração e revogação;
3. a identificação pode ser pré-preenchida para conferência;
4. o checkout só mostra endereços depois que a identificação salva aponta para o mesmo `customer` reconhecido;
5. a UI envia apenas o índice do endereço da lista já resolvida no servidor — nenhum UUID interno é exposto;
6. `CheckoutService.useRecognizedAddress()` resolve novamente o token e o endereço no servidor;
7. o endereço passa por `saveAddress()` e portanto por `DeliveryQuoteService`;
8. taxa, pedido mínimo, frete grátis e ETA são recalculados;
9. a revisão final do checkout revalida a entrega novamente antes do pedido.

## Dispositivo novo

Sem cookie de reconhecimento válido:

- nome/telefone continuam funcionando normalmente;
- cliente existente pode ser vinculado internamente;
- endereço salvo não é mostrado;
- o cliente informa o endereço novamente;
- depois de concluir o pedido, esse dispositivo recebe seu próprio token de reconhecimento.

## Falhas e rollback

Falha ao emitir o token de conveniência depois que o pedido já foi criado não cancela nem faz rollback do pedido. O erro é registrado de forma sanitizada e o cliente segue para o acompanhamento. Em uma compra futura sem token válido, o checkout simplesmente volta ao fluxo de endereço manual.

A persistência de endereço, por outro lado, ocorre na mesma transação da inserção do pedido; se o trigger falhar, a criação do pedido também falha e pode ser repetida de forma idempotente pelo mecanismo existente.

## Segurança / invariantes

- telefone isolado nunca autoriza leitura do endereço;
- token bruto nunca é gravado no banco ou em log;
- store/organization fazem parte da resolução;
- endereço salvo nunca ignora a cotação server-side;
- retirada continua sem endereço;
- browser não ganha grants novos sobre PII;
- o reconhecimento é uma conveniência de dispositivo, não autenticação de conta nem prova universal de identidade.

## Testes

`tests/customer-recognition.test.ts` cobre token opaco/hash, cookie escopado, RLS/grants, deduplicação de endereço, ordem de emissão após o pedido e o uso obrigatório do caminho canônico de cotação.

A homologação comercial final [330] deve ainda provar: primeira compra, segunda compra no mesmo dispositivo e dispositivo novo com o mesmo telefone sem vazamento de endereço.
