# UNO Q Wireless Deploy

คู่มือนี้คือ workflow แบบเร็วสำหรับ deploy Sati ไปยัง Arduino UNO Q ผ่าน Wi-Fi/LAN โดยใช้ SSH และ SCP

ในเอกสารนี้คำว่า OTA หมายถึงการอัปเดตฝั่ง Linux ของ UNO Q แบบไร้สาย:

- Next.js static web output (`out/`)
- Python WebSocket bridge (`sati_ws_bridge.py`)
- utility scripts ใน `scripts/`

การ flash sketch ฝั่ง UNO Q MCU หรือ Nano 33 BLE Sense ยังเป็น workflow แยกผ่าน Arduino IDE / Arduino App Lab / Arduino CLI

## Requirements

- UNO Q และ laptop อยู่ Wi-Fi วงเดียวกัน
- UNO Q setup ผ่าน Arduino App Lab แล้ว และเปิด SSH แล้ว
- SSH key หรือ password ใช้งานได้กับ `arduino@LPK.local`
- Node.js และ npm พร้อมบน laptop

ตรวจเร็ว:

```powershell
ssh arduino@LPK.local "hostname && hostname -I && python3 --version"
```

ถ้า `LPK.local` ใช้ไม่ได้ ให้ลอง IP ปัจจุบันแทน:

```powershell
ssh arduino@172.16.21.165 "hostname && hostname -I"
```

## Deploy

จาก root ของ repo:

```powershell
.\scripts\deploy_unoq.ps1
```

ค่า default:

- SSH target: `arduino@LPK.local`
- Web UI: `http://LPK.local:8080/?live=1`
- WebSocket: `ws://LPK.local:8765`
- BLE device name: `Sati-Nano`
- BLE sensor characteristic: `19B10001-E8F2-537E-4F6C-D104768A1214`

ถ้าต้องใช้ IP:

```powershell
.\scripts\deploy_unoq.ps1 -Uno arduino@172.16.21.165
```

หลัง deploy เสร็จ เปิด:

```powershell
Start-Process "http://LPK.local:8080/?live=1"
```

## Status

```powershell
.\scripts\unoq_status.ps1
```

หรือถ้าใช้ IP:

```powershell
.\scripts\unoq_status.ps1 -Uno arduino@172.16.21.165
```

สคริปต์จะแสดง:

- hostname และ IP ของบอร์ด
- port `8080` และ `8765`
- process ของ web server และ Python bridge
- log ล่าสุดจาก `~/sati-coach/bridge.log` และ `~/sati-coach/web.log`

## Stop

```powershell
.\scripts\unoq_stop.ps1
```

คำสั่งนี้หยุดเฉพาะ:

- `sati_ws_bridge.py`
- `python3 -m http.server 8080`

## Optional SSH Alias

ถ้าไม่อยากพิมพ์ `arduino@LPK.local` ทุกครั้ง สามารถเพิ่มในไฟล์:

```text
C:\Users\<you>\.ssh\config
```

ตัวอย่าง:

```sshconfig
Host unoq
  HostName LPK.local
  User arduino
```

จากนั้นใช้:

```powershell
ssh unoq "hostname"
.\scripts\deploy_unoq.ps1 -Uno unoq
```

อย่าใส่ password ลงในไฟล์ config นี้

## Troubleshooting

| Problem | Fix |
|---|---|
| `Could not resolve hostname LPK.local` | ใช้ IP ตรง เช่น `arduino@172.16.21.165` |
| SSH timeout | เช็กว่า laptop กับ UNO Q อยู่ network เดียวกัน |
| หน้าเว็บโหลดแต่ Live Signals mock | รัน `.\scripts\unoq_status.ps1` แล้วดูว่า port `8765` listen อยู่ไหม |
| Back angle ไม่ขยับ | Nano BLE ยังไม่ connect หรือ `SATI_BLE_CHAR` ไม่ตรง |
| Screen distance เป็น `60` ตลอด | ToF serial bridge ยังไม่ถูกอ่าน หรือ serial path ไม่ตรง |

## References

- https://docs.arduino.cc/tutorials/uno-q/ssh
- https://docs.arduino.cc/software/app-lab/cli/cli
- https://docs.arduino.cc/tutorials/uno-q/remote-access
