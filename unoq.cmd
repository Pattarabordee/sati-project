@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
set "ACTION=%~1"
set "UNO=arduino@LPK.local"

if "%ACTION%"=="" goto help
if /I "%~2"=="--uno" set "UNO=%~3"

if /I "%ACTION%"=="deploy" goto deploy
if /I "%ACTION%"=="status" goto status
if /I "%ACTION%"=="stop" goto stop
if /I "%ACTION%"=="open" goto open
if /I "%ACTION%"=="scan" goto scan
if /I "%ACTION%"=="nano" goto nano
if /I "%ACTION%"=="logs" goto logs
if /I "%ACTION%"=="help" goto help

echo Unknown command: %ACTION%
echo.
goto help

:deploy
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\deploy_unoq.ps1" -Uno "%UNO%"
exit /b %ERRORLEVEL%

:status
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\unoq_status.ps1" -Uno "%UNO%"
exit /b %ERRORLEVEL%

:stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\unoq_stop.ps1" -Uno "%UNO%"
exit /b %ERRORLEVEL%

:open
for /f "tokens=2 delims=@" %%H in ("%UNO%") do set "HOST=%%H"
start "" "http://%HOST%:8080/?live=1"
exit /b 0

:scan
ssh "%UNO%" "python3 ~/sati-coach/tools/scan_ble.py"
exit /b %ERRORLEVEL%

:nano
ssh "%UNO%" "python3 ~/sati-coach/tools/read_nano_json.py --count 5"
exit /b %ERRORLEVEL%

:logs
ssh "%UNO%" "tail -f ~/sati-coach/bridge.log"
exit /b %ERRORLEVEL%

:help
echo Sati UNO Q helper
echo.
echo Usage:
echo   unoq deploy              Build, upload, and restart Sati on UNO Q
echo   unoq status              Show ports, processes, and recent logs
echo   unoq open                Open the web demo
echo   unoq scan                Scan likely Sati/Nano BLE devices from UNO Q
echo   unoq nano                Read 5 Nano BLE JSON samples on UNO Q
echo   unoq logs                Follow bridge logs
echo   unoq stop                Stop demo services
echo.
echo Optional target:
echo   unoq deploy --uno arduino@172.16.61.210
echo   unoq status --uno arduino@172.16.61.210
exit /b 0
