# Sati — Posture & Focus Coach

Hackathon project for "Coding Thailand 2026" (Wellness track)  
Built on Arduino UNO Q + Nano 33 BLE Sense + Modulino ToF

## What It Does

Sati is a sensor-driven posture and focus coach for desk work. The web app reads back angle, screen distance, and movement signals, then turns confirmed behavior into a calm growth mechanic: a virtual plant, GP, coins, daily missions, Second-Brain observations, and an anonymized HR aggregate view. The goal is to make posture and break patterns visible without relying on self-report buttons as the main data source.

## Architecture

```text
[Nano 33 BLE Sense] --BLE--> [Arduino UNO Q (MPU/Linux)] --WebSocket--> [Browser (Next.js)]
[Modulino ToF]      --Serial->                                                  |
                                                                          window.name memory
```

3 layers:

- **MCU sensors:** IMU back angle, ToF screen distance, movement detection
- **Bridge (Python):** `sati_ws_bridge.py` combines sensor data -> JSON -> `ws://0.0.0.0:8765`
- **Web UI (Next.js):** state machine, growth mechanic, missions, Second-Brain insights, HR dashboard

## Tech Stack

- Next.js 15 + React 19 + TypeScript + Tailwind CSS
- shadcn/ui-style Radix primitives + lucide-react + sonner
- Python 3.10+ with `websockets`, `bleak`, `pyserial`
- Arduino UNO Q (Debian Linux MPU + STM32 MCU)

## Project Structure

| Path | Purpose |
|---|---|
| `src/components/sati-app.tsx` | Main app logic: sensor state, growth, missions, shop, insights |
| `src/components/ui/` | Lightweight UI primitives used by the Next.js app |
| `src/app/` | Next.js App Router entry, metadata, global styles, light/dark theme tokens |
| `sati_ws_bridge.py` | Python WebSocket bridge for UNO Q Linux side |
| `requirements.txt` | Python dependencies for the bridge |
| `arduino/` | Nano BLE and UNO Q MCU sketches |
| `docs/` | Demo script, business canvas, pitch outline, judging rubric map |
| `docs/TEAM_WORKFLOW.md` | Team branching, ownership, PR checklist, and UNO Q deploy workflow |
| `legacy/` | Original vanilla HTML/JS prototype kept for reference |
| `public/` | Static assets such as favicon |

## Local Development

### Prerequisites

- Node.js 20+ (recommend LTS)
- Python 3.10+
- Windows / macOS / Linux

### Frontend

```powershell
npm install
npm run dev
# Open http://localhost:3000
```

By default, `NEXT_PUBLIC_SATI_DEMO_MODE=true` so GP grows faster for the hackathon demo.

To use the real 25-minute / +20 GP setting:

```powershell
$env:NEXT_PUBLIC_SATI_DEMO_MODE="false"; npm run dev
```

Hardware WebSocket auto-connect is off by default during local demo to avoid noisy console errors when the bridge is not running. To connect live hardware, open:

```powershell
Start-Process "http://localhost:3000?live=1"
```

Or set the frontend env var:

```powershell
$env:NEXT_PUBLIC_SATI_WS_AUTOCONNECT="true"; npm run dev
```

### Demo on Tablet/Mobile

The live site is responsive:

- Mobile (375px+): single-column layout
- Tablet (768px+): stacked coach view with readable cards
- Desktop (1024px+): multi-column dashboard layout

For best demo experience, use **landscape tablet** or **laptop** at 1280x720+.

### Backend (Python WebSocket Bridge)

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python sati_ws_bridge.py
# WebSocket listens at ws://0.0.0.0:8765
```

If hardware is not connected yet, the bridge keeps running with fallback data and logs a warning.

### Environment Variables (Python Bridge)

| Variable | Default | Description |
|---|---|---|
| `SATI_WS_HOST` | `0.0.0.0` | Host for WebSocket bind |
| `SATI_WS_PORT` | `8765` | WebSocket port |
| `SATI_BLE_NAME` | `Sati-Nano` | BLE device name for Nano 33 |
| `SATI_BLE_CHAR` | empty | GATT characteristic UUID for back angle |
| `SATI_SERIAL_PORT` | `/dev/ttyACM0` | Serial port for ToF bridge (Windows: `COM3`, etc.) |
| `SATI_SERIAL_BAUD` | `115200` | Serial baud rate |
| `SATI_HUNCHED_ANGLE` | `20` | Back angle threshold for hunched posture |
| `SATI_MOVEMENT_IDLE_SEC` | `5` | Idle time before movement can count as a break |
| `SATI_LOG_LEVEL` | `INFO` | Set `DEBUG` for detailed payload logs |

### Build for Static Deployment

This repo uses `output: "export"` in `next.config.ts`, so `npm run build` creates the static `out/` folder.
Local development and local static preview run at the root path, such as `http://localhost:3000` or `http://localhost:8080`.

```powershell
npm run build
python -m http.server 8080 --directory out --bind 0.0.0.0
# Open http://localhost:8080
```

GitHub Actions sets `GITHUB_ACTIONS=true`, so production Pages builds automatically use `basePath` and `assetPrefix` for `/sati-project`.
Live demo URL: https://pattarabordee.github.io/sati-project/

## Deploy to Arduino UNO Q via Arduino App Lab

