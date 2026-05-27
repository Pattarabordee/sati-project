# UNO Q BLE Message Sender

คู่มือนี้ใช้สำหรับให้ Arduino UNO Q Linux side ส่งข้อความสั้น ๆ ไปหา Nano 33 BLE Sense ผ่าน BLE

ข้อความ default:

```text
LPK is here!
```

## Required Nano Sketch

Nano ต้องรัน sketch ที่มี BLE inbox characteristic นี้ก่อน:

```text
19B10002-E8F2-537E-4F6C-D104768A1214
```

ถ้า Nano ยังใช้ sketch เก่าที่มีแค่ sensor `read/notify` characteristic สคริปต์ฝั่ง UNO Q จะหา device เจอแต่เขียนข้อความไม่สำเร็จ

## Copy To UNO Q

จากเครื่อง dev:

```powershell
$UNO="arduino@LPK.local"
ssh $UNO "mkdir -p ~/sati-coach/tools"
scp .\scripts\send_nano_message.py "${UNO}:~/sati-coach/tools/send_nano_message.py"
```

## Run On UNO Q

```powershell
ssh arduino@LPK.local "python3 ~/sati-coach/tools/send_nano_message.py 'LPK is here!'"
```

ถ้ารันจาก shell บน UNO Q โดยตรง:

```bash
python3 ~/sati-coach/tools/send_nano_message.py "LPK is here!"
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SATI_BLE_NAME` | `Sati-Nano` | BLE local name advertised by Nano |
| `SATI_BLE_ADDRESS` | empty | Optional direct BLE address, skips name scan |
| `SATI_BLE_INBOX_CHAR` | `19B10002-E8F2-537E-4F6C-D104768A1214` | Nano write characteristic for messages |
| `SATI_BLE_SCAN_TIMEOUT` | `5` | BLE scan timeout in seconds |
| `SATI_BLE_MESSAGE` | `LPK is here!` | Default message when no CLI argument is given |

Example with direct BLE address:

```powershell
ssh arduino@LPK.local "SATI_BLE_ADDRESS=7D:83:EA:33:09:AB python3 ~/sati-coach/tools/send_nano_message.py"
```

## Expected Result

On the UNO Q terminal:

```text
sent to Sati-Nano (...): LPK is here!
```

On the Nano Serial Monitor:

```text
BLE message from UNO Q: LPK is here!
```

The Nano built-in LED should also turn on briefly after receiving the message.

## Troubleshooting

| Problem | What to check |
|---|---|
| `BLE device named 'Sati-Nano' not found` | Nano is powered, advertising, and close to UNO Q |
| `Characteristic ... was not found` | Nano sketch does not include the inbox characteristic yet |
| Permission or Bluetooth error | Restart Bluetooth on UNO Q or reboot the board |
| Message too long | Keep the message within 40 UTF-8 bytes |
