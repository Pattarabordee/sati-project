"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Leaf, Monitor, Moon, RotateCcw, ShoppingBag, Sun, Wifi, WifiOff, X } from "lucide-react";
import { toast, Toaster } from "sonner";

import { PlantAvatar } from "@/components/plant-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MEMORY_KEY = "sati-progress-v1";

type SatiState = "normal" | "warning" | "action";
type MockMode = "normal" | "slouch" | "long" | "movement";
type SensorSource = "mock" | "ws";
type MissionId = "m1" | "m2" | "m3";
type ThemePref = "light" | "dark" | "system";

type MissionsDone = Record<MissionId, boolean>;

type ProgressMemory = {
  gp?: number;
  coins?: number;
  stretchIdx?: number;
  breaks?: number;
  bestGoodSec?: number;
  guideSeen?: boolean;
  missionsDone?: Partial<MissionsDone>;
  owned?: string[];
  decorations?: string[];
  theme?: ThemePref;
};

type AppState = {
  mode: MockMode;
  state: SatiState;
  sit: number;
  backMs: number;
  distMs: number;
  recMs: number;
  last: number;
  modeStart: number;
  ang: number;
  dist: number;
  postureClass: string;
  movementMs: number;
  movementRewarded: boolean;
  distanceGoodMs: number;
  distanceTotalMs: number;
  gp: number;
  coins: number;
  stretchIdx: number;
  breaks: number;
  bestGoodSec: number;
  goodRun: number;
  goodAcc: number;
  missionsDone: MissionsDone;
  owned: string[];
  decorations: string[];
};

type BehaviorRow = {
  hour: number;
  period: "ช่วงเช้า" | "ช่วงบ่าย" | "ช่วงเย็น";
  state: SatiState;
  angle: number;
  distance: number;
};

declare global {
  interface Window {
    __SATI_MEMORY_STORE__?: ProgressMemory;
  }
}

const stages = [
  { name: "🌰 Seed", at: 0, next: 100 },
  { name: "🌱 Sprout", at: 100, next: 300 },
  { name: "🪴 Seedling", at: 300, next: 700 },
  { name: "🌿 Plant", at: 700, next: 1500 },
  { name: "🌳 Flourishing", at: 1500, next: 1500 },
];

const stretches = [
  { title: "ยืดคอด้านข้าง", copy: "เอียงศีรษะไปด้านข้างค้างไว้ 15 วินาที สลับซ้าย-ขวา" },
  { title: "หมุนไหล่", copy: "หมุนไหล่ช้า ๆ ไปหน้า-หลัง อย่างละ 8 ครั้ง" },
  { title: "ยืดหลังส่วนบน", copy: "ประสานมือไปข้างหน้า ยืดแขนและหลังส่วนบน 15 วินาที" },
];

const guideSteps = [
  {
    emoji: "🌱",
    title: "ยินดีต้อนรับสู่ Sati",
    copy: "โค้ชท่านั่งที่ช่วยให้คุณทำงานอย่างมีสุขภาวะ มาดูกันว่ามันทำงานยังไงใน 30 วินาที",
  },
  {
    emoji: "📡",
    title: "เซนเซอร์จริง 3 ตัว",
    copy: "Sati วัดมุมหลัง ระยะหน้าจอ และการเคลื่อนไหวจากเซนเซอร์จริง ไม่ใช่ค่าที่กดเอง ดูได้ที่แผง Live Signals",
  },
  {
    emoji: "🌳",
    title: "ต้นไม้โตจากพฤติกรรมจริง",
    copy: "นั่งท่าดี พักตาม cue = ต้นไม้สะสมแต้มและเติบโต เพราะข้อมูลมาจาก sensor",
  },
  {
    emoji: "🎯",
    title: "ทำภารกิจ รับเหรียญ",
    copy: "ภารกิจรายวันให้เหรียญ Sati เอาไปแต่งต้นไม้ในร้านค้าได้ ไม่ใช้เงินจริง",
  },
  {
    emoji: "▶️",
    title: "ลองเล่นเลย!",
    copy: "กดปุ่มนั่งงอหลังด้านล่าง แล้วดูต้นไม้เปลี่ยนอารมณ์และระบบแนะนำให้พัก",
  },
];

const shopItems = [
  { id: "pot1", emoji: "🪴", name: "กระถางเซรามิก", price: 50 },
  { id: "pot2", emoji: "🏺", name: "กระถางลายเบญจรงค์", price: 120 },
  { id: "flower", emoji: "🌸", name: "ดอกไม้สีชมพู", price: 100 },
  { id: "sun", emoji: "☀️", name: "แสงอุ่น", price: 80 },
  { id: "leafCharm", emoji: "🍃", name: "ใบไม้ประดับ", price: 150 },
  { id: "lantern", emoji: "🏮", name: "โคมไฟไทย", price: 180 },
  { id: "star", emoji: "⭐", name: "ดาวประดับ", price: 90 },
  { id: "glow", emoji: "✨", name: "ต้นไม้เรืองแสง", price: 300 },
];

