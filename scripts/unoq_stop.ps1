param(
  [string]$Uno = "arduino@LPK.local"
)

$ErrorActionPreference = "Stop"

$remoteCommand = @'
pkill -f '[s]ati_ws_bridge.py' || true
pkill -f 'http.server 8080' || true
'@

$remoteCommand | ssh $Uno "bash -s"
Write-Host "Stopped Sati demo services on $Uno" -ForegroundColor Green
