# Sati — Project Context for Agentic Coding AI

> **อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง** — เป็นบริบทกลางของโปรเจกต์ Sati ทั้งหมด
> สรุปจากการตัดสินใจร่วมกันของทีมตลอดการพัฒนา ใช้เป็น single source of truth

---

## 0. TL;DR สำหรับ AI (อ่าน 30 วินาที)

- **โปรเจกต์:** Sati = อุปกรณ์ wellness ตั้งโต๊ะ + companion app ที่โค้ชท่านั่งและการพักของพนักงานออฟฟิศ (posture & focus coach)
- **งานที่กำลังทำ:** Hackathon "Coding Thailand 2026" ธีม Wellness — เป้าหมายเฉพาะหน้าคือ **ชนะ Hackathon** (ไม่ใช่สร้าง production จริงตอนนี้)
- **ฮาร์ดแวร์:** Arduino UNO Q (edge hub) + Nano 33 BLE Sense (IMU wearable) + Modulino (ToF/LED/Buzzer) + webcam
- **สิ่งที่ AI ต้องช่วย:** พัฒนา companion app/dashboard (HTML/JS) + เชื่อมกับฮาร์ดแวร์ผ่าน WebSocket
- **กฎเหล็ก 2 ข้อ:** (1) ห้ามเคลม medical เด็ดขาด — เป็น wellness เท่านั้น (2) ข้อมูลทุกอย่างต้องมาจาก sensor จริง ไม่ใช่กดเอง
- **ทีม:** ไม่ถนัดเขียนโค้ด พึ่ง Agentic AI เป็นหลัก → โค้ดต้อง comment ภาษาง่าย แตกงานเป็นชิ้นเล็ก ทดสอบทีละขั้น

---

## 1. ภาพรวมผลิตภัณฑ์ (Product Overview)

**ชื่อ:** Sati (สติ = การรู้ตัว/awareness — สื่อ behavior awareness, ไม่ clinical)
**ประเภท:** Hardware + companion app (ไม่ใช่ software-only)
**Tagline แนวทาง:** "Posture & Focus Coach" / "รู้ตัว ก่อนปวด"

**ปัญหาที่แก้:** Office Syndrome ในพนักงานออฟฟิศไทย — 60-70% ของพนักงานออฟฟิศมีภาวะนี้ ความสูญเสียทางเศรษฐกิจระดับ ~110,000 ล้านบาท/ปี (38,820 บาท/คน/ปี อ้างสำนักงานสถิติแห่งชาติ 2557)

**สิ่งที่ระบบทำ:**
- วัดท่านั่ง (มุมหลัง/คอ) + ระยะห่างหน้าจอ + การเคลื่อนไหว แบบเรียลไทม์
- ประมวลเป็น 3 สถานะ: Normal → Warning → Action
- เตือนแบบ ambient (ไฟ + เสียง) + แนะนำท่ายืดเหยียด (ฤๅษีดัดตน) ตอน Action
- มี gamification: ต้นไม้เสมือนที่เติบโตจากพฤติกรรมดี + ระบบแต้ม + ร้านค้าตกแต่ง

**จุดต่างหลัก (Unfair Advantage):** วัด posture จริงด้วย multi-sensor fusion (IMU+ToF+CV) — software apps ทั่วไป (Calm, Headspace, posture apps) ทำไม่ได้เพราะไม่มี sensor จริง. ต้นไม้โตจาก "พฤติกรรมจริงที่ sensor ยืนยัน" โกงไม่ได้ (ต่างจาก Finch ที่เชื่อทุกอย่างที่ผู้ใช้พิมพ์)

---

## 2. ฮาร์ดแวร์ (Hardware) — ของจริงที่ทีมมีในมือ

| อุปกรณ์ | บทบาท | รายละเอียดทางเทคนิค |
|---|---|---|
| **Arduino UNO Q (4GB RAM)** × 1 | Main Edge Hub | Dual-brain: Qualcomm QRB2210 รัน **Debian Linux** (ไม่ใช่ Yocto!) + STM32U585 MCU รัน Zephyr. มี Bluetooth 5.1, WiFi. ใช้ **Arduino App Lab** + "Bricks" สำเร็จรูป (computer vision, web UI, AI models). มี native integration กับ Edge Impulse. สื่อสารภายในระหว่าง Linux↔MCU ผ่าน Bridge (RPC) |
| **Nano 33 BLE Sense Rev2** × 3 | Wearable Sensing Node | nRF52840 @ 64MHz, 256KB RAM, 1MB flash. IMU = **BMI270** (accel+gyro) + **BMM150** (mag). มีไมโครโฟน, sensor สภาพแวดล้อม. รองรับ TinyML. สื่อสารผ่าน BLE |
| **Modulino** (I2C/Qwiic) | I/O modules | Distance (ToF วัดระยะ), Pixels (LED matrix), Buzzer (เสียง), Knob, Buttons |
| **Webcam (USB)** | Computer Vision | ต่อ UNO Q ผ่าน USB hub. ใช้จับ face presence + ระยะ (face bbox size เป็น proxy) |