See also: [`arduino/README.md`](arduino/README.md) for sketch flashing, BLE UUIDs, wiring notes, and hardware verification.

### Why Arduino App Lab?

Arduino App Lab is the official IDE for hybrid application development on Arduino UNO Q. It is designed for apps that combine the Linux MPU side with the real-time MCU side.

Official docs:

- Arduino App Lab overview: https://docs.arduino.cc/software/app-lab/setup/overview
- Develop Apps in App Lab: https://docs.arduino.cc/software/app-lab/apps/develop-apps/
- UNO Q user manual: https://docs.arduino.cc/tutorials/uno-q/user-manual/

### Prerequisites

1. Arduino UNO Q connected to the dev machine with USB-C
2. Arduino App Lab installed from https://www.arduino.cc/en/software
3. UNO Q booted and connected to the same network as the dev machine
4. Nano 33 BLE Sense sketch prepared as a BLE peripheral
5. UNO Q MCU-side sketch prepared to send ToF distance over Serial

### Steps

1. **Open Arduino App Lab -> Detect board** and confirm the UNO Q is visible.
2. **Create a new App** named `sati-coach`.
3. **Add the Python bridge on the MPU/Linux side** according to the App Lab UI:
   - Entry file: `sati_ws_bridge.py`
   - Dependencies: copy the packages from `requirements.txt`
   - Auto-restart: enabled if your App Lab version exposes this setting
   - Network: expose TCP port `8765`
4. **Add the static web frontend**:
   - Build on the dev machine first:
     ```powershell
     npm run build
     ```
   - Upload or copy the generated `out/` folder into the App Lab static web service, or serve it from the UNO Q Linux side with:
     ```powershell
     python3 -m http.server 8080 --directory out --bind 0.0.0.0
     ```
   - Bind web port `8080`, or the port assigned by App Lab.
5. **Configure bridge environment variables** in App settings:
   - Set `SATI_BLE_NAME` to match the Nano sketch.
   - Set `SATI_BLE_CHAR` to the GATT characteristic UUID.
   - Set `SATI_SERIAL_PORT` to the MCU Serial device path, usually `/dev/ttyACM0` or `/dev/ttyUSB0` on UNO Q Linux.
6. **Upload the MCU-side sketch** for Modulino ToF -> Serial:
   - Use Arduino IDE 2.x or the App Lab built-in sketch editor.
   - The sketch must print JSON like this at baud `115200`:
     ```json
     {"tof": 62.5}
     ```
   - A single numeric cm value is also accepted by the bridge.
7. **Pair Nano 33 BLE Sense** as a BLE peripheral:
   - Advertise with the name from `SATI_BLE_NAME`.
   - Expose a characteristic that the bridge can read through `SATI_BLE_CHAR`.
8. **Deploy the App** through App Lab UI. If your App Lab version offers the App Lab CLI, follow the official CLI docs instead of inventing custom commands.
9. **Test from a laptop browser**:
   ```powershell
   Start-Process "http://<uno-q-ip>:8080?live=1"
   ```
   Live Signals should show `Arduino WebSocket: live`, not `mock fallback`.

### Troubleshooting

| Problem | Possible cause | Fix |
|---|---|---|
| UI shows `mock fallback` | WebSocket is not reachable | Check that `sati_ws_bridge.py` is running on UNO Q and port `8765` is open |
| Back angle does not move | BLE is not connected | Check `SATI_BLE_NAME` and `SATI_BLE_CHAR` in App Lab environment settings |
| Screen distance stays `60` | Serial ToF fallback is active | Check `SATI_SERIAL_PORT`; on UNO Q it may be `/dev/ttyACM0` or `/dev/ttyUSB0` |
| App Lab deploy fails | Port conflict or service config mismatch | Change ports `8765` / `8080` or follow the current App Lab docs |
| Browser cannot connect from laptop | Frontend URL points to localhost | Open `http://<uno-q-ip>:8080?live=1`; the app uses the page hostname for WebSocket |

### Logs

- In App Lab: open the Logs tab for the Python service / App.
- Over SSH, if you created a system service manually:
  ```powershell
  ssh arduino@<uno-q-ip>
  journalctl -u sati-coach-bridge -f
  ```

## Constraints & Design Notes

- **No localStorage/sessionStorage:** uses `window.name` for sandbox iframe compatibility.
- **Theme:** light/dark/system toggle, persisted via `window.name`, no localStorage.
- **Wellness only:** Sati reports sensor observations for personal awareness.
- **Sensor-driven:** GP, breaks, and missions are tied to sensor-confirmed behavior. Fallback controls exist for demo resilience if hardware is unavailable.
- **HR view is aggregate only:** no individual employee detail is shown.

## Demo & Business

- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) — 5-7 minute judge-facing live demo script
- [`docs/BUSINESS_CANVAS.md`](docs/BUSINESS_CANVAS.md) — Business Model Canvas
- [`docs/PITCH_OUTLINE.md`](docs/PITCH_OUTLINE.md) — 3-minute pitch outline for slides
- [`docs/JUDGING_RUBRIC_MAP.md`](docs/JUDGING_RUBRIC_MAP.md) — Mapping from Sati features to judging criteria

## License

All rights reserved · Hackathon 2026

## Team

Sati Hackathon Team
