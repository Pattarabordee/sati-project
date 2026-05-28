param(
  [string]$AppDir = "app-lab/sati-clip-app",
  [string]$ZipPath = "dist/sati-clip-app-lab.zip",
  [int]$WebSmokePort = 18080,
  [int]$WsSmokePort = 18765,
  [switch]$SkipWebBuild
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$appPath = Join-Path $root $AppDir
$pythonDir = Join-Path $appPath "python"
$webDir = Join-Path $pythonDir "web"
$zipFullPath = Join-Path $root $ZipPath
$distDir = Split-Path -Parent $zipFullPath

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Command
}

function Assert-Exists {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path $Path)) {
    throw "$Label is missing: $Path"
  }
}

function Stop-StartedProcess {
  param(
    [System.Diagnostics.Process]$Process
  )

  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
  }
}

function New-AppLabZip {
  param(
    [string]$SourceDir,
    [string]$DestinationZip
  )

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem

  $archive = [System.IO.Compression.ZipFile]::Open($DestinationZip, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $sourceRoot = (Resolve-Path $SourceDir).Path.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
    Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | ForEach-Object {
      $relative = $_.FullName.Substring($sourceRoot.Length).TrimStart([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
      $entryName = $relative -replace "\\", "/"
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
  }
  finally {
    $archive.Dispose()
  }
}

Set-Location $root

if (-not $SkipWebBuild) {
  Run-Step "Rebuilding App Lab web bundle" {
    npm run app-lab:web
  }
}

Run-Step "Checking required App Lab files" {
  Assert-Exists (Join-Path $appPath "app.yaml") "App Lab manifest"
  Assert-Exists (Join-Path $pythonDir "main.py") "Python entrypoint"
  Assert-Exists (Join-Path $pythonDir "sati_ws_bridge.py") "Python WebSocket bridge"
  Assert-Exists (Join-Path $pythonDir "requirements.txt") "Python requirements"
  Assert-Exists (Join-Path $webDir "index.html") "Static web index"
  Assert-Exists (Join-Path $webDir "_next") "Next.js static assets"
  Assert-Exists (Join-Path $webDir "sati-clip") "Sati Clip generated assets"
  Assert-Exists (Join-Path $appPath "sketch\sketch.ino") "UNO Q MCU sketch"
  Assert-Exists (Join-Path $appPath "sketch\sketch.yaml") "UNO Q MCU sketch profile"
}

Run-Step "Checking Python syntax" {
  python -m py_compile (Join-Path $pythonDir "main.py") (Join-Path $pythonDir "sati_ws_bridge.py")
}

Run-Step "Checking local base path" {
  $indexText = Get-Content -LiteralPath (Join-Path $webDir "index.html") -Raw
  if ($indexText -match "/sati-project") {
    throw "Static export still contains GitHub Pages basePath /sati-project"
  }
}

Run-Step "Smoke testing static web + WebSocket bridge" {
  $oldWebPort = $env:SATI_WEB_PORT
  $oldWsPort = $env:SATI_WS_PORT
  $oldScanTimeout = $env:SATI_BLE_SCAN_TIMEOUT
  $env:SATI_WEB_PORT = [string]$WebSmokePort
  $env:SATI_WS_PORT = [string]$WsSmokePort
  $env:SATI_BLE_SCAN_TIMEOUT = "1"

  $proc = $null
  try {
    $proc = Start-Process -WindowStyle Hidden -PassThru -FilePath python -ArgumentList "main.py" -WorkingDirectory $pythonDir
    Start-Sleep -Seconds 4

    $status = (Invoke-WebRequest -UseBasicParsing "http://localhost:$WebSmokePort" -TimeoutSec 10).StatusCode
    if ($status -ne 200) {
      throw "Static web smoke test returned HTTP $status"
    }

    $wsScript = @"
import asyncio
import json
import websockets

async def main():
    async with websockets.connect("ws://localhost:$WsSmokePort") as ws:
        message = await asyncio.wait_for(ws.recv(), timeout=10)
        data = json.loads(message)
        assert "timestampMs" in data
        assert "features" in data
        assert "ble" in data
        print(data.get("postureClass"), data.get("ble", {}).get("status"))

asyncio.run(main())
"@
    $wsScript | python -
  }
  finally {
    Stop-StartedProcess -Process $proc
    $env:SATI_WEB_PORT = $oldWebPort
    $env:SATI_WS_PORT = $oldWsPort
    $env:SATI_BLE_SCAN_TIMEOUT = $oldScanTimeout
  }
}

Run-Step "Creating ZIP artifact" {
  New-Item -ItemType Directory -Force -Path $distDir | Out-Null

  if (Test-Path $zipFullPath) {
    Remove-Item -LiteralPath $zipFullPath -Force
  }

  Get-ChildItem -LiteralPath $appPath -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    Remove-Item -Recurse -Force

  New-AppLabZip -SourceDir $appPath -DestinationZip $zipFullPath
}

Run-Step "Verifying ZIP contents" {
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipFullPath)
  try {
    $zipItems = $zip.Entries | ForEach-Object { $_.FullName }
  }
  finally {
    $zip.Dispose()
  }

  $required = @(
    "app.yaml",
    "python/main.py",
    "python/sati_ws_bridge.py",
    "python/requirements.txt",
    "python/web/index.html",
    "python/web/_next/",
    "python/web/sati-clip/",
    "sketch/sketch.ino",
    "sketch/sketch.yaml"
  )

  foreach ($item in $required) {
    if (-not ($zipItems | Where-Object { $_.StartsWith($item) })) {
      throw "ZIP is missing: $item"
    }
  }
}

$zipInfo = Get-Item $zipFullPath
Write-Host ""
Write-Host "App Lab ZIP ready." -ForegroundColor Green
Write-Host "File: $($zipInfo.FullName)"
Write-Host "Size: $([Math]::Round($zipInfo.Length / 1MB, 2)) MB"
Write-Host "Install: import/open the ZIP in Arduino App Lab. app.yaml is at the ZIP root."
Write-Host "Note: Nano 33 BLE still needs its own sketch flashed separately."
Write-Host "Note: sketch/sketch.ino was packaged but not compiled by Arduino App Lab in this script."
