# Sati Arduino Sketches

This folder contains the two hardware sketches used by Sati:

- `nano33_back_angle/` — Nano 33 BLE Sense Rev2 reads IMU and advertises BLE data.
- `unoq_tof_bridge/` — UNO Q MCU reads Modulino Distance and prints Serial JSON.

## Libraries To Install

Install these from Arduino IDE Library Manager:

| Sketch | Library | Verified version | Notes |
|---|---|---|---|
| Nano 33 BLE Sense Rev2 | `Arduino_BMI270_BMM150` | `1.2.x` (checked with `1.2.3`) | IMU library for BMI270 + BMM150 |
| Nano 33 BLE Sense Rev2 | `ArduinoBLE` | `2.0.x` (checked with `2.0.2`) | BLE peripheral service + characteristic |
| UNO Q MCU | `Arduino_Modulino` | `0.8.x` (checked with `0.8.0`) | Official Arduino Modulino library, includes `Arduino_Modulino.h` |

References:

- Nano 33 BLE Sense Rev2 IMU guide: https://docs.arduino.cc/tutorials/nano-33-ble-sense-rev2/imu-gyroscope
- Arduino Modulino library: https://docs.arduino.cc/libraries/arduino_modulino
- Modulino Distance guide: https://docs.arduino.cc/tutorials/modulino-distance/how-distance/
- Modulino Distance_Basic example: https://github.com/arduino-libraries/Arduino_Modulino/tree/main/examples/Modulino_Distance/Distance_Basic
- BMI270 accelerometer example: https://github.com/arduino-libraries/Arduino_BMI270_BMM150/tree/master/examples/SimpleAccelerometer
- BMI270 gyroscope example: https://github.com/arduino-libraries/Arduino_BMI270_BMM150/tree/master/examples/SimpleGyroscope
- ArduinoBLE BatteryMonitor example: https://github.com/arduino-libraries/ArduinoBLE/tree/master/examples/Peripheral/BatteryMonitor

## Flash Nano 33 BLE Sense Rev2

1. Open Arduino IDE 2.x or Arduino Cloud Editor.
2. Select board: **Arduino Nano 33 BLE Sense Rev2**.
3. Open `nano33_back_angle/nano33_back_angle.ino`.
4. Upload.
5. Keep the Nano still and upright for the first 5 seconds after boot. This sets the zero angle.
6. Open Serial Monitor at `115200` to see boot and BLE connect/disconnect logs.

BLE settings used by the Python bridge:

| Setting | Value |
|---|---|
| Device name | `Sati-Nano` |
| Service UUID | `19B10000-E8F2-537E-4F6C-D104768A1214` |
| Characteristic UUID | `19B10001-E8F2-537E-4F6C-D104768A1214` |
| Payload | `{"backAngle":18.5,"motion":1.2}` |

Set this in the UNO Q Python bridge environment:

```powershell
$env:SATI_BLE_NAME="Sati-Nano"
$env:SATI_BLE_CHAR="19B10001-E8F2-537E-4F6C-D104768A1214"
```

## Flash UNO Q MCU Side

1. Connect UNO Q with USB-C.
2. Open Arduino IDE 2.x or Arduino App Lab.
3. Select board: **Arduino UNO Q (MCU)** or the MCU target shown by your App Lab version.
4. Open `unoq_tof_bridge/unoq_tof_bridge.ino`.
5. Upload to the MCU side.
6. Open Serial Monitor at `115200`.
7. Confirm you see:

```json
{"boot":"sati-tof-v1"}
{"tof":62.5}
```

The Python bridge expects the same format from Serial. The Modulino library returns distance in millimeters; this sketch converts it to centimeters before printing `tof`.

## Wearing The Nano

- Clip or tape the Nano around the middle of the upper back.
- Keep the board orientation consistent during the demo.
- The sketch assumes Y-axis tilt is the main back-angle axis.
- If the angle moves backwards, swap axes in `angleFromAccel()` and recalibrate.
- Reboot the Nano while the person sits upright to reset the zero angle.

## Connect Modulino Distance

- Connect Modulino Distance to the UNO Q Qwiic/I2C port with the Qwiic cable.
- Place the sensor near the screen or desk edge, facing the user's upper body or face area.
- Remove any protective film from the ToF sensor before testing.
- The sketch skips values outside `4cm` to `130cm`, then prints the median of the latest 5 valid readings.

## Verify

### Nano BLE

1. Install nRF Connect on a phone.
2. Scan for `Sati-Nano`.
3. Connect and inspect service `19B10000-E8F2-537E-4F6C-D104768A1214`.
4. Read or subscribe to characteristic `19B10001-E8F2-537E-4F6C-D104768A1214`.
5. Confirm JSON updates about every `200ms`.

### UNO Q ToF

1. Open Serial Monitor at `115200`.
2. Move a hand or object in front of the sensor.
3. Confirm `tof` changes smoothly.
4. On UNO Q Linux, set `SATI_SERIAL_PORT` to the MCU Serial device path, usually `/dev/ttyACM0` or `/dev/ttyUSB0`.

## Troubleshooting

| Problem | Possible Cause | Fix |
|---|---|---|
| `Sati-Nano` not visible | BLE sketch not running or wrong board target | Re-upload Nano sketch and check Serial Monitor |
| BLE connects but value is blank | Characteristic UUID mismatch | Use `19B10001-E8F2-537E-4F6C-D104768A1214` in `SATI_BLE_CHAR` |
| Back angle looks inverted | Board orientation differs from sketch assumption | Swap axes in `angleFromAccel()` and reboot upright |
| ToF prints no values | Distance outside valid range or Qwiic not connected | Move target to 20-80cm and check cable |
| ToF stays at fallback in web app | Python bridge cannot read Serial | Check `SATI_SERIAL_PORT` and App Lab service permissions |

## Notes For Demo

- These sketches are built for hackathon demo reliability.
- Axis orientation should be checked on the person wearing the Nano.
- The bridge has fallback data, but the main story should use live sensor values whenever hardware is stable.