const missionCopy: Record<MissionId, { name: string; reward: number }> = {
  m1: { name: "พักครบ 3 ครั้ง", reward: 30 },
  m2: { name: "นั่งท่าดีครบ 1 Pomodoro", reward: 20 },
  m3: { name: "รักษาระยะหน้าจอดีทั้งชั่วโมง", reward: 20 },
};

const thresholds = {
  warnDeg: 20,
  badDeg: 40,
  closeCm: 45,
  warnMs: 3000,
  closeWarnMs: 800,
  actMs: 7000,
  closeActMs: 5200,
  recMs: 1300,
  longSit: 80,
  moveBreakMs: 5000,
  goodGpMs: 1500000,
  demoGpMs: 60000,
};

const hackathonDemoMode = process.env.NEXT_PUBLIC_SATI_DEMO_MODE !== "false";
const goodPostureMilestoneMs = hackathonDemoMode ? thresholds.demoGpMs : thresholds.goodGpMs;
const envSensorAutoConnect = process.env.NEXT_PUBLIC_SATI_WS_AUTOCONNECT === "true";

const stateCopy: Record<SatiState, { title: string; cue: string }> = {
  normal: { title: "NORMAL — ต้นไม้ของคุณแข็งแรงดี", cue: "wellness cue / ปกติ" },
  warning: { title: "WARNING — ปรับท่านั่งหน่อยนะ", cue: "wellness cue / เตือน" },
  action: { title: "ACTION — ได้เวลาพักและยืดเส้น", cue: "wellness cue / แนะนำ" },
};

const teamBaseline = {
  goodPct: 78,
  restWindow: "15:00–16:00",
  breaks: 24,
  devices: 18,
};

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function freshMissionsDone(): MissionsDone {
  return { m1: false, m2: false, m3: false };
}

function readMemory(): ProgressMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const box = window.name ? JSON.parse(window.name) : {};
    return box[MEMORY_KEY] || null;
  } catch {
    return window.__SATI_MEMORY_STORE__ || null;
  }
}

function writeMemory(data: ProgressMemory) {
  if (typeof window === "undefined") return;
  try {
    const box = window.name ? JSON.parse(window.name) : {};
    box[MEMORY_KEY] = data;
    window.name = JSON.stringify(box);
  } catch {
    try {
      window.name = JSON.stringify({ [MEMORY_KEY]: data });
    } catch {
      window.__SATI_MEMORY_STORE__ = data;
    }
  }
}

function createAppState(saved: ProgressMemory | null = null): AppState {
  const t = nowMs();
  return {
    mode: "normal",
    state: "normal",
    sit: 0,
    backMs: 0,
    distMs: 0,
    recMs: 0,
    last: t,
    modeStart: t,
    ang: 15,
    dist: 60,
    postureClass: "normal",
    movementMs: 0,
    movementRewarded: false,
    distanceGoodMs: 0,
    distanceTotalMs: 0,
    gp: saved?.gp ?? 120,
    coins: saved?.coins ?? 80,
    stretchIdx: saved?.stretchIdx ?? 0,
    breaks: saved?.breaks ?? 0,
    bestGoodSec: saved?.bestGoodSec ?? 0,
    goodRun: 0,
    goodAcc: 0,
    missionsDone: { ...freshMissionsDone(), ...(saved?.missionsDone || {}) },
    owned: saved?.owned ?? [],
    decorations: saved?.decorations ?? [],
  };
}