**หมายเหตุสำคัญสำหรับ AI:**
- QRB2210 มี Adreno 702 GPU แต่ Hexagon เป็น sensor/audio DSP **ไม่ใช่ NPU เต็มตัว** — อย่าเคลมว่ามี dedicated NPU
- Computer Vision ใช้ MediaPipe Face Detection (~5-10 FPS) บน Linux side — frame **ไม่ส่งออกเครื่อง** (privacy by design)

---

## 3. สถาปัตยกรรมที่เลือก (Architecture Decision)

**Hybrid architecture — ใช้ฮาร์ดแวร์ + โน้ตบุ๊กช่วย dashboard (เพื่อความปลอดภัยหน้างาน):**

```
[Nano 33 BLE Sense] --BLE--> [Arduino UNO Q] --WebSocket/JSON--> [Dashboard บนเบราว์เซอร์/โน้ตบุ๊ก]
  IMU → TinyML                Linux: รับ BLE + อ่าน Modulino ToF
  (posture class)             + รัน CV + sensor fusion + 3-state machine
                              MCU: สั่ง Modulino Pixels/Buzzer
```

**การตัดสินใจสำคัญที่ยึดไว้:**
1. **Dashboard รันบนเบราว์เซอร์/โน้ตบุ๊ก** (ไม่ใช่บนจอ UNO Q โดยตรง) — เพราะ debug ง่าย + มี fallback. โจทย์อนุญาต ("ใช้ notebook แสดง Dashboard ได้")
2. **TinyML ใช้ Edge Impulse เป็นหลัก** (เร็ว ทำใน 1-2 วันได้) — มี hand-written TFLite Micro เป็นความรู้สำรองไว้ตอบกรรมการ
3. **มี fallback ทุกจุด:** BLE พัง → ใช้ USB Serial / TinyML accuracy ต่ำ → ใช้ rule-based (มุม) / CV ช้า → ตัดออกเหลือ 2 sensor / ฮาร์ดแวร์ล่ม → ใช้ปุ่มจำลองใน dashboard

---

## 4. กฎเหล็ก — ห้ามละเมิดเด็ดขาด (Hard Constraints)

### 4.1 No Medical Claims (สำคัญที่สุด — มีบทลงโทษในการตัดสิน)
ระบบเป็น **wellness** เท่านั้น ห้ามทำให้ดูเหมือนอุปกรณ์การแพทย์

| ❌ ห้ามใช้ (ทั้งในโค้ด, UI, comment) | ✅ ใช้แทน |
|---|---|
| diagnosis / วินิจฉัย | behavior awareness / ตรวจจับพฤติกรรม |
| treatment / รักษา / บำบัด | wellness cue / เตือน / แนะนำ |
| disease / โรค | — (ไม่พูดถึง) |
| stress detection / วัดความเครียด | posture / sitting time (สิ่งที่วัดได้จริง) |
| heart rate / fatigue / blink rate | back angle / screen distance / movement |
| "you have neck strain" | "ฉันสังเกตว่าคุณนั่งงอบ่อย" (observation) |
| FDA / อย. / medical device | "wellness tool, not a medical device" |

**บทเรียน:** Lumosity โดน FTC ปรับ $2M เพราะเคลมเกินจริง — อย่าทำซ้ำ

### 4.2 ข้อมูลต้องมาจาก sensor จริง
- แต้ม/การเติบโต/ภารกิจ ทั้งหมดต้องผูกกับพฤติกรรมที่ sensor ยืนยันได้ — **ไม่ใช่กดปุ่มแล้วได้**
- นี่คือจุดขายหลัก: "โกงไม่ได้ เพราะ sensor รู้ความจริง"

### 4.3 ข้อจำกัดทางเทคนิค
- **ห้ามใช้ localStorage/sessionStorage** (รันใน sandbox iframe ไม่ได้) — ใช้ in-memory (JS variable) ก่อน เขียน comment จุดที่จะสลับเป็น storage/backend ภายหลัง
- ห้าม external library หนัก — ถ้าจำเป็นใช้ผ่าน CDN เบาๆ
- โค้ดต้อง comment ภาษาง่าย (ทีมไม่ถนัดโค้ด)
- คงดีไซน์ calm/wellness: สี sage green + cream, มุมมน, โปร่ง

---

## 5. Logic ของระบบ (State Machine + Thresholds)

