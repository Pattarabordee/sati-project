# Sati x Judging Rubric

| Rubric (100pts) | Sati Implementation | Where To See |
|---|---|---|
| System Architecture & Hardware (20) | UNO Q MPU+MCU split, BLE peripheral, Serial bridge, WebSocket | `sati_ws_bridge.py`, `arduino/` |
| Multi-Sensor Insight & AI Logic (20) | IMU + ToF + movement cue -> posture class, state machine, pattern detection | `src/components/sati-app.tsx`, Coach and Second-Brain tabs |
| Dashboard & Feedback Interaction (15) | Growth mechanic, Coach + Second-Brain + Avatar tabs, toast, coins, shop, missions | Next.js web demo |
| Problem & User Value (15) | Sensor-driven awareness, no self-report as the main source, wellness-first design | README "What It Does", live demo hook |
| Prototype Quality (15) | Live hardware path + mock fallback, TypeScript check, polished responsive UI | `npm run dev`, fallback buttons, `npm run check` |
| Business Canvas / Demo / Storytelling (15) | Business Canvas, demo script, pitch outline, backup plan | `docs/` folder |

## Quick Judge Walkthrough

1. Start at the hardware table: show UNO Q, Nano, Modulino.
2. Open the Coach tab: show live signals and state transition.
3. Trigger ACTION: show stretch card, GP, coins, missions.
4. Open Second-Brain: show behavior pattern summary.
5. Open Avatar: show persona input and LLM-ready avatar recommendation.
6. Close with the business model: hardware kit + optional insight reports.

## Key Differentiators

- Hardware ground truth instead of self-report.
- UNO Q uses both Linux MPU and realtime MCU roles.
- Sensor data drives growth rewards, not manual check-ins.
- Persona Avatar makes the coach feel personalized without changing sensor logic.
- Privacy-first direction: the demo focuses on the current user's sensor observations.
- Fallback mode keeps the demo alive if hardware drops.
