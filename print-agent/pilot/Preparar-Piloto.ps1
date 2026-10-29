$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try {
  $package = $PSScriptRoot
  $root = Join-Path $env:LOCALAPPDATA 'PedeAqui\DiagnosticoPiloto'
  $sourceNode = Join-Path $package 'tools\node.exe'
  $expected = (Get-Content -Raw (Join-Path $package 'tools\runtime.json') | ConvertFrom-Json).sha256
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $sourceNode).Hash.ToLowerInvariant() -ne $expected) { throw 'O componente de execucao nao passou na verificacao. Baixe o pacote novamente.' }
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  # This dedicated folder is separate from PedeAqui\PrintAgent.
  Copy-Item -LiteralPath (Join-Path $package 'print-agent') -Destination $root -Recurse -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $root 'tools') | Out-Null
  Copy-Item -LiteralPath $sourceNode -Destination (Join-Path $root 'tools\node.exe') -Force
  $env:PEDEAQUI_PILOT_OUTPUT = Join-Path $package 'Relatorio-Piloto-PedeAqui.json'
  Write-Host 'Piloto instalado somente para este usuario. Nenhum servico ou inicio automatico sera criado.'
  Write-Host 'A Epson sera consultada, mas nenhuma impressao fisica sera enviada.'
  & (Join-Path $root 'tools\node.exe') (Join-Path $root 'print-agent\pilot\pilot.mjs')
  $result = $LASTEXITCODE
  Write-Host ('Relatorio: ' + $env:PEDEAQUI_PILOT_OUTPUT)
  exit $result
} catch {
  Write-Host 'Nao foi possivel concluir a preparacao do piloto.'
  Write-Host $_.Exception.Message
  exit 1
}