### 5.1 3-State Machine
```
[NORMAL] เขียว → (ก้มค้าง >30s จริง / หน้าจอใกล้ <40cm >60s) → [WARNING] เหลือง
         → (เงื่อนไขใดติด >2min / ≥2 เงื่อนไขพร้อมกัน / นั่งแช่ >25min) → [ACTION] แดง + เสียง + แนะท่ายืด
         → (ตรวจพบ Movement >5s = ลุกแล้ว) → [COOLDOWN 60s] → [NORMAL]
```

### 5.2 Thresholds (แยก 2 ชุด — สลับด้วย flag เดียว)
| ตัวแปร | DEMO (เร็ว สำหรับเวที) | PRODUCTION (จริง) |
|---|---|---|
| Warning หลังก้มค้าง | 3 วินาที | 30 วินาที |
| Action | 8.5 วินาที | 2 นาที |
| นั่งนาน (long sitting) | 80 วินาที | 1500 วินาที (25 นาที Pomodoro) |
| มุมหลังเตือน | >20° | >20° |
| มุมหลังแย่ | >40° | >40° |
| ระยะหน้าจอใกล้ | <45cm | <40cm |

**Debouncing:** ใช้ค่าเฉลี่ย ~5 วินาที ไม่ใช้ค่าทันที + นับ Hunched เฉพาะ confidence ≥ 0.7

### 5.3 Sensor inputs (JSON format จาก UNO Q ผ่าน WebSocket)
```json
{ "backAngle": 15, "screenDistance": 60, "postureClass": "normal" }
```
- `backAngle`: องศา (จาก IMU)
- `screenDistance`: cm (จาก Modulino ToF + CV)
- `postureClass`: "normal" | "hunched" | "movement" (จาก TinyML Edge Impulse) — optional
- WebSocket URL เริ่มต้น: `ws://127.0.0.1:8765`
- ต้องมี auto-reconnect ทุก 3 วินาที + fallback กลับ mock ถ้าหลุด (dashboard ห้ามค้าง)

---

## 6. ระบบ Gamification (Engagement Design)

### 6.1 ต้นไม้เสมือน (Virtual Plant Pet) — 2 ชั้น
- **Mood (อารมณ์):** สะท้อน state ปัจจุบัน (ยิ้ม/กังวล/เหี่ยว) — เปลี่ยนเร็ว
- **Growth (การเติบโต):** 5 ขั้นสะสมระยะยาว — 🌰 Seed → 🌱 Sprout → 🪴 Seedling → 🌿 Plant → 🌳 Flourishing

### 6.2 สกุลเงิน 2 แบบ (แยกชัดเจน)
- **Growth Points (GP):** สะสมเลื่อนขั้นต้นไม้ (เกณฑ์: 100/300/700/1500 GP)
- **Sati Coins:** ได้จากภารกิจ → ใช้ซื้อของตกแต่งในร้านค้า (ไม่ใช้เงินจริง)

### 6.3 GP มาจากพฤติกรรมจริง (sensor ยืนยัน)
- นั่งท่าดีครบ 25 นาที: +20 GP | ลุกพักเมื่อตรวจพบ Movement: +15 GP | ทำท่ายืดครบ: +10 GP | วันสุขภาพดี: +50 GP bonus | streak สัปดาห์: +100 GP

### 6.4 การลงโทษแบบให้อภัย (เรียนจาก Finch — กัน churn)
- พลาด 1 วัน → ต้นไม้ไม่ตาย แค่เหี่ยวเล็กน้อย + ข้อความห่วงใย
- ไม่หัก GP สะสม / ขั้นที่ปลดล็อกแล้วไม่ถอย

### 6.5 ร้านค้า (Shop) — ซื้อด้วย Coins
หมวด: กระถาง / ดอกไม้-ใบ / พื้นหลัง / ของประดับ / สกินพิเศษ
- ใส่ไอเทมกลิ่นไทยแบบ**ทางเลือก** (กระถางเบญจรงค์, โคมไฟไทย, ศาลาไทย) — flavor ไม่บังคับ

### 6.6 Second-Brain (ความทรงจำเชิงพฤติกรรม — ของล้ำ)
3 layer จากง่ายไปยาก:
- **Layer 1 (ทำได้แน่):** จำ pattern → insight เช่น "ช่วงบ่ายคุณมักนั่งงอหลังมากสุด"
- **Layer 2:** เชื่อมโยง context เช่น "วันที่พักทุก 25 นาที posture score ดีขึ้น"
- **Layer 3 (ถ้าทัน):** adaptive coaching — ปรับเวลาเตือนตามจังหวะผู้ใช้แต่ละคน
- ใช้คำ "ฉันสังเกตว่า..." (observation) ห้ามวินิจฉัย / ข้อมูลรายคนเป็นส่วนตัว HR เห็นแค่ aggregate

---

## 7. Business Context (สำหรับเข้าใจทิศทาง)

