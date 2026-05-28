param(
  [string]$AppDir = "app-lab/sati-clip-app",
  [switch]$SkipCheck,
  [switch]$NoClean,
  [ValidateSet("true", "false")]
  [string]$DemoMode = "true"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$outDir = Join-Path $root "out"
$appPath = Join-Path $root $AppDir
$pythonDir = Join-Path $appPath "python"
$webDir = Join-Path $pythonDir "web"
$bridgeSource = Join-Path $root "sati_ws_bridge.py"
$requirementsSource = Join-Path $root "requirements.txt"

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Command
}

function Assert-InsidePath {
  param(
    [string]$Child,
    [string]$Parent,
    [string]$Label
  )

  $parentFull = [System.IO.Path]::GetFullPath($Parent)
  $childFull = [System.IO.Path]::GetFullPath($Child)
  if (-not $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label resolved outside expected path: $childFull"
  }
}

Set-Location $root

Run-Step "Preparing App Lab folder" {
  New-Item -ItemType Directory -Force -Path $webDir | Out-Null
}

Assert-InsidePath -Child $webDir -Parent $appPath -Label "Web output folder"
Assert-InsidePath -Child $appPath -Parent $root -Label "App Lab folder"

Run-Step "Copying Python bridge files" {
  Copy-Item -LiteralPath $bridgeSource -Destination (Join-Path $pythonDir "sati_ws_bridge.py") -Force
  Copy-Item -LiteralPath $requirementsSource -Destination (Join-Path $pythonDir "requirements.txt") -Force
}

if (-not $SkipCheck) {
  Run-Step "Checking TypeScript" {
    npm run check
  }
}

Run-Step "Building static Next.js export" {
  $env:NEXT_PUBLIC_SATI_DEMO_MODE = $DemoMode
  npm run build
}

$indexPath = Join-Path $outDir "index.html"
if (-not (Test-Path $indexPath)) {
  throw "Build output is missing: $indexPath"
}

if (-not $NoClean) {
  Run-Step "Cleaning App Lab web folder" {
    $webFull = [System.IO.Path]::GetFullPath($webDir)
    $appFull = [System.IO.Path]::GetFullPath($appPath)
    if (-not $webFull.StartsWith($appFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean outside App Lab folder: $webFull"
    }

    Get-ChildItem -LiteralPath $webDir -Force | Remove-Item -Recurse -Force
  }
}

Run-Step "Copying out/ into python/web/" {
  Copy-Item -Path (Join-Path $outDir "*") -Destination $webDir -Recurse -Force
}

$fileCount = (Get-ChildItem -LiteralPath $webDir -Recurse -File -Force).Count
$webFullPath = [System.IO.Path]::GetFullPath($webDir)

Write-Host ""
Write-Host "App Lab web bundle ready." -ForegroundColor Green
Write-Host "Target: $webFullPath"
Write-Host "Files copied: $fileCount"
Write-Host "Serve test: python -m http.server 8080 --directory `"$webFullPath`""
