param(
  [string]$Uno = "arduino@LPK.local"
)

$ErrorActionPreference = "Stop"

$remoteCommand = @'
echo "== Host =="
hostname
hostname -I || true

echo
echo "== Listening ports =="
ss -ltnp | grep -E ':8080|:8765' || true

echo
echo "== Sati processes =="
pgrep -af 'sati_ws_bridge.py|http.server 8080' || true

echo
echo "== Bridge log =="
tail -n 40 ~/sati-coach/bridge.log 2>/dev/null | tr -d '\000' || true

echo
echo "== Web log =="
tail -n 20 ~/sati-coach/web.log 2>/dev/null | tr -d '\000' || true
'@

($remoteCommand -replace "`r", "") | ssh $Uno "bash -s"
