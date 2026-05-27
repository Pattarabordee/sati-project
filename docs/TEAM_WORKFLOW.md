# Sati Team Workflow

เอกสารนี้คือข้อตกลงกลางสำหรับแชร์โค้ด Sati ระหว่างทีม และรวมงานลงบอร์ดหลักโดยไม่เหยียบกันช่วง hackathon

## Source of Truth

- ใช้ GitHub repo `https://github.com/Pattarabordee/sati-project.git` เป็นที่เก็บโค้ดหลักของทีม
- ทุกคนดึงงานจาก `main` ก่อนเริ่มงานใหม่
- ห้ามเก็บโค้ดสำคัญไว้เฉพาะบน UNO Q, Nano, หรือเครื่องส่วนตัวโดยไม่ commit
- งานที่พร้อม demo ให้ tag เป็นเวอร์ชัน เช่น `demo-2026-05-29-rc1`

## Branch Rules

ใช้ branch ตามประเภทงาน:

| Work area | Branch pattern |
|---|---|
| Web UI | `feature/web-*` |
| Python bridge | `feature/bridge-*` |
| Nano 33 BLE sketch | `feature/nano-*` |
| UNO Q MCU sketch | `feature/unoq-*` |
| Docs and pitch | `docs/*` |
| Personal scratch branch | `LPK/*` หรือชื่อสมาชิกทีม |

กติกาสั้น ๆ:

- ห้ามทำงานตรงบน `main` ยกเว้น hotfix นาทีสุดท้ายที่ทีมเห็นด้วย
- เปิด Pull Request เข้า `main` ก่อน merge
- PR ควรมี reviewer อย่างน้อย 1 คน
- ถ้าแก้ข้าม subsystem ให้ขอคนดูแลส่วนนั้น review ด้วย

## Ownership

| Area | Main paths |
|---|---|
| Web team | `src/`, `public/`, `README.md` |
| Bridge team | `sati_ws_bridge.py`, `requirements.txt` |
| Hardware team | `arduino/nano33_back_angle/`, `arduino/unoq_tof_bridge/` |
| Demo and pitch team | `docs/` |

## Locked Interfaces

ห้ามเปลี่ยน interface เหล่านี้ใน PR เดี่ยวแบบแยกส่วน เพราะจะทำให้ Web, Python, และ Arduino คุยกันไม่ตรง:

- WebSocket endpoint on UNO Q: `ws://<uno-q-host>:8765`
- Sensor payload:

```json
{"backAngle":15.3,"screenDistance":62.1,"postureClass":"normal"}
```

- Allowed `postureClass` values:
  - `normal`
  - `hunched`
  - `movement`

ถ้าจำเป็นต้องเปลี่ยน payload ให้แก้พร้อมกันทั้ง Arduino sketch, Python bridge, และ Web UI ใน PR เดียว

## Pull Request Checklist

ใส่ checklist นี้ใน PR ตามส่วนที่แตะ:

```markdown
## Validation
- [ ] Web: `npm run check`
- [ ] Web: `npm run build`
- [ ] Web: `npm run check-contrast`
- [ ] Bridge: Python bridge starts without crashing
- [ ] Hardware: Nano advertises as `Sati-Nano`
- [ ] Hardware: UNO Q reads BLE characteristic
- [ ] Hardware: ToF serial prints `{"tof": 62.5}` or fallback is explained
- [ ] Demo: tested with hardware or mock fallback
```

## Do Not Commit

ไฟล์เหล่านี้ต้องไม่เข้า repo:

- `node_modules/`
- `.next/`
- `out/`
- `__pycache__/`
- `.venv/`
- `.env*`
- `tsconfig.tsbuildinfo`

## Board Deployment

บอร์ดหลัก UNO Q ควร deploy จาก `main` หรือ tag stable เท่านั้น

บนเครื่อง dev:

```powershell
npm install
npm run check
npm run build
```

Copy frontend และ bridge ไป UNO Q:

```powershell
$UNO="arduino@LPK.local"
ssh $UNO "mkdir -p ~/sati-coach/web ~/sati-coach/bridge"
scp -r .\out\* "${UNO}:~/sati-coach/web/"
scp .\sati_ws_bridge.py .\requirements.txt "${UNO}:~/sati-coach/bridge/"
```

Run services บน UNO Q:

```powershell
ssh $UNO "cd ~/sati-coach/bridge && nohup env SATI_BLE_NAME=Sati-Nano SATI_BLE_CHAR=19B10001-E8F2-537E-4F6C-D104768A1214 python3 sati_ws_bridge.py > ~/sati-coach/bridge.log 2>&1 < /dev/null &"
ssh $UNO "cd ~/sati-coach && nohup python3 -m http.server 8080 --directory web --bind 0.0.0.0 > ~/sati-coach/web.log 2>&1 < /dev/null &"
```

Smoke test:

```powershell
ssh $UNO "ss -ltnp | grep -E ':8080|:8765' || true"
ssh $UNO "tail -n 40 ~/sati-coach/bridge.log"
Start-Process "http://LPK.local:8080/?live=1"
```
