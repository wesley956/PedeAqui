# UX2 — Homologação local (rede do computador)

Sobe o PedeAqui inteiro neste computador, com um banco próprio e uma loja fictícia. Não usa nenhuma chave de produção e não envia WhatsApp, não cobra e não imprime.

## Precisa estar instalado
- **Node 22 ou mais novo** — https://nodejs.org
- **Docker Desktop**, aberto e pronto — https://www.docker.com/products/docker-desktop
- Git (para receber atualizações)
- Cerca de 6 GB livres em disco (imagens do banco + dependências)

A ferramenta do Supabase não precisa ser instalada: o script usa `npx` se ela não existir.

## Como iniciar
- Windows: dois cliques em **`Iniciar homologacao.cmd`**, na raiz do projeto.
- Ou, num terminal na raiz do projeto: `node scripts/homologacao-local/iniciar.mjs`

Na primeira vez leva vários minutos (baixa dependências e imagens do banco, cria as tabelas e a loja). Nas seguintes, cerca de um minuto. Ao final aparece o endereço para o computador (`http://localhost:3000`) e para o celular na mesma rede Wi-Fi (`http://192.168.x.x:3000`), com o login e a senha da loja fictícia.

| Comando | O que faz |
| --- | --- |
| `node scripts/homologacao-local/iniciar.mjs` | sobe tudo e deixa rodando; Ctrl+C para o sistema |
| `… iniciar.mjs --zerar` | apaga o banco local e recria a loja fictícia do zero |
| `… iniciar.mjs --parar` | desliga o banco local (libera memória) |
| `… iniciar.mjs --verificar` | sobe, confere as telas principais e encerra (usado no CI) |

## O que tem na loja fictícia
"Salgados da Vila": 16 produtos, 9 grupos de sabores (a mesma lista copiada por tamanho, como nas lojas reais), 10 pedidos em etapas diferentes, mesas, bairros, formas de pagamento e todos os 21 módulos ligados. Cardápio público em `/m/salgados-da-vila`.

## Limites conhecidos
- Roda em modo de desenvolvimento do Next.js: a primeira abertura de cada tela demora alguns segundos. Não serve para medir velocidade.
- Validado automaticamente em Linux (CI). **No Windows ainda não foi executado**; o script foi escrito em Node para ser igual nos dois, mas a primeira execução no Windows é o teste real.
- Celular não abre? Libere as portas 3000 e 54321 no firewall do Windows para a rede privada. Se o IP do computador mudar, rode o script de novo.
- Pasta dentro do OneDrive: a sincronização de `node_modules` e `.next` deixa tudo lento e pode travar arquivos. Pause o OneDrive enquanto usa ou mova a pasta para fora dele (ex.: `C:\pedeaqui-ux2`).
- WhatsApp, pagamento online, iFood, fiscal e impressão ficam sem credenciais: as telas abrem, mas a integração real não é testada aqui.
