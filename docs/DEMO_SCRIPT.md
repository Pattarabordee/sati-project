# Sati — Demo Script (5-7 นาที)

## 0:00 — Hook (30 วินาที)

"ทุกคนรู้ว่านั่งทำงานหน้าจอนาน ๆ แล้วท่าทางเริ่มหลุด แต่ปัญหาคือเราไม่รู้ตัวตอนมันเกิดขึ้นจริง และแอปที่ให้กดบันทึกเองมักถูกลืม Sati เลยใช้เซนเซอร์จริงบนโต๊ะและบนตัวผู้ใช้ เพื่อเปลี่ยนพฤติกรรมที่วัดได้ให้กลายเป็น feedback ที่นุ่มและอยากกลับมาดูทุกวัน"

ชี้ให้กรรมการเห็นว่า Sati ไม่ได้ถามให้ผู้ใช้กรอกเอง แต่รับข้อมูลจาก IMU, ToF และ movement cue

## 0:30 — Hardware Tour (60 วินาที)

- **Arduino UNO Q** เป็น edge hub: ฝั่ง Linux รัน Python WebSocket bridge และ frontend, ฝั่ง MCU อ่าน sensor realtime
- **Nano 33 BLE Sense Rev2** ติดกลางหลัง: อ่าน accelerometer/gyroscope แล้วส่ง back angle ผ่าน BLE
- **Modulino Distance** วางใกล้จอ: อ่านระยะหน้าจอผ่าน ToF แล้วส่งเข้า UNO Q MCU ผ่าน Qwiic/I2C
- **Web app** รับ JSON ผ่าน WebSocket: `backAngle`, `screenDistance`, `postureClass`

ประโยคสำคัญ: "คะแนนและภารกิจโตจากสิ่งที่เซนเซอร์ยืนยัน ไม่ใช่จากการกดเช็กอินเอง"

## 1:30 — Live Demo Flow

### Scene 1: Normal posture (15 วินาที)

- กดปุ่ม "นั่งปกติ" หรือให้นั่งตรงจริง
- ชี้ Live Signals: back angle ประมาณ 15 องศา, distance ประมาณ 60 cm, state = NORMAL
- ชี้ต้นไม้สีเขียวสด และ progress bar ของ GP
- ลอง toggle theme เป็น dark เพื่อให้กรรมการเห็น attention to detail ตอนใช้งานช่วงเย็น
- พูดว่า "นี่คือ baseline ตอนผู้ใช้อยู่ในโซนสบาย"

### Scene 2: Hunched detection (30 วินาที)

- กดปุ่ม "นั่งงอหลัง" หรือให้งอหลังจริง
- ชี้ state ไหลจาก NORMAL -> WARNING -> ACTION
- อธิบาย threshold แบบสั้น: "ระบบไม่เตือนทันที แต่รอดูว่า cue ค้างพอจริงไหม"
- ชี้ต้นไม้เปลี่ยน mood และ action card แนะนำท่ายืด
- ชี้ว่า IMU ดูมุมหลัง, ToF ดูระยะจอ, movement ใช้ยืนยันการลุกพัก

### Scene 3: Recovery (20 วินาที)

- กด "ทำเสร็จแล้ว · +10 GP"
- ชี้ toast, GP และ coins เพิ่ม
- ชี้ภารกิจ m1 ว่าพักครบ 3 ครั้งจะติ๊กถูกแบบ real-time
- พูดว่า "reward loop เกิดหลังมี behavior ที่ระบบเห็นจริง"

### Scene 4: Growth & Reward (30 วินาที)

- กด "Demo: ใกล้ขึ้นขั้น"
- ชี้ animation ตอนต้นไม้เลื่อนขั้น
- เปิดร้านค้า
- ซื้อกระถาง 50 coins
- ชี้ decoration ที่เพิ่มบนต้นไม้
- พูดว่า "ของตกแต่งเป็น cosmetic reward ไม่มีเงินจริงใน demo นี้"

### Scene 5: Second-Brain (20 วินาที)

- เปิด tab "Second-Brain"
- ชี้ insight ที่ขึ้นต้นด้วย "ฉันสังเกตว่า..."
- อธิบายว่าเป็น pattern จาก behavior log ไม่ใช่ข้อความเดาสุ่ม
- พูดว่า "นี่คือ AI logic layer แรก: สรุปช่วงเวลาและพฤติกรรมซ้ำ ๆ ให้ผู้ใช้เห็นตัวเอง"

### Scene 6: HR Dashboard (20 วินาที)

- เปิด tab "HR Dashboard"
- ชี้ aggregate goodPct และ break rhythm
- เน้น "No individual data"
- พูดว่า "HR เห็นภาพรวมทีมเพื่อออกแบบกิจกรรม wellness ได้ แต่ไม่เจาะรายคน"

## 5:00 — Why Sati Matters (45 วินาที)

"Sati ต่างจาก wellness app ทั่วไปตรงที่มี hardware ground truth และต่างจาก posture device เดี่ยว ๆ ตรงที่มี growth mechanic ให้คนอยากกลับมาใช้ต่อ ทีมสามารถเริ่มจาก B2B office wellness: 1 pod ต่อโต๊ะหรือ 1 pod ต่อกลุ่ม แล้วต่อยอดเป็น dashboard aggregate สำหรับ HR"

จบด้วย:

"ใน hackathon นี้เราไม่ได้แค่ทำ dashboard สวย แต่ทำ loop ครบ: sensor -> insight -> action -> reward -> aggregate view"

## 5:45 — Q&A Buffer

เก็บไว้ประมาณ 1 นาทีสำหรับคำถาม:

- ถ้าถามเรื่อง privacy: ย้ำ aggregate only, no individual detail
- ถ้าถามเรื่อง hardware: ชี้ UNO Q split MPU/MCU และ BLE/Serial bridge
- ถ้าถามเรื่อง scale: เริ่ม B2B pilot ก่อน แล้วค่อยทำ kit

## Backup Plans

- ถ้า hardware fail: ใช้ fallback mock buttons และบอกตรง ๆ ว่าเป็น fallback path สำหรับเดโม
- ถ้า browser ค้าง: refresh หน้า แล้วเปิด `http://localhost:3000?live=0`
- ถ้า WebSocket หลุด: restart `sati_ws_bridge.py`; UI จะกลับไป mock fallback ระหว่างรอ
- ถ้า BLE ไม่ต่อ: เปิด nRF Connect เช็กว่าเห็น `Sati-Nano` หรือไม่
- ถ้า ToF ไม่ขยับ: เปิด Serial Monitor ดูว่า UNO Q MCU ส่ง `{"tof":62.5}` หรือไม่
