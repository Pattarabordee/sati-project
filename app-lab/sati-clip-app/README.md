# Sati Clip App Lab Package

This folder is the Arduino App Lab package for Sati Clip on Arduino UNO Q.

## What runs on UNO Q

- `python/main.py` starts the static web UI and the WebSocket sensor bridge.
- `python/web/` contains the generated Next.js static export.
- `sketch/sketch.ino` runs on the UNO Q MCU side and prints Modulino Distance JSON.

## Build web bundle

From the repository root:

```powershell
npm run app-lab:web
```

This rebuilds the Next.js static export and copies it into `python/web/`.

## App Lab settings

Use these environment variables unless your hardware setup differs:

```text
SATI_WEB_PORT=8080
SATI_WS_PORT=8765
SATI_BLE_NAME=Sati-Nano
SATI_BLE_CHAR=19B10001-E8F2-537E-4F6C-D104768A1214
SATI_SERIAL_PORT=/dev/ttyACM0
```

After running the app, open:

```text
http://<UNO_Q_IP>:8080/?live=1
```

Nano 33 BLE still needs its own sketch flashed separately.