- **GTM หลัก:** B2B Corporate Wellness (ขายบริษัทเทค 50-500 คนในกรุงเทพฯ ผ่าน HR)
- **Revenue:** Hardware ~THB 2,500/pod + SaaS THB 150-250/seat/เดือน
- **HR Dashboard:** ต้องมีมุมมอง aggregate แบบ anonymized (% เวลานั่งท่าดีเฉลี่ยทั้งทีม, ช่วงเวลาที่ทีมเหนื่อยสุด) — ไม่เจาะรายบุคคล (PDPA + ความไว้ใจพนักงาน)
- **คู่แข่ง:** Upright Go 2 (single IMU, $69), Calm/Headspace (software-only, ไม่มี sensor จริง), Finch (gamified แต่ไม่มี data จริง)

---

## 8. สถานะงานปัจจุบัน (Current State) + ไฟล์ที่มี

### ไฟล์ที่ทำเสร็จแล้ว:
1. **`sati_dashboard.html`** — dashboard พื้นฐาน 3-state + ต้นไม้ + live signals + ปุ่มจำลอง + WebSocket hook (auto-reconnect + fallback) + postureClass support + แยก DEMO/PRODUCTION thresholds
2. **`sati_interactive_demo.html`** — เวอร์ชันเต็มสำหรับโชว์กรรมการ: เพิ่ม onboarding guide 5 ขั้น + growth system 5 ขั้น + GP/Coins wallet + ภารกิจรายวัน + ร้านค้าตกแต่ง (ซื้อแล้วของไปโผล่บนต้นไม้) + toast

### สิ่งที่ต้องทำต่อ (Roadmap สำหรับ AI):
> ทำทีละข้อ ทดสอบให้ผ่านก่อนต่อข้อถัดไป — ห้ามรื้อของที่ทำงานดีอยู่แล้ว

1. **แยกไฟล์** index.html / styles.css / app.js (แต่ยังเปิดได้โดยไม่ต้อง build) — ถ้าพังให้กลับไปรวมไฟล์เดียวก่อน
2. **Second-Brain Insights** เป็นแท็บใหม่ (Layer 1 ก่อน — mock insight ได้)
3. **HR Dashboard view** สลับมุมมอง — aggregate anonymized
4. **ต่อ WebSocket จริง** กับ UNO Q (format ในข้อ 5.3)
5. **ขัด UX/UI** — micro-animation ตอนได้แต้ม/เลื่อนขั้น, responsive, accessibility (aria, keyboard)
6. **ฝั่ง UNO Q** — เขียน Python ที่อ่าน sensor + ส่ง JSON ออก WebSocket ตาม format ข้อ 5.3

---

## 9. กฎการทำงานกับทีมนี้ (How to Work With This Team)

1. **แตกงานเป็นชิ้นเล็ก** — สั่ง/ทำทีละโมดูล ทดสอบก่อนต่อ ไม่เขียนทั้งระบบรวดเดียว
2. **Comment ภาษาง่าย** — ทีมไม่ถนัดโค้ด ต้อง debug เองได้เวลาพัง
3. **มี fallback เสมอ** — โดยเฉพาะจุดที่ต่อฮาร์ดแวร์ (BLE, CV, WebSocket)
4. **อย่า "ปรับปรุง" ของที่ดีอยู่แล้วจนพัง** — รักษา onboarding guide, state machine, growth, shop ไว้
5. **ทุก output เช็ก 2 กฎเหล็กก่อนเสมอ:** (1) ไม่เคลม medical (2) ข้อมูลจาก sensor จริง
6. **เป้าหมายเฉพาะหน้า = ชนะ Hackathon** — เน้นสิ่งที่ demo ได้จริงและกรรมการเห็นคะแนน (System Architecture 20 + Multi-Sensor AI Logic 20 = 40/100 คะแนน) มากกว่าความสมบูรณ์แบบ

---

## 10. Judging Rubric (เพื่อให้ AI รู้ว่าอะไรสำคัญ)

| หมวด | คะแนน | Sati ตอบด้วยอะไร |
|---|---|---|
| Problem & User Value | 15 | Office syndrome 110,000 ล้านบาท/ปี |
| **System Architecture & Hardware Use** | **20** | Dual-brain UNO Q + Nano + Modulino + CV ครบ |
| **Multi-Sensor Insight & AI Logic** | **20** | IMU TinyML + ToF + CV fusion → 3-state machine |
| Dashboard & Feedback Interaction | 15 | dashboard live + ต้นไม้ + ambient feedback |
| Prototype Quality / Low-Power | 15 | edge-only, modular, BOM ต่ำ |
| Business Canvas / Demo / Storytelling | 15 | B2B wellness + gamification + Thai flavor |

**เดดไลน์ Hackathon:** ศุกร์ 29 พ.ค. 2569 — 09:00 ส่งสไลด์ + ติดตั้ง prototype (หลังติดตั้งห้ามแก้)
