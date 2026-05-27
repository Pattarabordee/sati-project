param(
  [string]$Uno = "arduino@LPK.local",
  [string]$BleName = "Sati-Nano",
  [string]$BleChar = "19B10001-E8F2-537E-4F6C-D104768A1214",
  [string]$BleAllowServiceFallback = "false",
  [string]$WebPort = "8080",
  [string]$WsPort = "8765"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $root "out"
$bridgeDir = "~/sati-coach/bridge"
$webDir = "~/sati-coach/web"
$toolsDir = "~/sati-coach/tools"
$hostName = ($Uno -split "@")[-1]

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Command
}

Set-Location $root

Run-Step "Checking TypeScript" {
  npm run check
}

Run-Step "Building static web output" {
  npm run build
}

if (-not (Test-Path (Join-Path $outDir "index.html"))) {
  throw "Build output is missing: $outDir\index.html"
}

Run-Step "Creating folders on UNO Q" {
  ssh $Uno "mkdir -p $webDir $bridgeDir $toolsDir"
}

Run-Step "Uploading static web files" {
  scp -r "$outDir\*" "${Uno}:$webDir/"
}

Run-Step "Uploading Python bridge" {
  scp "$root\sati_ws_bridge.py" "$root\requirements.txt" "${Uno}:$bridgeDir/"
}

Run-Step "Uploading utility scripts" {
  Get-ChildItem (Join-Path $root "scripts") -File |
    Where-Object { $_.Extension -in ".py", ".mjs", ".ps1" } |
    ForEach-Object {
      scp $_.FullName "${Uno}:$toolsDir/"
    }
}

$remoteCommand = @"
pkill -f '[s]ati_ws_bridge.py' || true
pkill -f 'http.server $WebPort' || true
for i in 1 2 3 4 5; do
  ss -ltn "sport = :$WsPort" | grep -q LISTEN || break
  sleep 1
done
for i in 1 2 3 4 5; do
  ss -ltn "sport = :$WebPort" | grep -q LISTEN || break
  sleep 1
done
cd $bridgeDir
nohup env SATI_WS_PORT=$WsPort SATI_BLE_NAME=$BleName SATI_BLE_CHAR=$BleChar SATI_BLE_ALLOW_SERVICE_FALLBACK=$BleAllowServiceFallback SATI_BLE_SCAN_TIMEOUT=3 python3 sati_ws_bridge.py > ~/sati-coach/bridge.log 2>&1 < /dev/null &
cd ~/sati-coach
nohup python3 -m http.server $WebPort --directory web --bind 0.0.0.0 > ~/sati-coach/web.log 2>&1 < /dev/null &
sleep 2
ss -ltnp | grep -E ':$WebPort|:$WsPort' || true
"@

Run-Step "Restarting Sati services on UNO Q" {
  ($remoteCommand -replace "`r", "") | ssh $Uno "bash -s"
}

Write-Host ""
Write-Host "Wireless deploy complete." -ForegroundColor Green
Write-Host "Open: http://$hostName`:$WebPort/?live=1"
Write-Host "WebSocket: ws://$hostName`:$WsPort"
