"""Package the tested agent with a verified, portable official Windows runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--node-exe', required=True)
parser.add_argument('--node-version', required=True)
parser.add_argument('--node-sha256', required=True)
parser.add_argument('--license', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
node = Path(args.node_exe)
assert hashlib.sha256(node.read_bytes()).hexdigest() == args.node_sha256, 'Runtime checksum mismatch'
manifest = json.loads((repo / 'print-agent/manifest.json').read_text())
for name, expected in manifest['sha256'].items():
    assert hashlib.sha256((repo / 'print-agent' / name).read_bytes()).hexdigest() == expected, name
target = Path(args.output)
target.parent.mkdir(parents=True, exist_ok=True)
prefix = 'PedeAqui-Piloto'
readme = '''PEDEAQUI - PILOTO NO NOTEBOOK DO WESLEY

1. Extraia todo o ZIP (botao direito > Extrair tudo).
2. Abra Iniciar-Piloto.cmd dentro da pasta extraida.
3. Aguarde a mensagem de conclusao. Nao precisa executar como administrador.
4. Envie Relatorio-Piloto-PedeAqui.json nesta conversa.

O teste instala uma copia isolada em LOCALAPPDATA/PedeAqui/DiagnosticoPiloto.
Nao cria inicio automatico, servicos, tarefas ou credenciais de producao.
Nao altera o agente de impressao existente, pedidos, filas ou configuracoes.
Consulta Windows/Epson e testa o agente com uma impressora simulada local.
Nenhum papel sera impresso. Os testes usam credenciais ficticias locais.
Consulta apenas os enderecos publicos do PedeAqui e GitHub para verificar rede.
O relatorio fica local: este piloto nao envia dados para o servidor da loja.
Nao testa autenticacao de producao nem certifica impressao fisica.
O runtime Node.js portatil ja esta incluido: nao precisa instalar dependencias.

Para repetir, abra Iniciar-Piloto.cmd novamente. O relatorio anterior sera
substituido. Ao terminar, todos os processos de teste sao encerrados.
Se interromper a janela antes de terminar, o relatorio pode nao ser criado.
Nao envie este piloto para o computador da Dona Maria nesta etapa.
'''
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    archive.writestr(prefix + '/LEIA-ME.txt', readme.replace('\n', '\r\n'))
    for name in ['Iniciar-Piloto.cmd', 'Preparar-Piloto.ps1']:
        content = (repo / 'print-agent/pilot' / name).read_text().replace('\n', '\r\n')
        archive.writestr(prefix + '/' + name, content)
    for name in manifest['files']:
        archive.write(repo / 'print-agent' / name, prefix + '/print-agent/' + name)
    archive.write(repo / 'print-agent/pilot/pilot.mjs', prefix + '/print-agent/pilot/pilot.mjs')
    archive.write(node, prefix + '/tools/node.exe')
    archive.write(Path(args.license), prefix + '/tools/LICENSE-Nodejs.txt')
    archive.writestr(prefix + '/tools/runtime.json', json.dumps({'version': args.node_version, 'platform': 'win-x64', 'sha256': args.node_sha256}))
print(json.dumps({'file': str(target), 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}))
