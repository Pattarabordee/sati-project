# Nano JSON over BLE

Sati uses the Nano 33 BLE Sense as a BLE peripheral. The UNO Q Linux side reads JSON from the Nano, then combines it with ToF distance before broadcasting the final WebSocket payload to the web app.

## BLE Contract

| Field | Value |
|---|---|
| Device name | `Sati-Nano` |
| Service UUID | `19B10000-E8F2-537E-4F6C-D104768A1214` |
| Sensor characteristic UUID | `19B10001-E8F2-537E-4F6C-D104768A1214` |
| Properties | `read` + `notify` |
| Update interval | about 200 ms |

Nano payload:

```json
{"backAngle":18.5,"motion":1.2}
```

Recommended: keep the BLE JSON compact. Long BLE values can be truncated by the characteristic size.

The UNO Q bridge also accepts a raw sensor JSON shape with `ax`, `ay`, `az`, `gx`, `gy`, and `gz`. When `backAngle` is missing, it estimates `backAngle` from accelerometer values and estimates `motion` from gyroscope magnitude.

The bridge can find the Nano by BLE service UUID even if the advertised name is different, such as `HARU-NANO`.

UNO Q bridge output to browser:

```json
{"backAngle":18.5,"screenDistance":60.0,"postureClass":"normal"}
```

`screenDistance` comes from the UNO Q / Modulino ToF serial path. If ToF is unavailable, the bridge keeps running with the default distance value.

## Test From UNO Q

Copy the script to UNO Q, or use it after wireless deploy:

```powershell
$UNO="arduino@LPK.local"
scp .\scripts\read_nano_json.py "${UNO}:~/sati-coach/tools/read_nano_json.py"
ssh $UNO "python3 ~/sati-coach/tools/read_nano_json.py --count 5"
```

Expected output:

```text
connected to Sati-Nano (...)
1: raw={"backAngle":18.5,"motion":1.2} backAngle=18.5 motion=1.2
```

## Run The Bridge

The default BLE characteristic is already set to the Sati Nano sensor UUID, so this is enough:

```powershell
ssh arduino@LPK.local "cd ~/sati-coach/bridge && python3 sati_ws_bridge.py"
```

Override the characteristic only if the Nano sketch changes:

```powershell
ssh arduino@LPK.local "SATI_BLE_CHAR=19B10001-E8F2-537E-4F6C-D104768A1214 python3 ~/sati-coach/bridge/sati_ws_bridge.py"
```

## Troubleshooting

| Problem | What to check |
|---|---|
| `BLE device named 'Sati-Nano' not found` | Nano is powered, close to UNO Q, and advertising |
| JSON parse error | Nano sketch must write a compact JSON string to the sensor characteristic |
| Bridge shows mock | BLE is not connected yet, or the characteristic UUID does not match |
| Back angle stays near `0.0` | Nano was calibrated in the current orientation; tilt it to verify changes |