function fmt(seconds: number) {
  const minute = String(Math.floor(seconds / 60)).padStart(2, "0");
  const second = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${minute}:${second}`;
}

function stageIndexForGp(gp: number) {
  let stage = 0;
  for (let i = 0; i < stages.length; i += 1) {
    if (gp >= stages[i].at) stage = i;
  }
  return stage;
}

function normalizePostureClass(value: unknown) {
  return String(value || "normal").trim().toLowerCase().replace(/_/g, "-");
}

function shouldAutoConnectSensor() {
  if (typeof window === "undefined") return false;
  return envSensorAutoConnect || new URLSearchParams(window.location.search).get("live") === "1";
}

function periodName(hour: number): BehaviorRow["period"] {
  if (hour >= 12 && hour < 17) return "ช่วงบ่าย";
  if (hour >= 17) return "ช่วงเย็น";
  return "ช่วงเช้า";
}

function completeMission(next: AppState, id: MissionId, events: string[]) {
  if (next.missionsDone[id]) return;
  next.missionsDone = { ...next.missionsDone, [id]: true };
  next.coins += missionCopy[id].reward;
  events.push(`ภารกิจสำเร็จ: ${missionCopy[id].name} · +${missionCopy[id].reward} coins`);
}

function checkMissions(next: AppState, events: string[]) {
  if (next.breaks >= 3) completeMission(next, "m1", events);
  if (next.bestGoodSec * 1000 >= goodPostureMilestoneMs) completeMission(next, "m2", events);
  const distanceGoodRatio = next.distanceTotalMs ? next.distanceGoodMs / next.distanceTotalMs : 0;
  if (distanceGoodRatio >= 0.8) completeMission(next, "m3", events);
}

function mockSensors(next: AppState, dt: number, now: number) {
  const sec = (now - next.modeStart) / 1000;
  const wave = Math.sin(now / 900);
  if (next.mode === "normal") {
    next.ang = 15 + wave * 1.4;
    next.dist = 60 + Math.sin(now / 1100) * 2;
    next.postureClass = "normal";
    next.sit += dt / 1000;
  } else if (next.mode === "slouch") {
    next.ang = (sec > 8.4 ? 45 : 32) + wave * 1.2;
    next.dist = 60 + Math.sin(now / 1200) * 1.5;
    next.postureClass = "hunched";
    next.sit += dt / 1000;
  } else {
    next.ang = 15 + wave;
    next.dist = 61 + Math.sin(now / 1000) * 1.5;
    next.postureClass = next.mode === "movement" ? "movement" : "normal";
    next.sit += next.mode === "movement" ? dt / 1000 : (dt / 1000) * 7;
  }
}

function runStateMachine(next: AppState, dt: number, events: string[]) {
  const movementCue = next.postureClass === "movement";
  if (movementCue) {
    next.movementMs += dt;
  } else {
    next.movementMs = 0;
    next.movementRewarded = false;
  }

  if (next.movementMs >= thresholds.moveBreakMs) {
    if (!next.movementRewarded) {
      next.gp += 15;
      next.breaks += 1;
      next.movementRewarded = true;
      events.push("ลุกพักสำเร็จ · +15 GP 🌿");
    }
    next.state = "normal";
    next.backMs = 0;
    next.distMs = 0;
    next.sit = 0;
    next.recMs = thresholds.recMs;
    next.goodRun = 0;
    next.goodAcc = 0;
    return;
  }

  const backCue = next.ang > thresholds.warnDeg;
  const distCue = next.dist < thresholds.closeCm;
  const longSit = next.sit >= thresholds.longSit;
  next.backMs = backCue ? next.backMs + dt : 0;
  next.distMs = distCue ? next.distMs + dt : 0;
  const anyCue = backCue || distCue || longSit || movementCue;
  next.recMs = anyCue ? 0 : next.recMs + dt;

  if (!anyCue) {
    next.goodRun += dt / 1000;
    next.bestGoodSec = Math.max(next.bestGoodSec, next.goodRun);
    next.goodAcc += dt;
    if (next.goodAcc >= goodPostureMilestoneMs) {
      next.gp += 20;
      next.goodAcc = 0;
      events.push(`นั่งท่าดีครบ ${hackathonDemoMode ? "1 นาที" : "25 นาที"} · +20 GP 🌱`);
    }
  } else {
    next.goodRun = 0;
    next.goodAcc = 0;
  }

  const warnReady = next.backMs >= thresholds.warnMs || next.distMs >= thresholds.closeWarnMs;
  const actReady = next.backMs >= thresholds.actMs || next.distMs >= thresholds.closeActMs || longSit;
  if (next.state === "action") {
    return;
  }
  if (actReady) next.state = "action";
  else if (warnReady) next.state = "warning";
  else if (next.recMs >= thresholds.recMs) next.state = "normal";
}

function angStat(angle: number) {
  if (angle > thresholds.badDeg) return "Deep bend";
  if (angle > thresholds.warnDeg) return "Adjust";
  return "Good";
}

function SatiMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 6c6 5 9 10 9 16a9 9 0 0 1-18 0c0-6 3-11 9-16Z" fill="currentColor" opacity=".9" />
      <path d="M24 42V22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SatiApp() {
  const [hydrated, setHydrated] = useState(false);
  const [app, setApp] = useState<AppState>(() => createAppState());
  const [view, setView] = useState("coach");
  const [guideOpen, setGuideOpen] = useState(true);
  const [guideSeen, setGuideSeen] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [behaviorLog, setBehaviorLog] = useState<BehaviorRow[]>([]);
  const [sensor, setSensor] = useState<{ source: SensorSource; status: string }>({
    source: "mock",
    status: "connecting",
  });
  const [gpPulse, setGpPulse] = useState(false);
  const [coinPulse, setCoinPulse] = useState(false);
  const [levelPulse, setLevelPulse] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const lastMessageRef = useRef(0);
  const logAccRef = useRef(0);
  const appRef = useRef(app);
  const previousWalletRef = useRef({ gp: app.gp, coins: app.coins });
  const previousStageRef = useRef(stageIndexForGp(app.gp));

  const stageIndex = stageIndexForGp(app.gp);
  const currentStage = stages[stageIndex];
  const stageSpan = currentStage.next - currentStage.at;
  const stageProgress =
    stageIndex === stages.length - 1
      ? 100
      : Math.round(((app.gp - currentStage.at) / Math.max(stageSpan, 1)) * 100);
  const live = sensor.source === "ws";
  const activeStretch = stretches[app.stretchIdx % stretches.length];
  const selectedGuide = guideSteps[guideIndex];

  const insights = useMemo(() => {
    const buckets: Record<BehaviorRow["period"], number> = {
      "ช่วงเช้า": 0,
      "ช่วงบ่าย": 0,
      "ช่วงเย็น": 0,
    };
    behaviorLog.forEach((row) => {
      if (row.angle > thresholds.warnDeg || row.state !== "normal") buckets[row.period] += 1;
    });
    const [topPeriod, topCount] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
    const goodCount = behaviorLog.filter((row) => row.state === "normal").length;
    const goodPct = behaviorLog.length ? Math.round((goodCount / behaviorLog.length) * 100) : 0;
    const avgDist = behaviorLog.length
      ? Math.round(behaviorLog.reduce((sum, row) => sum + row.distance, 0) / behaviorLog.length)
      : Math.round(app.dist);

    return {
      topPeriod,
      topCount,
      goodPct,
      avgDist,
    };
  }, [app.dist, behaviorLog]);

  const hrAggregate = useMemo(() => {
    const userGoodPct = behaviorLog.length ? insights.goodPct : teamBaseline.goodPct;
    return {
      goodPct: Math.round((teamBaseline.goodPct * 17 + userGoodPct) / 18),
      restWindow: teamBaseline.restWindow,
      breaks: teamBaseline.breaks + app.breaks,
      devices: teamBaseline.devices,
    };
  }, [app.breaks, behaviorLog.length, insights.goodPct]);

  useEffect(() => {
    const memory = readMemory();
    const restored = createAppState(memory);
    previousWalletRef.current = { gp: restored.gp, coins: restored.coins };
    previousStageRef.current = stageIndexForGp(restored.gp);
    appRef.current = restored;
    setApp(restored);
    setGuideSeen(memory?.guideSeen === true);
    setGuideOpen(memory?.guideSeen === true ? false : true);
    setThemePref(memory?.theme ?? "system");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyResolved = () => {
      let next: "light" | "dark" = "light";
      if (themePref === "dark") next = "dark";
      else if (themePref === "light") next = "light";
      else next = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

      setResolvedTheme(next);
      document.documentElement.setAttribute("data-theme", next);
    };

    applyResolved();

    if (themePref === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener("change", applyResolved);
      return () => mql.removeEventListener("change", applyResolved);
    }
  }, [themePref]);

  useEffect(() => {
    appRef.current = app;
  }, [app]);

  useEffect(() => {
    if (!hydrated) return;
    const data: ProgressMemory = {
      gp: app.gp,
      coins: app.coins,
      stretchIdx: app.stretchIdx,
      breaks: app.breaks,
      bestGoodSec: app.bestGoodSec,
      guideSeen,
      missionsDone: app.missionsDone,
      owned: app.owned,
      decorations: app.decorations,
      theme: themePref,
    };
    writeMemory(data);
  }, [
    hydrated,
    app.gp,
    app.coins,
    app.stretchIdx,
    app.breaks,
    app.bestGoodSec,
    guideSeen,
    app.missionsDone,
    app.owned,
    app.decorations,
    themePref,
  ]);

  useEffect(() => {
    const previous = previousWalletRef.current;
    if (previous.gp !== app.gp) {
      setGpPulse(true);
      window.setTimeout(() => setGpPulse(false), 650);
    }
    if (previous.coins !== app.coins) {
      setCoinPulse(true);
      window.setTimeout(() => setCoinPulse(false), 650);
    }
    previousWalletRef.current = { gp: app.gp, coins: app.coins };
  }, [app.gp, app.coins]);

  useEffect(() => {
    if (!hydrated) return;
    const previousStage = previousStageRef.current;
    if (stageIndex > previousStage) {
      setLevelPulse(true);
      window.setTimeout(() => setLevelPulse(false), 900);
      toast.success(`ต้นไม้เลื่อนขั้นเป็น ${stages[stageIndex].name}!`);
    }
    previousStageRef.current = stageIndex;
  }, [hydrated, stageIndex]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    reconnectRef.current = window.setTimeout(() => connectRef.current(), 3000);
  }, []);

  const applySensorData = useCallback((data: Record<string, unknown>) => {
    setApp((prev) => {
      const next = { ...prev };
      const backAngle = Number(data.backAngle);
      const screenDistance = Number(data.screenDistance);
      if (Number.isFinite(backAngle)) next.ang = backAngle;
      if (Number.isFinite(screenDistance)) next.dist = screenDistance;
      const posture = normalizePostureClass(data.postureClass);
      next.postureClass = posture === "movement" ? "movement" : posture;
      const backPostureCue = next.postureClass === "slouch" || next.postureClass === "hunched";
      const closePostureCue = next.postureClass === "close" || next.postureClass === "too-close";
      if (backPostureCue && next.ang <= thresholds.warnDeg) next.ang = thresholds.warnDeg + 8;
      if (closePostureCue && next.dist >= thresholds.closeCm) next.dist = thresholds.closeCm - 6;
      appRef.current = next;
      return next;
    });
    lastMessageRef.current = nowMs();
  }, []);

  const connectSensor = useCallback(() => {
    if (!shouldAutoConnectSensor()) {
      setSensor({ source: "mock", status: "mock" });
      return;
    }
    if (typeof window === "undefined" || !("WebSocket" in window)) {
      setSensor({ source: "mock", status: "mock" });
      return;
    }
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    setSensor((prev) => ({ ...prev, status: "connecting" }));
    try {
      const host = window.location.hostname || "127.0.0.1";
      const ws = new WebSocket(`ws://${host}:8765`);
      wsRef.current = ws;
      ws.onopen = () => {
        setSensor({ source: "ws", status: "live" });
        lastMessageRef.current = nowMs();
      };
      ws.onmessage = (event) => {
        try {
          applySensorData(JSON.parse(event.data));
        } catch {
          setSensor({ source: "mock", status: "mock" });
        }
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setSensor({ source: "mock", status: "mock" });
        scheduleReconnect();
      };
      ws.onerror = () => ws.close();
    } catch {
      setSensor({ source: "mock", status: "mock" });
      scheduleReconnect();
    }
  }, [applySensorData, scheduleReconnect]);

  useEffect(() => {
    connectRef.current = connectSensor;
  }, [connectSensor]);

  useEffect(() => {
    if (!hydrated) return;
    connectSensor();
    return () => {
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connectSensor, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => {
      const time = nowMs();
      let queuedToasts: string[] = [];
      let rowToLog: BehaviorRow | null = null;
      const prev = appRef.current;
      const dt = Math.min(time - prev.last, 1000);
      const next: AppState = {
        ...prev,
        last: time,
        missionsDone: { ...prev.missionsDone },
        owned: [...prev.owned],
        decorations: [...prev.decorations],
      };

      if (sensor.source === "ws") {
        next.sit += dt / 1000;
        if (lastMessageRef.current && time - lastMessageRef.current > 5000) {
          wsRef.current?.close();
          setSensor({ source: "mock", status: "mock" });
          scheduleReconnect();
        }
      } else {
        mockSensors(next, dt, time);
      }

      next.distanceTotalMs += dt;
      if (next.dist >= thresholds.closeCm) next.distanceGoodMs += dt;
      runStateMachine(next, dt, queuedToasts);
      checkMissions(next, queuedToasts);

      logAccRef.current += dt;
      if (logAccRef.current >= 2000) {
        logAccRef.current = 0;
        const hour = new Date().getHours();
        rowToLog = {
          hour,
          period: periodName(hour),
          state: next.state,
          angle: next.ang,
          distance: next.dist,
        };
      }

      appRef.current = next;
      setApp(next);

      queuedToasts.forEach((message) => toast.success(message));
      if (rowToLog) {
        setBehaviorLog((prev) => [...prev.slice(-239), rowToLog as BehaviorRow]);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [hydrated, scheduleReconnect, sensor.source]);

  const setMode = (mode: MockMode) => {
    if (live) return;
    const time = nowMs();
    setApp((prev) => {
      const next = {
        ...prev,
        mode,
        modeStart: time,
        backMs: 0,
        distMs: 0,
        recMs: 0,
        sit: mode === "normal" ? 0 : mode === "long" ? thresholds.longSit - 26 : prev.sit,
        state: mode === "normal" || mode === "movement" ? "normal" : prev.state,
      };
      appRef.current = next;
      return next;
    });
  };

  const handleStretchDone = () => {
    setApp((prev) => {
      const next = {
        ...prev,
        gp: prev.gp + 10,
        breaks: prev.breaks + 1,
        state: "normal" as SatiState,
        mode: "normal" as MockMode,
        sit: 0,
        backMs: 0,
        distMs: 0,
        recMs: 0,
        ang: 15,
        dist: 60,
        modeStart: nowMs(),
        stretchIdx: (prev.stretchIdx + 1) % stretches.length,
        missionsDone: { ...prev.missionsDone },
      };
      const events: string[] = [];
      next.coins += 15;
      checkMissions(next, events);
      events.forEach((message) => toast.success(message));
      appRef.current = next;
      return next;
    });
    toast.success("ทำท่ายืดเหยียดสำเร็จ · +10 GP 🌿");
  };

  const resetDemo = () => {
    const fresh = createAppState(null);
    previousWalletRef.current = { gp: fresh.gp, coins: fresh.coins };
    previousStageRef.current = stageIndexForGp(fresh.gp);
    appRef.current = fresh;
    setApp(fresh);
    setBehaviorLog([]);
    logAccRef.current = 0;
    toast.success("รีเซ็ตเดโมแล้ว");
  };

  const setNearLevelDemo = () => {
    const nextStage = stages[Math.min(stageIndex + 1, stages.length - 1)];
    setApp((prev) => {
      const next = {
        ...prev,
        gp: Math.max(0, nextStage.at - 20),
      };
      appRef.current = next;
      return next;
    });
    toast.success("ตั้งค่าเดโมให้ใกล้ขึ้นขั้นแล้ว");
  };

  const completeGuide = () => {
    setGuideSeen(true);
    setGuideOpen(false);
  };

  const replayGuide = () => {
    setGuideIndex(0);
    setGuideOpen(true);
  };

  const cycleTheme = () => {
    setThemePref((prev) => (prev === "dark" ? "light" : prev === "light" ? "system" : "dark"));
  };

  const buyItem = (itemId: string) => {
    const item = shopItems.find((candidate) => candidate.id === itemId);
    if (!item) return;
    setApp((prev) => {
      if (prev.owned.includes(item.id) || prev.coins < item.price) return prev;
      toast.success(`ได้ ${item.name} แล้ว!`);
      const next = {
        ...prev,
        coins: prev.coins - item.price,
        owned: [...prev.owned, item.id],
        decorations: [...prev.decorations, item.emoji],
      };
      appRef.current = next;
      return next;
    });
  };

  return (
    <main className="sati-root" data-state={app.state} aria-label="Sati posture and focus coach">
      <div className="shell">
        <header className="top">
          <div className="brand">
            <div className="mark" aria-hidden="true">
              <SatiMark />
            </div>
            <div>
              <h1>Sati</h1>
              <div className="sub">Posture &amp; Focus Coach</div>
            </div>
          </div>
          <div className="wallet" aria-live="polite" data-testid="wallet-chip">
            <button
              className="theme-toggle"
              onClick={cycleTheme}
              aria-label={`Theme: ${themePref}. Click to cycle.`}
              data-testid="theme-toggle"
              title={`Theme: ${themePref} (resolved: ${resolvedTheme})`}
              type="button"
            >
              {themePref === "system" ? <Monitor /> : resolvedTheme === "dark" ? <Moon /> : <Sun />}
            </button>
            {hackathonDemoMode ? (
              <Badge className="demo-mode-badge" variant="secondary">
                🎬 Demo Mode · GP เร่งให้ดูเร็วขึ้น
              </Badge>
            ) : null}
            <Badge
              className={gpPulse ? "wallet-chip gain-pop" : "wallet-chip"}
              variant="default"
              data-testid="wallet-gp"
            >
              <Leaf data-icon="inline-start" />
              <span>{app.gp}</span> GP
            </Badge>
            <Badge
              className={coinPulse ? "wallet-chip coin gain-pop" : "wallet-chip coin"}
              variant="warm"
              data-testid="wallet-coin"
            >
              <span className="coin-dot">¢</span>
              <span>{app.coins}</span>
            </Badge>
          </div>
        </header>

        <Tabs value={view} onValueChange={setView} className="sati-tabs">
          <TabsList className="view-tabs" aria-label="Sati views">
            <TabsTrigger value="coach">Coach</TabsTrigger>
            <TabsTrigger value="insights">Second-Brain</TabsTrigger>
            <TabsTrigger value="hr">HR Dashboard</TabsTrigger>
          </TabsList>

          <TabsContent value="coach" className="grid view-panel">
            <Card className="hero">
              <CardHeader className="hero-head">
                <div className="state-line" data-testid="state-line">
                  <CardTitle className="state-txt" data-testid="state-title">
                    {stateCopy[app.state].title}
                  </CardTitle>
                  <Badge className="state-pill" variant="secondary">
                    <span className="dot" />
                    {stateCopy[app.state].cue}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="hero-content">
                <div className="plantwrap">
                  <div className="halo" />
                  <PlantAvatar decorations={app.decorations} />

                  <aside className="action-card" aria-live="polite">
                    <div>
                      <div className="ac-title">{activeStretch.title}</div>
                      <div className="ac-copy">{activeStretch.copy}</div>
                      <Button className="ac-btn" onClick={handleStretchDone}>
                        <Check data-icon="inline-start" />
                        ทำเสร็จแล้ว · +10 GP
                      </Button>
                    </div>
                    <div className="ac-ill" aria-hidden="true">
                      <svg viewBox="0 0 60 76">
                        <circle cx="30" cy="12" r="7" />
                        <path d="M30 19V46" />
                        <path d="M30 26L16 34" />
                        <path d="M30 26L46 18" />
                        <path d="M30 46L20 66" />
                        <path d="M30 46L42 66" />
                      </svg>
                    </div>
                  </aside>
                </div>

                <div className={levelPulse ? "growth level-pop" : "growth"}>
                  <div className="growth-top">
                    <span className="stage-name" data-testid="stage-name">
                      {currentStage.name}
                    </span>
                    <span>
                      {stageIndex === stages.length - 1
                        ? `${app.gp} GP · MAX`
                        : `${app.gp} / ${currentStage.next} GP`}
                    </span>
                  </div>
                  <Progress className="growth-progress" value={stageProgress} data-testid="growth-progress" />
                  <div className="stage-track">
                    {stages.map((stage, index) => (
                      <span key={stage.name} className={index <= stageIndex ? "on" : ""}>
                        {stage.name.split(" ")[0]}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="side">
              <Card className="signals">
                <CardHeader className="compact-card-head">
                  <CardTitle className="sg-title">Live Signals</CardTitle>
                  <CardDescription className="sg-sub">
                    ค่าจริงจากเซนเซอร์ — IMU, ToF, กล้อง
                  </CardDescription>
                </CardHeader>
                <CardContent className="compact-card-content">
                  <div className={live ? "sensor-status live" : "sensor-status"} aria-live="polite">
                    {live ? <Wifi data-icon="inline-start" /> : <WifiOff data-icon="inline-start" />}
                    {live ? "Arduino WebSocket: live" : "Arduino WebSocket: mock fallback"}
                  </div>
                  <SignalRow testId="signal-back-angle" label="Back Angle" detail="IMU · Nano 33 BLE" value={Math.round(app.ang)} unit="°" stat={angStat(app.ang)} />
                  <SignalRow testId="signal-screen-distance" label="Screen Distance" detail="Modulino ToF" value={Math.round(app.dist)} unit="cm" stat={app.dist < thresholds.closeCm ? "Too Close" : "Good"} />
                  <SignalRow testId="signal-posture-class" label="Posture Class" detail="sensor cue" value={app.postureClass} stat={live ? "Arduino live" : "Mock fallback"} posture />
                  <SignalRow testId="signal-sitting-time" label="Sitting Time" detail="since last break" value={fmt(app.sit)} stat={app.sit >= thresholds.longSit ? "Take a break" : "Counting"} />
                </CardContent>
              </Card>

              <Card className="missions">
                <CardHeader className="compact-card-head mission-head">
                  <CardTitle className="m-title">ภารกิจวันนี้</CardTitle>
                  <CardDescription>Daily Missions</CardDescription>
                </CardHeader>
                <CardContent className="compact-card-content mission-list">
                  {(Object.keys(missionCopy) as MissionId[]).map((id) => (
                    <div key={id} className={app.missionsDone[id] ? "mission done" : "mission"}>
                      <div className="m-check">
                        <Check />
                      </div>
                      <div className="m-body">
                        <div className="m-name">{missionCopy[id].name}</div>
                      </div>
                      <div className="m-reward">
                        <span className="coin-small">¢</span>
                        {missionCopy[id].reward}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="view-panel insights-view">
            <ViewHead title="Second-Brain Insights" copy="สรุป pattern จาก log วันนี้แบบ observation" chip={`${behaviorLog.length} logs`} />
            <div className="insight-grid">
              <Card className="insight-card primary">
                <CardContent className="insight-content">
                  <span>ฉันสังเกตว่า...</span>
                  <strong>
                    {insights.topCount > 0
                      ? `${insights.topPeriod}คุณมักนั่งงอหลังมากสุด`
                      : "วันนี้ยังไม่เห็น pattern ท่านั่งที่ต้องปรับเป็นพิเศษ"}
                  </strong>
                  <p>
                    {insights.topCount > 0
                      ? `พบ ${insights.topCount} ช่วง log ที่หลังเริ่มงอหรือ state เปลี่ยนจากปกติ`
                      : "ข้อมูลยังนุ่มอยู่ Sati จะค่อย ๆ สรุปเมื่อมี log มากขึ้น"}
                  </p>
                </CardContent>
              </Card>
              <InsightCard title={`วันนี้พัก ${app.breaks} ครั้ง`} copy="นับจากการทำท่ายืดเหยียดหลังได้รับ cue จากระบบ" />
              <InsightCard title={app.bestGoodSec > 0 ? `ท่าดีต่อเนื่องยาวสุด ${fmt(app.bestGoodSec)}` : `ท่าดีใน log ตอนนี้ ${insights.goodPct}%`} copy={`สัดส่วน state ปกติจาก log ล่าสุดอยู่ที่ ${insights.goodPct}%`} />
              <InsightCard title={`ระยะหน้าจอเฉลี่ย ${insights.avgDist} cm`} copy={insights.avgDist < thresholds.closeCm ? "มีบางช่วงที่คุณขยับเข้าใกล้หน้าจอ ลองเว้นระยะเพิ่มเล็กน้อย" : "ระยะจาก ToF อยู่ในโซนสบายเป็นส่วนใหญ่"} />
            </div>
          </TabsContent>

          <TabsContent value="hr" className="view-panel hr-view">
            <ViewHead title="HR Dashboard" copy="ภาพรวมทีมแบบ anonymized aggregate เท่านั้น" chip="No individual data" />
            <div className="hr-grid">
              <Card className="hr-card hero-metric">
                <CardContent className="hr-content">
                  <span>Team posture time</span>
                  <strong>{hrAggregate.goodPct}%</strong>
                  <p>% เวลานั่งท่าดีเฉลี่ยทั้งทีม</p>
                  <Progress className="metric-bar" value={hrAggregate.goodPct} />
                </CardContent>
              </Card>
              <HrMetric label="Team rhythm" value={hrAggregate.restWindow} copy="based on 7-day rolling window" />
              <HrMetric label="Break rhythm" value={`${hrAggregate.breaks} ครั้ง`} copy="จำนวนพักรวมแบบไม่ระบุตัวตนในวันนี้" />
              <HrMetric label="Coverage" value={`${hrAggregate.devices} devices`} copy="อุปกรณ์ที่ส่งข้อมูล aggregate ล่าสุด" />
            </div>
          </TabsContent>
        </Tabs>

        <footer>
          <div className="controls" aria-label="Fallback mock controls">
            <span className="clabel">Fallback mock:</span>
            <Button className={app.mode === "normal" ? "fallback-btn active" : "fallback-btn"} variant="outline" disabled={live} onClick={() => setMode("normal")}>
              นั่งปกติ
              <small>Normal</small>
            </Button>
            <Button className={app.mode === "slouch" ? "fallback-btn active" : "fallback-btn"} variant="outline" disabled={live} onClick={() => setMode("slouch")}>
              นั่งงอหลัง
              <small>Hunched</small>
            </Button>
            <Button className={app.mode === "long" ? "fallback-btn active" : "fallback-btn"} variant="outline" disabled={live} onClick={() => setMode("long")}>
              นั่งนาน
              <small>Long sitting</small>
            </Button>
            <Button className={app.mode === "movement" ? "fallback-btn active" : "fallback-btn"} variant="outline" disabled={live} onClick={() => setMode("movement")}>
              ลุกพัก
              <small>Movement</small>
            </Button>
            <Button className="fallback-btn ghost" variant="ghost" onClick={resetDemo} aria-label="Reset demo progress">
              <RotateCcw data-icon="inline-start" />
              Reset
            </Button>
            <Button className="fallback-btn ghost" variant="ghost" onClick={setNearLevelDemo}>
              Demo: ใกล้ขึ้นขั้น
            </Button>
            <Button className="fallback-btn ghost" variant="ghost" onClick={replayGuide}>
              ดู Tour อีกครั้ง
            </Button>
            <Button className="fallback-btn shop" variant="warm" onClick={() => setShopOpen(true)} aria-label="Open decoration shop">
              <ShoppingBag data-icon="inline-start" />
              ร้านค้า · Shop
            </Button>
          </div>
          <div className="foot">
            Sati is a wellness companion · เหรียญและการเติบโตมาจากพฤติกรรมจริงที่เซนเซอร์ยืนยัน
          </div>
        </footer>
      </div>

      <Dialog open={guideOpen} onOpenChange={(open) => (open ? setGuideOpen(true) : completeGuide())}>
        <DialogContent className="guide-card">
          <button className="guide-skip" type="button" onClick={completeGuide}>
            ข้าม / Skip
          </button>
          <div className="guide-emoji">{selectedGuide.emoji}</div>
          <div className="guide-step">ขั้นที่ {guideIndex + 1} / {guideSteps.length}</div>
          <DialogHeader>
            <DialogTitle className="guide-h">{selectedGuide.title}</DialogTitle>
            <DialogDescription className="guide-p">
              {selectedGuide.copy}
            </DialogDescription>
          </DialogHeader>
          <div className="guide-dots" aria-hidden="true">
            {guideSteps.map((step, index) => (
              <i key={step.title} className={index === guideIndex ? "on" : ""} />
            ))}
          </div>
          <DialogFooter className="guide-nav">
            <Button variant="outline" onClick={() => setGuideIndex((current) => Math.max(0, current - 1))} style={{ visibility: guideIndex === 0 ? "hidden" : "visible" }}>
              ย้อนกลับ
            </Button>
            <Button onClick={() => (guideIndex < guideSteps.length - 1 ? setGuideIndex((current) => current + 1) : completeGuide())}>
              {guideIndex === guideSteps.length - 1 ? "เริ่มใช้งาน" : "ถัดไป"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shopOpen} onOpenChange={setShopOpen}>
        <DialogContent className="shop-card">
          <DialogHeader className="shop-head">
            <div>
              <DialogTitle className="shop-title">ร้านค้าตกแต่ง</DialogTitle>
              <DialogDescription className="shop-sub">
                ใช้เหรียญที่ได้จากภารกิจมาแต่งต้นไม้ของคุณ · มี <b>{app.coins}</b> เหรียญ
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="outline" size="icon" aria-label="Close shop">
                <X />
              </Button>
            </DialogClose>
          </DialogHeader>
          <div className="shop-grid">
            {shopItems.map((item) => {
              const owned = app.owned.includes(item.id);
              const canBuy = app.coins >= item.price;
              return (
                <div className={owned ? "shop-item owned" : "shop-item"} key={item.id}>
                  <div className="item-emoji">{item.emoji}</div>
                  <div className="item-name">{item.name}</div>
                  <div className="item-price">
                    <span className="coin-small">¢</span>
                    {item.price}
                  </div>
                  <Button className="buy-btn" disabled={owned || !canBuy} onClick={() => buyItem(item.id)}>
                    {owned ? "มีแล้ว" : canBuy ? "ซื้อ" : "เหรียญไม่พอ"}
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-center" theme={resolvedTheme} />
    </main>
  );
}

function SignalRow({
  label,
  detail,
  value,
  unit,
  stat,
  posture = false,
  testId,
}: {
  label: string;
  detail: string;
  value: string | number;
  unit?: string;
  stat: string;
  posture?: boolean;
  testId?: string;
}) {
  return (
    <div className="sig" data-testid={testId}>
      <div className="lab">
        {label}
        <small>{detail}</small>
      </div>
      <div>
        <div className={posture ? "val posture" : "val"}>
          <span>{value}</span>
          {unit ? <span className="u">{unit}</span> : null}
        </div>
        <span className="stat">{stat}</span>
      </div>
    </div>
  );
}

function ViewHead({ title, copy, chip }: { title: string; copy: string; chip: string }) {
  return (
    <div className="view-head">
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <Badge className="view-chip" variant="secondary">
        {chip}
      </Badge>
    </div>
  );
}

function InsightCard({ title, copy }: { title: string; copy: string }) {
  return (
    <Card className="insight-card">
      <CardContent className="insight-content">
        <span>ฉันสังเกตว่า...</span>
        <strong>{title}</strong>
        <p>{copy}</p>
      </CardContent>
    </Card>
  );
}

function HrMetric({ label, value, copy }: { label: string; value: string; copy: string }) {
  return (
    <Card className="hr-card">
      <CardContent className="hr-content">
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{copy}</p>
      </CardContent>
    </Card>
  );
}
