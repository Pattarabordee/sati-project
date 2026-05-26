# Sati Pitch (3 นาที)

## Slide 1: Title

Sati — Posture & Focus Coach  
Hackathon Coding Thailand 2026 · Wellness Track

Key line: "A sensor-driven wellness companion that helps office workers notice posture and break patterns before they drift too far."

## Slide 2: Problem (30s)

- Office workers sit in front of screens for long hours, and posture often changes without awareness.
- Existing habit apps rely on self-report, so users forget to log.
- Many wellness apps do not have hardware ground truth.

Speaker note:
"The problem is not that people do not care. The problem is that the signal arrives too late, and most apps ask the user to do extra work."

## Slide 3: Insight (30s)

"คนไม่กลับมาเปิดแอป ถ้ามันรู้สึกเหมือนการบ้าน"

What Sati changes:

- Ambient feedback instead of interruption-first design
- Reward loop that grows from measured behavior
- Cute plant mechanic that makes progress visible

## Slide 4: Solution (45s)

- IMU on Nano 33 BLE Sense reads back angle.
- Modulino Distance reads screen distance.
- Movement cue confirms break behavior.
- Web app turns signals into a 3-state coach: NORMAL -> WARNING -> ACTION.
- Growth mechanic makes the plant grow from real sensor-confirmed behavior.
- HR view shows aggregate team pattern only.

## Slide 5: Architecture (30s)

```text
[Nano 33 BLE Sense] --BLE--> [Arduino UNO Q Linux] --WebSocket--> [Next.js Browser]
[Modulino ToF]      --Serial-> [UNO Q MCU] ----------------------^
```

Speaker note:
"UNO Q is the edge hub. The MCU side handles realtime sensor bridge. The Linux side runs Python and serves the dashboard."

## Slide 6: Demo (Live)

Follow `docs/DEMO_SCRIPT.md`:

1. Normal posture
2. Hunched cue
3. Stretch completion
4. Growth level-up
5. Second-Brain insights
6. HR aggregate dashboard

## Slide 7: Market & Business (30s)

- Beachhead: B2B office wellness pilot for tech companies and co-working spaces.
- Revenue: hardware kit + monthly aggregate dashboard.
- Expansion: decorative content, team challenges, privacy-preserving aggregate reports.
- Market size: [ทีมต้องเติม source จากรายงาน corporate wellness / workplace wellness ที่น่าเชื่อถือ]

Speaker note:
"We start where the hardware value is obvious: offices that already invest in wellness but cannot see behavior patterns in realtime."

## Slide 8: Ask

- Feedback from judges on hardware reliability and pilot design
- Mentorship on enterprise wellness sales
- Distribution partnership with Arduino / maker community / corporate wellness partners
- Pilot company for a 2-week office trial

## Closing Line

"Sati is not just a reminder. It is a loop: sensor -> insight -> action -> reward -> team-level learning."
