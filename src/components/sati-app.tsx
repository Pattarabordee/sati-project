"use client";

import * as THREE from "three";
import {
  Activity,
  BarChart3,
  Bluetooth,
  Box,
  Cpu,
  Database,
  Download,
  FileText,
  Gauge,
  Leaf,
  Moon,
  Play,
  Radio,
  RotateCcw,
  Ruler,
  Settings,
  Signal,
  SlidersHorizontal,
  Square,
  Sun,
  Thermometer,
  Vibrate,
  Waves,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MEMORY_KEY = "sati-progress-v1";
const HISTORY_LIMIT = 160;
const ASSET_DIR = "sati-clip";

type ThemePref = "light" | "dark" | "system";
type ConnectionSource = "mock" | "ws";
type LedState = "green" | "yellow" | "red";
type MovementLabel =
  | "stable_lift"
  | "bend_forward"
  | "twist_carry"
  | "rough_movement"
  | "walk_carry"
  | "idle"
  | "other";

type Vector3 = {
  gx: number;
  gy: number;
  gz: number;
};

type Accel3 = {
  ax: number;
  ay: number;
  az: number;
};

type Mag3 = {
  mx: number;
  my: number;
  mz: number;
};

type OrientationQuat = {
  qw: number;
  qx: number;
  qy: number;
  qz: number;
};

type OrientationRpy = {
  roll: number;
  pitch: number;
  yaw: number;
};

type NanoPacket = {
  n?: number;
  t?: number;
  p?: number;
  lc?: number;
  rgb?: {
    r: number;
    g: number;
    b: number;
  };
};

type BleStatus = {
  targetName: string;
  connected: boolean;
  status: "scanning" | "connected" | "manual-disconnected" | "mock" | "error";
  deviceName?: string;
  address?: string;
  characteristicUuid?: string;
};

type ClipFeatures = {
  upperSignal: number;
  thighSignal: number;
  alignmentDelta: number;
  stability: number;
  vibrationCount: number;
  ledState: LedState;
};

type SensorSample = {
  timestampMs: number;
  source: ConnectionSource;
  backAngle: number;
  screenDistance: number;
  postureClass: string;
  upperGyro: Vector3;
  thighGyro: Vector3;
  upperAccel?: Accel3;
  upperMag?: Mag3;
  orientationQuat?: OrientationQuat;
  orientationRpy?: OrientationRpy;
  nanoPacket?: NanoPacket;
  vibration: number;
  temperature: number;
  distance: number;
  motion: number;
  features: ClipFeatures;
  ble: BleStatus;
  raw: Record<string, unknown>;
};

type RecordingRow = SensorSample & {
  sessionId: string;
  testName: string;
  label: MovementLabel;
  objectWeightKg: string;
  participantId: string;
  notes: string;
  elapsedMs: number;
};

type TestMeta = {
  sessionId: string;
  testName: string;
  label: MovementLabel;
  objectWeightKg: string;
  participantId: string;
  notes: string;
};

type ClipMemory = {
  theme?: ThemePref;
};

declare global {
  interface Window {
    __SATI_MEMORY_STORE__?: ClipMemory;
  }
}

const labelOptions: { value: MovementLabel; label: string; hint: string }[] = [
  { value: "stable_lift", label: "Stable lift", hint: "Upper and thigh move together" },
  { value: "bend_forward", label: "Bend forward", hint: "Upper body rotation rises first" },
  { value: "twist_carry", label: "Twist carry", hint: "Side rotation while carrying" },
  { value: "rough_movement", label: "Rough movement", hint: "Vibration or stability spike" },
  { value: "walk_carry", label: "Walk carry", hint: "Moving with object in hand" },
  { value: "idle", label: "Idle baseline", hint: "No active lifting task" },
  { value: "other", label: "Other", hint: "Use notes for context" },
];

function assetPath(file: string) {
  return `${ASSET_DIR}/${file}`;
}

const sensorStack = [
  {
    key: "upper",
    name: "Sati-Nano (Upper)",
    detail: "Gyroscope + accelerometer",
    channel: "BLE RSSI -58 dBm",
    image: assetPath("sensor-nano.webp"),
    icon: Bluetooth,
  },
  {
    key: "thigh",
    name: "Modulino Movement",
    detail: "Thigh motion reference",
    channel: "I2C · Address 0x6A",
    image: assetPath("sensor-movement.webp"),
    icon: Activity,
  },
  {
    key: "vibration",
    name: "Vibration Module",
    detail: "Event counter",
    channel: "Digital · Pin D2",
    image: assetPath("sensor-vibration.webp"),
    icon: Vibrate,
  },
  {
    key: "thermo",
    name: "Modulino Thermo",
    detail: "Ambient temperature",
    channel: "I2C · Address 0x48",
    image: assetPath("sensor-thermo.webp"),
    icon: Thermometer,
  },
  {
    key: "distance",
    name: "Modulino Distance",
    detail: "Distance in cm",
    channel: "I2C · Address 0x60",
    image: assetPath("sensor-distance.webp"),
    icon: Ruler,
  },
];

const csvHeaders = [
  "sessionId",
  "testName",
  "label",
  "objectWeightKg",
  "participantId",
  "notes",
  "timestampMs",
  "elapsedMs",
  "source",
  "bleStatus",
  "upper_gx",
  "upper_gy",
  "upper_gz",
  "thigh_gx",
  "thigh_gy",
  "thigh_gz",
  "vibration",
  "temperature",
  "distance",
  "backAngle",
  "screenDistance",
  "postureClass",
  "upperSignal",
  "thighSignal",
  "alignmentDelta",
  "stability",
  "vibrationCount",
  "ledState",
  "nano_n",
  "nano_t",
  "accel_ax",
  "accel_ay",
  "accel_az",
  "gyro_gx",
  "gyro_gy",
  "gyro_gz",
  "mag_mx",
  "mag_my",
  "mag_mz",
  "quat_w",
  "quat_x",
  "quat_y",
  "quat_z",
  "roll",
  "pitch",
  "yaw",
  "nano_p",
  "nano_lc",
  "rgb_r",
  "rgb_g",
  "rgb_b",
];

const envSensorAutoConnect = process.env.NEXT_PUBLIC_SATI_WS_AUTOCONNECT === "true";

function readMemory(): ClipMemory | undefined {
  if (typeof window === "undefined") return undefined;
  if (window.__SATI_MEMORY_STORE__) return window.__SATI_MEMORY_STORE__;
  try {
    const parsed = JSON.parse(window.name || "{}");
    const memory = parsed?.[MEMORY_KEY] as ClipMemory | undefined;
    window.__SATI_MEMORY_STORE__ = memory;
    return memory;
  } catch {
    return undefined;
  }
}

function writeMemory(memory: ClipMemory) {
  if (typeof window === "undefined") return;
  window.__SATI_MEMORY_STORE__ = memory;
  try {
    const parsed = JSON.parse(window.name || "{}");
    parsed[MEMORY_KEY] = memory;
    window.name = JSON.stringify(parsed);
  } catch {
    window.name = JSON.stringify({ [MEMORY_KEY]: memory });
  }
}

function shouldAutoConnectSensor() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("live") === "1" || envSensorAutoConnect;
}

function nowMs() {
  return Date.now();
}

function makeSessionId() {
  return `clip-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function numberFrom(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function objectFrom(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function numericArray(value: unknown, length: number): number[] | undefined {
  if (!Array.isArray(value) || value.length < length) return undefined;
  const values = value.slice(0, length).map((item) => Number(item));
  return values.every(Number.isFinite) ? values : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function vectorFrom(value: unknown, fallback: Vector3 = { gx: 0, gy: 0, gz: 0 }): Vector3 {
  const values = numericArray(value, 3);
  if (values) return { gx: values[0], gy: values[1], gz: values[2] };
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  return {
    gx: numberFrom(row.gx, fallback.gx),
    gy: numberFrom(row.gy, fallback.gy),
    gz: numberFrom(row.gz, fallback.gz),
  };
}

function accelFrom(value: unknown): Accel3 | undefined {
  const values = numericArray(value, 3);
  if (values) return { ax: values[0], ay: values[1], az: values[2] };
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (!("ax" in row) && !("ay" in row) && !("az" in row)) return undefined;
  return {
    ax: numberFrom(row.ax),
    ay: numberFrom(row.ay),
    az: numberFrom(row.az, 1),
  };
}

function magFrom(value: unknown): Mag3 | undefined {
  const values = numericArray(value, 3);
  if (values) return { mx: values[0], my: values[1], mz: values[2] };
  const row = objectFrom(value);
  if (!row || (!("mx" in row) && !("my" in row) && !("mz" in row))) return undefined;
  return {
    mx: numberFrom(row.mx),
    my: numberFrom(row.my),
    mz: numberFrom(row.mz),
  };
}

function quatFrom(value: unknown): OrientationQuat | undefined {
  const values = numericArray(value, 4);
  if (values) return { qw: values[0], qx: values[1], qy: values[2], qz: values[3] };
  const row = objectFrom(value);
  if (!row || (!("qw" in row) && !("qx" in row) && !("qy" in row) && !("qz" in row))) return undefined;
  return {
    qw: numberFrom(row.qw, 1),
    qx: numberFrom(row.qx),
    qy: numberFrom(row.qy),
    qz: numberFrom(row.qz),
  };
}

function rpyFrom(value: unknown): OrientationRpy | undefined {
  const values = numericArray(value, 3);
  if (values) return { roll: values[0], pitch: values[1], yaw: values[2] };
  const row = objectFrom(value);
  if (!row || (!("roll" in row) && !("pitch" in row) && !("yaw" in row))) return undefined;
  return {
    roll: numberFrom(row.roll),
    pitch: numberFrom(row.pitch),
    yaw: numberFrom(row.yaw),
  };
}

function looksLikeNanoRaw(row: Record<string, unknown>) {
  return "a" in row || "gy" in row || "m" in row || "q" in row || "rpy" in row || "rgb" in row || "lc" in row;
}

function nanoPacketFrom(row: Record<string, unknown> | undefined): NanoPacket | undefined {
  if (!row) return undefined;
  const rgbValues = numericArray(row.rgb, 3);
  return {
    n: "n" in row ? numberFrom(row.n) : undefined,
    t: "t" in row ? numberFrom(row.t) : undefined,
    p: "p" in row ? numberFrom(row.p) : undefined,
    lc: "lc" in row ? numberFrom(row.lc) : undefined,
    rgb: rgbValues ? { r: rgbValues[0], g: rgbValues[1], b: rgbValues[2] } : undefined,
  };
}

function magnitude(vector: Vector3) {
  return Math.sqrt(vector.gx * vector.gx + vector.gy * vector.gy + vector.gz * vector.gz);
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function inferLedState(alignmentDelta: number, stability: number): LedState {
  if (alignmentDelta < 3 && stability < 8) return "green";
  if (alignmentDelta < 7 && stability < 16) return "yellow";
  return "red";
}

function normalizeLed(value: unknown, alignmentDelta: number, stability: number): LedState {
  if (value === "green" || value === "yellow" || value === "red") return value;
  return inferLedState(alignmentDelta, stability);
}

function normalizeBle(value: unknown, source: ConnectionSource): BleStatus {
  const fallback: BleStatus = {
    targetName: "Sati-Nano",
    connected: source === "ws",
    status: source === "ws" ? "connected" : "mock",
  };
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  const status = String(row.status || fallback.status);
  return {
    targetName: String(row.targetName || "Sati-Nano"),
    connected: Boolean(row.connected),
    status: status === "scanning" || status === "connected" || status === "manual-disconnected" || status === "error" || status === "mock" ? status : fallback.status,
    deviceName: typeof row.deviceName === "string" ? row.deviceName : undefined,
    address: typeof row.address === "string" ? row.address : undefined,
    characteristicUuid: typeof row.characteristicUuid === "string" ? row.characteristicUuid : undefined,
  };
}

function normalizePayload(data: Record<string, unknown>, source: ConnectionSource): SensorSample {
  const directNanoRaw = objectFrom(data.nanoRaw) ?? objectFrom(data.imu);
  const nanoRaw = directNanoRaw ?? (looksLikeNanoRaw(data) ? data : undefined);
  const orientationRpy = rpyFrom(data.orientationRpy ?? data.orientation_rpy ?? data.rpy ?? nanoRaw?.rpy);
  const upperGyro = vectorFrom(data.upperGyro ?? data.upper_gyro ?? nanoRaw?.gy ?? nanoRaw);
  const thighGyro = vectorFrom(data.thighGyro ?? data.thigh_gyro ?? data.lower_gyro);
  const upperAccel = accelFrom(data.upperAccel ?? data.upper_accel ?? nanoRaw?.a ?? nanoRaw);
  const upperMag = magFrom(data.upperMag ?? data.upper_mag ?? data.mag ?? nanoRaw?.m);
  const orientationQuat = quatFrom(data.orientationQuat ?? data.orientation_quat ?? data.q ?? nanoRaw?.q);
  const nanoPacket = nanoPacketFrom(nanoRaw);
  const vibration = numberFrom(data.vibration ?? data.vibration_value);
  const temperature = numberFrom(data.temperature ?? data.temp, 30);
  const distance = numberFrom(data.distance, numberFrom(data.screenDistance, 60));
  const rawBackAngle = orientationRpy ? Math.max(Math.abs(orientationRpy.roll), Math.abs(orientationRpy.pitch)) : 15;
  const backAngle = numberFrom(data.backAngle, rawBackAngle);
  const screenDistance = numberFrom(data.screenDistance, distance);
  const motion = numberFrom(data.motion, magnitude(upperGyro));
  const featuresInput = (data.features && typeof data.features === "object" ? data.features : {}) as Record<string, unknown>;
  const upperSignal = numberFrom(featuresInput.upperSignal ?? featuresInput.upper_signal ?? data.upper_signal, motion || magnitude(upperGyro));
  const thighSignal = numberFrom(featuresInput.thighSignal ?? featuresInput.thigh_signal ?? data.thigh_signal, magnitude(thighGyro));
  const vibrationCount = numberFrom(featuresInput.vibrationCount ?? featuresInput.vibration_count ?? data.vibration_count, vibration ? 1 : 0);
  const alignmentDelta = numberFrom(featuresInput.alignmentDelta ?? featuresInput.alignment_delta ?? data.alignment_delta, Math.abs(upperSignal - thighSignal));
  const stability = numberFrom(featuresInput.stability, upperSignal + thighSignal + vibrationCount);
  const ledState = normalizeLed(featuresInput.ledState ?? featuresInput.led_state ?? data.led_state, alignmentDelta, stability);

  return {
    timestampMs: numberFrom(data.timestampMs, nowMs()),
    source,
    backAngle,
    screenDistance,
    postureClass: String(data.postureClass || (ledState === "red" ? "hunched" : "normal")),
    upperGyro,
    thighGyro,
    upperAccel,
    upperMag,
    orientationQuat,
    orientationRpy,
    nanoPacket,
    vibration,
    temperature,
    distance,
    motion,
    features: {
      upperSignal: round(upperSignal),
      thighSignal: round(thighSignal),
      alignmentDelta: round(alignmentDelta),
      stability: round(stability),
      vibrationCount: Math.round(vibrationCount),
      ledState,
    },
    ble: normalizeBle(data.ble, source),
    raw: data,
  };
}

function createMockPayload(index: number): SensorSample {
  const t = nowMs() / 1000;
  const liftPhase = Math.sin(t * 0.8);
  const twistPhase = Math.sin(t * 1.4 + 0.7);
  const roughPulse = index % 29 === 0 ? 1 : 0;
  const upperGyro = {
    gx: round(2.3 + liftPhase * 2.8 + roughPulse * 3.2),
    gy: round(1.1 + twistPhase * 2.1),
    gz: round(0.7 + Math.cos(t * 0.9) * 1.4),
  };
  const thighGyro = {
    gx: round(1.5 + Math.sin(t * 0.85 + 0.4) * 1.2),
    gy: round(0.7 + Math.cos(t * 0.75) * 0.9),
    gz: round(0.5 + Math.sin(t * 1.1) * 0.7),
  };
  const upperSignal = magnitude(upperGyro);
  const thighSignal = magnitude(thighGyro);
  const vibration = roughPulse || (Math.random() > 0.94 ? 1 : 0);
  const vibrationCount = vibration ? 2 : 0;
  const alignmentDelta = Math.abs(upperSignal - thighSignal);
  const stability = upperSignal + thighSignal + vibrationCount;
  const ledState = inferLedState(alignmentDelta, stability);
  return normalizePayload(
    {
      backAngle: round(12 + Math.abs(liftPhase) * 18),
      screenDistance: round(58 + Math.sin(t * 0.35) * 4),
      postureClass: ledState === "red" ? "hunched" : ledState === "yellow" ? "movement" : "normal",
      upperGyro,
      thighGyro,
      vibration,
      temperature: round(30 + Math.sin(t * 0.15) * 2.2, 1),
      distance: round(58 + Math.sin(t * 0.35) * 4, 1),
      motion: round(upperSignal),
      features: {
        upperSignal,
        thighSignal,
        alignmentDelta,
        stability,
        vibrationCount,
        ledState,
      },
      ble: {
        targetName: "Sati-Nano",
        connected: false,
        status: "mock",
        deviceName: "mock sensor stream",
      },
      timestampMs: nowMs(),
    },
    "mock",
  );
}

function createInitialPayload(): SensorSample {
  return normalizePayload(
    {
      backAngle: 14,
      screenDistance: 60,
      postureClass: "normal",
      upperGyro: { gx: 0.8, gy: 0.2, gz: 0.4 },
      thighGyro: { gx: 0.4, gy: 0.1, gz: 0.2 },
      vibration: 0,
      temperature: 30,
      distance: 60,
      motion: 0.92,
      features: {
        upperSignal: 0.92,
        thighSignal: 0.46,
        alignmentDelta: 0.46,
        stability: 1.38,
        vibrationCount: 0,
        ledState: "green",
      },
      ble: {
        targetName: "Sati-Nano",
        connected: false,
        status: "mock",
        deviceName: "waiting for sensor stream",
      },
      timestampMs: 0,
    },
    "mock",
  );
}

function createRecordingRow(sample: SensorSample, meta: TestMeta, startedAt: number): RecordingRow {
  return {
    ...sample,
    sessionId: meta.sessionId,
    testName: meta.testName,
    label: meta.label,
    objectWeightKg: meta.objectWeightKg,
    participantId: meta.participantId,
    notes: meta.notes,
    elapsedMs: Math.max(0, sample.timestampMs - startedAt),
  };
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(rows: RecordingRow[]) {
  const body = rows.map((row) => {
    const values = [
      row.sessionId,
      row.testName,
      row.label,
      row.objectWeightKg,
      row.participantId,
      row.notes,
      row.timestampMs,
      row.elapsedMs,
      row.source,
      row.ble.status,
      row.upperGyro.gx,
      row.upperGyro.gy,
      row.upperGyro.gz,
      row.thighGyro.gx,
      row.thighGyro.gy,
      row.thighGyro.gz,
      row.vibration,
      row.temperature,
      row.distance,
      row.backAngle,
      row.screenDistance,
      row.postureClass,
      row.features.upperSignal,
      row.features.thighSignal,
      row.features.alignmentDelta,
      row.features.stability,
      row.features.vibrationCount,
      row.features.ledState,
      row.nanoPacket?.n,
      row.nanoPacket?.t,
      row.upperAccel?.ax,
      row.upperAccel?.ay,
      row.upperAccel?.az,
      row.upperGyro.gx,
      row.upperGyro.gy,
      row.upperGyro.gz,
      row.upperMag?.mx,
      row.upperMag?.my,
      row.upperMag?.mz,
      row.orientationQuat?.qw,
      row.orientationQuat?.qx,
      row.orientationQuat?.qy,
      row.orientationQuat?.qz,
      row.orientationRpy?.roll,
      row.orientationRpy?.pitch,
      row.orientationRpy?.yaw,
      row.nanoPacket?.p,
      row.nanoPacket?.lc,
      row.nanoPacket?.rgb?.r,
      row.nanoPacket?.rgb?.g,
      row.nanoPacket?.rgb?.b,
    ];
    return values.map(escapeCsv).join(",");
  });
  return [csvHeaders.join(","), ...body].join("\n");
}

function downloadCsv(rows: RecordingRow[], meta: TestMeta) {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = (meta.testName || meta.sessionId).replace(/[^a-z0-9ก-๙_-]+/gi, "-").replace(/-+/g, "-");
  link.href = url;
  link.download = `${safeName}-${meta.sessionId}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fmt(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function fmtMaybe(value: number | undefined, digits = 1) {
  return typeof value === "number" ? fmt(value, digits) : "-";
}

function formatElapsed(ms: number) {
  const sec = Math.floor(ms / 1000);
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ledCopy(led: LedState) {
  if (led === "green") return "Stable";
  if (led === "yellow") return "Watch";
  return "Reset";
}

function bleStatusCopy(status: BleStatus["status"]) {
  if (status === "connected") return "BLE connected";
  if (status === "manual-disconnected") return "BLE paused";
  if (status === "error") return "BLE error";
  if (status === "mock") return "BLE mock";
  return "BLE scanning";
}

export function SatiApp() {
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState("sensors");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePref, setThemePref] = useState<ThemePref>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [sensor, setSensor] = useState<{ source: ConnectionSource; status: string }>({
    source: "mock",
    status: "connecting",
  });
  const [currentSample, setCurrentSample] = useState<SensorSample>(() => createInitialPayload());
  const [history, setHistory] = useState<SensorSample[]>(() => [createInitialPayload()]);
  const [recordedRows, setRecordedRows] = useState<RecordingRow[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [meta, setMeta] = useState<TestMeta>(() => ({
    sessionId: "clip-session",
    testName: "Lifting Test Session",
    label: "stable_lift",
    objectWeightKg: "",
    participantId: "P-001",
    notes: "",
  }));

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const lastMessageRef = useRef(0);
  const mockIndexRef = useRef(0);
  const isRecordingRef = useRef(false);
  const startedAtRef = useRef(0);
  const metaRef = useRef(meta);

  const live = sensor.source === "ws";
  const latestJson = useMemo(() => JSON.stringify(currentSample.raw, null, 2), [currentSample.raw]);
  const alignmentScore = Math.max(0, Math.min(100, Math.round(100 - currentSample.features.alignmentDelta * 10)));
  const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - currentSample.features.stability * 4)));

  const sessionSummary = useMemo(() => {
    if (!recordedRows.length) {
      return {
        avgAlignment: 0,
        avgStability: 0,
        roughEvents: 0,
        redFrames: 0,
      };
    }
    const avgAlignment =
      recordedRows.reduce((sum, row) => sum + row.features.alignmentDelta, 0) / recordedRows.length;
    const avgStability = recordedRows.reduce((sum, row) => sum + row.features.stability, 0) / recordedRows.length;
    return {
      avgAlignment,
      avgStability,
      roughEvents: recordedRows.filter((row) => row.vibration > 0).length,
      redFrames: recordedRows.filter((row) => row.features.ledState === "red").length,
    };
  }, [recordedRows]);

  const commitSample = useCallback((data: Record<string, unknown>, source: ConnectionSource) => {
    const sample = normalizePayload(data, source);
    setCurrentSample(sample);
    setHistory((prev) => [...prev.slice(-(HISTORY_LIMIT - 1)), sample]);
    if (isRecordingRef.current && startedAtRef.current) {
      setRecordedRows((prev) => [...prev, createRecordingRow(sample, metaRef.current, startedAtRef.current)]);
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
    reconnectRef.current = window.setTimeout(() => connectRef.current(), 3000);
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
          const data = JSON.parse(event.data) as Record<string, unknown>;
          commitSample(data, "ws");
          lastMessageRef.current = nowMs();
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
  }, [commitSample, scheduleReconnect]);

  useEffect(() => {
    const memory = readMemory();
    setThemePref(memory?.theme ?? "system");
    setMeta((prev) => (prev.sessionId === "clip-session" ? { ...prev, sessionId: makeSessionId() } : prev));
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
    if (!hydrated) return;
    writeMemory({ theme: themePref });
  }, [hydrated, themePref]);

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);

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
      if (sensor.source === "ws") {
        if (lastMessageRef.current && nowMs() - lastMessageRef.current > 5000) {
          wsRef.current?.close();
          setSensor({ source: "mock", status: "mock" });
          scheduleReconnect();
        }
      } else {
        mockIndexRef.current += 1;
        const sample = createMockPayload(mockIndexRef.current);
        commitSample(sample.raw, "mock");
      }
      if (isRecordingRef.current && startedAtRef.current) {
        setElapsedMs(nowMs() - startedAtRef.current);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [commitSample, hydrated, scheduleReconnect, sensor.source]);

  const updateMeta = <K extends keyof TestMeta>(key: K, value: TestMeta[K]) => {
    setMeta((prev) => ({ ...prev, [key]: value }));
  };

  const startTest = () => {
    const nextSession = meta.sessionId || makeSessionId();
    const start = nowMs();
    setMeta((prev) => ({ ...prev, sessionId: nextSession }));
    setRecordedRows([]);
    setStartedAt(start);
    setElapsedMs(0);
    startedAtRef.current = start;
    isRecordingRef.current = true;
    setIsRecording(true);
    toast.success("Test recording started");
  };

  const stopTest = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setElapsedMs((prev) => (startedAt ? Math.max(prev, nowMs() - startedAt) : prev));
    toast.success("Test recording stopped");
  };

  const resetSession = () => {
    const next = makeSessionId();
    setMeta((prev) => ({ ...prev, sessionId: next, testName: "Lifting Test Session", notes: "" }));
    setRecordedRows([]);
    setElapsedMs(0);
    setStartedAt(0);
    startedAtRef.current = 0;
    isRecordingRef.current = false;
    setIsRecording(false);
    toast.success("Session reset");
  };

  const exportCsv = () => {
    if (!recordedRows.length) {
      toast.error("No recorded rows to export yet");
      return;
    }
    downloadCsv(recordedRows, meta);
    toast.success(`Exported ${recordedRows.length} rows`);
  };

  const cycleTheme = () => {
    setThemePref((current) => (current === "dark" ? "light" : current === "light" ? "system" : "dark"));
  };

  const sendBleCommand = (command: "ble.connect" | "ble.disconnect") => {
    const ws = wsRef.current;
    if (!live || !ws || ws.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket bridge is not live yet");
      return;
    }

    ws.send(JSON.stringify({ type: command }));
    setCurrentSample((prev) => ({
      ...prev,
      ble: {
        ...prev.ble,
        connected: command === "ble.connect" ? prev.ble.connected : false,
        status: command === "ble.connect" ? "scanning" : "manual-disconnected",
      },
    }));
    toast.success(command === "ble.connect" ? "Bluetooth scan requested" : "Bluetooth disconnect requested");
  };

  const bleStatus = currentSample.ble.status;
  const bleConnected = currentSample.ble.connected && bleStatus === "connected";
  const bleScanning = live && bleStatus === "scanning";
  const bleControlDisabled = !live || bleScanning;
  const bleControlLabel = !live
    ? "Bridge offline"
    : bleScanning
      ? "Scanning..."
      : bleConnected
        ? "Disconnect Bluetooth"
        : "Connect Bluetooth";
  const bleControlTitle = !live
    ? "Open this app with ?live=1 and make sure the Python bridge is running."
    : bleScanning
      ? "Sati Clip is scanning for Sati-Nano."
      : bleConnected
        ? "Disconnect UNO Q from Sati-Nano BLE."
        : "Ask UNO Q to scan and connect to Sati-Nano.";

  return (
    <main className="clip-root" data-led={currentSample.features.ledState} aria-label="Sati Clip sensor lab">
      <div className="clip-shell">
        <header className="clip-top">
          <div className="clip-brand">
            <div className="clip-mark" aria-hidden="true">
              <Activity />
            </div>
            <div>
              <h1>Sati Clip</h1>
              <div className="clip-sub">Lifting movement awareness lab</div>
            </div>
          </div>
          <div className="clip-toolbar">
            <button
              className="theme-toggle"
              onClick={cycleTheme}
              aria-label={`Theme: ${themePref}. Click to cycle.`}
              data-testid="theme-toggle"
              title={`Theme: ${themePref} (resolved: ${resolvedTheme})`}
              type="button"
            >
              {resolvedTheme === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </button>
            <Badge className={live ? "clip-live-badge live" : "clip-live-badge"} variant="secondary">
              {live ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
              {live ? "WebSocket live" : "Mock stream"}
            </Badge>
            <Badge className={bleConnected ? "clip-live-badge live" : "clip-live-badge"} variant="secondary">
              <Bluetooth aria-hidden="true" />
              {bleStatusCopy(bleStatus)}
            </Badge>
            <Button
              className="ble-control-button"
              variant="outline"
              onClick={() => sendBleCommand(bleConnected ? "ble.disconnect" : "ble.connect")}
              disabled={bleControlDisabled}
              title={bleControlTitle}
              aria-label={bleControlLabel}
            >
              <Bluetooth aria-hidden="true" />
              {bleControlLabel}
            </Button>
            <Badge className="clip-led-badge" variant="secondary">
              <span className="clip-led-dot" aria-hidden="true" />
              LED {ledCopy(currentSample.features.ledState)}
            </Badge>
            <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button className="cockpit-settings-button" variant="outline" aria-label="Open Sati Clip settings">
                  <Settings aria-hidden="true" />
                  Settings
                </Button>
              </DialogTrigger>
              <DialogContent className="clip-settings-dialog">
                <DialogHeader>
                  <DialogTitle>Session Settings</DialogTitle>
                  <DialogDescription>
                    Participant notes stay in browser memory until you export CSV.
                  </DialogDescription>
                </DialogHeader>
                <div className="settings-grid">
                  <label className="clip-field">
                    <span>Participant ID</span>
                    <input
                      value={meta.participantId}
                      onChange={(event) => updateMeta("participantId", event.target.value)}
                      aria-label="Anonymous participant id"
                    />
                  </label>
                  <label className="clip-field">
                    <span>Session ID</span>
                    <input
                      value={meta.sessionId}
                      onChange={(event) => updateMeta("sessionId", event.target.value)}
                      aria-label="Session id"
                    />
                  </label>
                  <label className="clip-field span-2">
                    <span>Notes</span>
                    <textarea
                      value={meta.notes}
                      onChange={(event) => updateMeta("notes", event.target.value)}
                      placeholder="Box height, task setup, left/right carry, sensor placement..."
                      aria-label="Session notes"
                    />
                  </label>
                  <div className="settings-hint span-2">
                    <span>Live mode uses <code>?live=1</code>; otherwise Sati Clip keeps mock fallback alive.</span>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <Tabs value={view} onValueChange={setView} className="clip-tabs">
          <TabsList className="view-tabs cockpit-nav" aria-label="Sati Clip views">
            <TabsTrigger value="sensors">
              <SlidersHorizontal aria-hidden="true" />
              Sensors
            </TabsTrigger>
            <TabsTrigger value="dataset">
              <Database aria-hidden="true" />
              Dataset
            </TabsTrigger>
            <TabsTrigger value="summary">
              <BarChart3 aria-hidden="true" />
              Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sensors" className="clip-panel cockpit-panel">
            <section className="cockpit-grid">
              <div className="session-command" aria-label="Lifting test session controls">
                <div className="session-title">
                  <h2>Lifting Test Session</h2>
                  <span>{isRecording ? "กำลังบันทึกข้อมูล" : "พร้อมเก็บข้อมูล .csv"}</span>
                </div>
                <div className="session-fields">
                  <label className="session-field wide">
                    <span>Test Name</span>
                    <input
                      value={meta.testName}
                      onChange={(event) => updateMeta("testName", event.target.value)}
                      aria-label="Test name"
                    />
                  </label>
                  <label className="session-field">
                    <span>Movement Label</span>
                    <select
                      value={meta.label}
                      onChange={(event) => updateMeta("label", event.target.value as MovementLabel)}
                      aria-label="Movement label"
                    >
                      {labelOptions.map((label) => (
                        <option key={label.value} value={label.value}>
                          {label.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="session-field weight">
                    <span>Weight</span>
                    <input
                      value={meta.objectWeightKg}
                      onChange={(event) => updateMeta("objectWeightKg", event.target.value)}
                      inputMode="decimal"
                      placeholder="kg"
                      aria-label="Object weight in kilograms"
                    />
                  </label>
                </div>
                <div className="session-actions">
                  <Button className="start-button" onClick={startTest} disabled={isRecording}>
                    <Play data-icon="inline-start" aria-hidden="true" />
                    Start Test
                  </Button>
                  <Button className="stop-button" onClick={stopTest} disabled={!isRecording} variant="outline">
                    <Square data-icon="inline-start" aria-hidden="true" />
                    Stop Test
                  </Button>
                  <Button className="export-button" onClick={exportCsv} variant="warm">
                    <Download data-icon="inline-start" aria-hidden="true" />
                    Export CSV
                  </Button>
                  <Button className="reset-button" onClick={resetSession} variant="ghost" aria-label="Reset test session">
                    <RotateCcw data-icon="inline-start" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <SensorConnectionPanel sample={currentSample} live={live} />
              <AnimeMotionStage sample={currentSample} />
              <FeatureHud sample={currentSample} alignmentScore={alignmentScore} stabilityScore={stabilityScore} />
              <InstrumentCharts
                history={history}
                recordedRows={recordedRows}
                isRecording={isRecording}
                elapsedMs={elapsedMs}
                label={meta.label}
              />
            </section>

            <section className="clip-lab-grid legacy-sensor-grid" aria-hidden="true">
              <Card className="clip-card test-card">
                <CardHeader className="clip-card-head">
                  <CardTitle>Test Session</CardTitle>
                  <CardDescription>Label each run before collecting AI training data.</CardDescription>
                </CardHeader>
                <CardContent className="clip-card-content">
                  <div className="clip-field-grid">
                    <label className="clip-field span-2">
                      <span>Test name</span>
                      <input
                        value={meta.testName}
                        onChange={(event) => updateMeta("testName", event.target.value)}
                        aria-label="Test name"
                      />
                    </label>
                    <label className="clip-field">
                      <span>Movement label</span>
                      <select
                        value={meta.label}
                        onChange={(event) => updateMeta("label", event.target.value as MovementLabel)}
                        aria-label="Movement label"
                      >
                        {labelOptions.map((label) => (
                          <option key={label.value} value={label.value}>
                            {label.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="clip-field">
                      <span>Object weight (kg)</span>
                      <input
                        value={meta.objectWeightKg}
                        onChange={(event) => updateMeta("objectWeightKg", event.target.value)}
                        inputMode="decimal"
                        placeholder="optional"
                        aria-label="Object weight in kilograms"
                      />
                    </label>
                    <label className="clip-field">
                      <span>Participant ID</span>
                      <input
                        value={meta.participantId}
                        onChange={(event) => updateMeta("participantId", event.target.value)}
                        aria-label="Anonymous participant id"
                      />
                    </label>
                    <label className="clip-field">
                      <span>Session ID</span>
                      <input
                        value={meta.sessionId}
                        onChange={(event) => updateMeta("sessionId", event.target.value)}
                        aria-label="Session id"
                      />
                    </label>
                    <label className="clip-field span-2">
                      <span>Notes</span>
                      <textarea
                        value={meta.notes}
                        onChange={(event) => updateMeta("notes", event.target.value)}
                        placeholder="Box height, task setup, left/right carry, sensor placement..."
                        aria-label="Session notes"
                      />
                    </label>
                  </div>

                  <div className="clip-record-bar" aria-live="polite">
                    <div>
                      <strong>{isRecording ? "Recording" : recordedRows.length ? "Paused" : "Ready"}</strong>
                      <span>{recordedRows.length} rows · {formatElapsed(elapsedMs)}</span>
                    </div>
                    <div className="clip-record-actions">
                      <Button onClick={startTest} disabled={isRecording}>
                        <Play data-icon="inline-start" aria-hidden="true" />
                        Start Test
                      </Button>
                      <Button onClick={stopTest} disabled={!isRecording} variant="outline">
                        <Square data-icon="inline-start" aria-hidden="true" />
                        Stop
                      </Button>
                      <Button onClick={exportCsv} variant="warm">
                        <Download data-icon="inline-start" aria-hidden="true" />
                        Export CSV
                      </Button>
                      <Button onClick={resetSession} variant="ghost" aria-label="Reset test session">
                        <RotateCcw data-icon="inline-start" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="clip-card sensor-stack-card">
                <CardHeader className="clip-card-head">
                  <CardTitle>Sensor Stack</CardTitle>
                  <CardDescription>UNO Q receives Sati-Nano and Modulino signals.</CardDescription>
                </CardHeader>
                <CardContent className="clip-card-content sensor-stack">
                  {sensorStack.map((item) => (
                    <SensorStackRow key={item.key} item={item} sample={currentSample} live={live} />
                  ))}
                </CardContent>
              </Card>

              <Card className="clip-card motion-card">
                <CardHeader className="clip-card-head">
                  <CardTitle>3D Alignment View</CardTitle>
                  <CardDescription>Upper vs thigh motion, driven by live sensor values.</CardDescription>
                </CardHeader>
                <CardContent className="clip-card-content">
                  <MotionObject3D sample={currentSample} />
                  <div className="motion-caption">
                    <div>
                      <span>Alignment Delta</span>
                      <strong>{fmt(currentSample.features.alignmentDelta)}</strong>
                    </div>
                    <div>
                      <span>Stability</span>
                      <strong>{fmt(currentSample.features.stability)}</strong>
                    </div>
                    <div>
                      <span>Motion</span>
                      <strong>{fmt(currentSample.motion)}</strong>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="clip-card feature-card">
                <CardHeader className="clip-card-head">
                  <CardTitle>Live Features</CardTitle>
                  <CardDescription>Derived features used for model-ready CSV rows.</CardDescription>
                </CardHeader>
                <CardContent className="clip-card-content feature-grid">
                  <FeatureTile icon={Waves} label="Upper Signal" value={fmt(currentSample.features.upperSignal)} />
                  <FeatureTile icon={Activity} label="Thigh Signal" value={fmt(currentSample.features.thighSignal)} />
                  <FeatureTile icon={Gauge} label="Alignment Delta" value={fmt(currentSample.features.alignmentDelta)} tone="state" />
                  <FeatureTile icon={Zap} label="Stability" value={fmt(currentSample.features.stability)} tone="state" />
                  <FeatureTile icon={Vibrate} label="Vibration Count" value={currentSample.features.vibrationCount} />
                  <FeatureTile icon={Thermometer} label="Temperature" value={`${fmt(currentSample.temperature)}°C`} />
                  <FeatureTile icon={Ruler} label="Distance" value={`${fmt(currentSample.distance)} cm`} />
                  <FeatureTile icon={Radio} label="LED State" value={ledCopy(currentSample.features.ledState)} tone="state" />
                  <FeatureTile icon={RotateCcw} label="Roll / Pitch / Yaw" value={`${fmtMaybe(currentSample.orientationRpy?.roll)} / ${fmtMaybe(currentSample.orientationRpy?.pitch)} / ${fmtMaybe(currentSample.orientationRpy?.yaw)}Â°`} />
                  <FeatureTile icon={Signal} label="Magnetometer" value={`${fmtMaybe(currentSample.upperMag?.mx)} / ${fmtMaybe(currentSample.upperMag?.my)} / ${fmtMaybe(currentSample.upperMag?.mz)}`} />
                  <FeatureTile icon={Cpu} label="Light / Proximity" value={`${fmtMaybe(currentSample.nanoPacket?.lc, 0)} / ${fmtMaybe(currentSample.nanoPacket?.p, 0)}`} />
                </CardContent>
              </Card>

              <Card className="clip-card chart-card">
                <CardHeader className="clip-card-head">
                  <CardTitle>Live Sensor Graphs</CardTitle>
                  <CardDescription>Short history for the current run. CSV keeps full rows after Start.</CardDescription>
                </CardHeader>
                <CardContent className="clip-card-content chart-grid">
                  <Sparkline title="Upper Signal" values={history.map((row) => row.features.upperSignal)} />
                  <Sparkline title="Thigh Signal" values={history.map((row) => row.features.thighSignal)} />
                  <Sparkline title="Alignment Delta" values={history.map((row) => row.features.alignmentDelta)} />
                  <Sparkline title="Stability" values={history.map((row) => row.features.stability)} />
                  <Sparkline title="Vibration" values={history.map((row) => row.vibration)} />
                  <Sparkline title="Temperature" values={history.map((row) => row.temperature)} />
                </CardContent>
              </Card>

              <Card className="clip-card json-card">
                <CardHeader className="clip-card-head">
                  <CardTitle>Latest JSON</CardTitle>
                  <CardDescription>Raw bridge payload for debugging and dataset alignment.</CardDescription>
                </CardHeader>
                <CardContent className="clip-card-content">
                  <pre className="json-preview" aria-label="Latest sensor JSON">{latestJson}</pre>
                </CardContent>
              </Card>
            </section>
          </TabsContent>

          <TabsContent value="summary" className="clip-panel summary-panel">
            <ViewHead title="Second-Brain Summary" copy="Observation summary from the current data collection session." chip={`${recordedRows.length} rows`} />
            <div className="summary-grid">
              <SummaryCard title="Alignment Score" value={`${alignmentScore}/100`} detail="Higher means upper and thigh signals are closer." />
              <SummaryCard title="Stability Score" value={`${stabilityScore}/100`} detail="Lower vibration and smoother signals improve this score." />
              <SummaryCard title="Average Delta" value={fmt(sessionSummary.avgAlignment)} detail="Mean alignment delta from recorded rows." />
              <SummaryCard title="Rough Events" value={sessionSummary.roughEvents} detail="Rows where vibration module was active." />
              <Card className="clip-card insight-wide">
                <CardContent className="clip-card-content">
                  <span className="insight-kicker">ฉันสังเกตว่า...</span>
                  <h2>
                    {recordedRows.length
                      ? sessionSummary.redFrames > 0
                        ? "Some frames show possible posture drift or unstable movement."
                        : "This session currently looks mostly stable."
                      : "Start a test to collect movement observations."}
                  </h2>
                  <p>
                    Sati Clip uses sensor observations for awareness and helps the team collect cleaner labeled data for model training.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="dataset" className="clip-panel dataset-panel">
            <ViewHead title="Dataset Export" copy="Review the latest rows before exporting to CSV." chip={`${recordedRows.length} rows`} />
            <Card className="clip-card">
              <CardContent className="clip-card-content dataset-table-wrap">
                <table className="dataset-table">
                  <thead>
                    <tr>
                      <th>elapsed</th>
                      <th>label</th>
                      <th>upper</th>
                      <th>thigh</th>
                      <th>delta</th>
                      <th>stability</th>
                      <th>vibration</th>
                      <th>roll</th>
                      <th>pitch</th>
                      <th>light</th>
                      <th>LED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recordedRows.slice(-18).map((row, index) => (
                      <tr key={`${row.timestampMs}-${index}`}>
                        <td>{formatElapsed(row.elapsedMs)}</td>
                        <td>{row.label}</td>
                        <td>{fmt(row.features.upperSignal)}</td>
                        <td>{fmt(row.features.thighSignal)}</td>
                        <td>{fmt(row.features.alignmentDelta)}</td>
                        <td>{fmt(row.features.stability)}</td>
                        <td>{row.vibration}</td>
                        <td>{fmtMaybe(row.orientationRpy?.roll)}</td>
                        <td>{fmtMaybe(row.orientationRpy?.pitch)}</td>
                        <td>{fmtMaybe(row.nanoPacket?.lc, 0)}</td>
                        <td>{ledCopy(row.features.ledState)}</td>
                      </tr>
                    ))}
                    {!recordedRows.length ? (
                      <tr>
                        <td colSpan={11}>No rows recorded yet. Press Start Test to begin.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="clip-footer">
          <span>Sati Clip is a movement-awareness companion. Sensor observations are for feedback and dataset collection.</span>
          <Button className="footer-export" variant="outline" onClick={exportCsv}>
            <FileText data-icon="inline-start" aria-hidden="true" />
            CSV
          </Button>
        </footer>
      </div>
      <Toaster richColors position="top-center" theme={resolvedTheme} />
    </main>
  );
}

function SensorConnectionPanel({ sample, live }: { sample: SensorSample; live: boolean }) {
  return (
    <aside className="cockpit-card sensor-connections" aria-label="Sensor connections">
      <div className="cockpit-card-head">
        <div>
          <h3>Sensor Connections</h3>
          <span>สถานะการเชื่อมต่อ</span>
        </div>
        <Leaf aria-hidden="true" />
      </div>
      <div className="sensor-connection-list">
        {sensorStack.map((item) => (
          <SensorConnectionCard key={item.key} item={item} sample={sample} live={live} />
        ))}
        <button className="add-sensor-card" type="button" aria-label="Add new sensor placeholder">
          <Cpu aria-hidden="true" />
          <strong>Add New Sensor</strong>
          <span>รองรับ I2C / BLE / UART</span>
        </button>
      </div>
    </aside>
  );
}

function SensorConnectionCard({
  item,
  sample,
  live,
}: {
  item: (typeof sensorStack)[number];
  sample: SensorSample;
  live: boolean;
}) {
  const upperActive = sample.ble.connected || (live && sample.ble.status !== "manual-disconnected");
  const active =
    item.key === "upper"
      ? upperActive
      : item.key === "vibration"
        ? sample.vibration > 0 || live || sample.source === "mock"
        : Number.isFinite(item.key === "thermo" ? sample.temperature : sample.distance) || live;
  const status =
    item.key === "upper"
      ? sample.ble.connected
        ? "Live"
        : sample.ble.status === "manual-disconnected"
          ? "Paused"
          : sample.ble.status === "error"
            ? "Error"
            : live
              ? "Scanning"
              : "Mock"
      : live
        ? "Live"
        : "Sim";

  return (
    <div className={active ? "sensor-connection-card active" : "sensor-connection-card"}>
      <img src={item.image} alt="" loading="lazy" />
      <div>
        <strong>{item.name}</strong>
        <span>{item.detail}</span>
        <small>{item.channel}</small>
      </div>
      <em>{status}</em>
    </div>
  );
}

function AnimeMotionStage({ sample }: { sample: SensorSample }) {
  const roll = sample.orientationRpy?.roll ?? sample.upperGyro.gx;
  const pitch = sample.orientationRpy?.pitch ?? sample.upperGyro.gy;
  const stageStyle = {
    "--upper-roll": `${clamp(roll * 1.4, -22, 22)}deg`,
    "--upper-pitch": `${clamp(pitch * 1.2, -18, 18)}deg`,
    "--thigh-roll": `${clamp(sample.thighGyro.gx * 1.2, -18, 18)}deg`,
    "--stage-alert": sample.features.ledState === "red" ? 1 : sample.features.ledState === "yellow" ? 0.55 : 0,
  } as CSSProperties;

  return (
    <section className="cockpit-card anime-stage" aria-label="Body alignment visual stage" style={stageStyle}>
      <img className="stage-bg" src={assetPath("workshop-lab-bg.webp")} alt="" aria-hidden="true" />
      <div className="stage-shade" aria-hidden="true" />
      <div className="stage-title">
        <div>
          <h3>Body Alignment 3D</h3>
          <span>ท่าทางแบบเรียลไทม์</span>
        </div>
        <Badge className="stage-badge" variant="secondary">
          <Box aria-hidden="true" />
          {sample.ble.targetName}
        </Badge>
      </div>
      <div className="stage-character-wrap" aria-hidden="true">
        <div className="stage-platform" />
        <div className="orbit-ring ring-upper" />
        <div className="orbit-ring ring-thigh" />
        <div className="orbit-ring ring-floor" />
        <div className="axis axis-y">Y</div>
        <div className="axis axis-z">Z</div>
        <img className="stage-character" src={assetPath("lifting-character.png")} alt="" />
      </div>
      <GyroPanel title="Upper (Sati-Nano)" vector={sample.upperGyro} className="upper-panel" />
      <GyroPanel title="Thigh (Movement)" vector={sample.thighGyro} className="thigh-panel" />
      <div className="axis-legend" aria-hidden="true">
        <span><i className="legend-x" /> X (Roll)</span>
        <span><i className="legend-y" /> Y (Pitch)</span>
        <span><i className="legend-z" /> Z (Yaw)</span>
      </div>
    </section>
  );
}

function GyroPanel({ title, vector, className }: { title: string; vector: Vector3; className: string }) {
  return (
    <div className={`gyro-panel ${className}`}>
      <strong>{title}</strong>
      {(["gx", "gy", "gz"] as const).map((axis) => (
        <div key={axis} className="gyro-row">
          <span>{axis}</span>
          <b>{fmt(vector[axis])}</b>
        </div>
      ))}
      <small>°/s</small>
    </div>
  );
}

function FeatureHud({
  sample,
  alignmentScore,
  stabilityScore,
}: {
  sample: SensorSample;
  alignmentScore: number;
  stabilityScore: number;
}) {
  return (
    <aside className="cockpit-card feature-hud" aria-label="Live derived features">
      <div className="cockpit-card-head">
        <div>
          <h3>Live Features</h3>
          <span>ค่าฟีเจอร์แบบเรียลไทม์</span>
        </div>
        <Gauge aria-hidden="true" />
      </div>
      <div className="feature-hud-grid">
        <FeatureStat icon={Gauge} title="Alignment Delta" hint="ความคลาดเคลื่อน" value={`${fmt(sample.features.alignmentDelta)}°`} badge={alignmentScore < 72 ? "Possible drift" : "Good"} />
        <FeatureStat icon={Zap} title="Stability Score" hint="ความนิ่ง" value={`${stabilityScore}/100`} badge={stabilityScore > 70 ? "Good" : "Watch"} />
        <FeatureStat icon={Waves} title="Upper Signal RMS" hint="สัญญาณส่วนบน" value={`${fmt(sample.features.upperSignal)} °/s`} />
        <FeatureStat icon={Activity} title="Thigh Signal RMS" hint="สัญญาณต้นขา" value={`${fmt(sample.features.thighSignal)} °/s`} />
        <FeatureStat icon={Vibrate} title="Vibration Count" hint="จำนวนการสั่นสะเทือน" value={`${sample.features.vibrationCount}`} />
        <FeatureStat icon={Thermometer} title="Temperature" hint="อุณหภูมิ" value={`${fmt(sample.temperature)} °C`} />
        <FeatureStat icon={Ruler} title="Distance" hint="ระยะห่าง" value={`${fmt(sample.distance)} cm`} />
        <FeatureStat icon={Radio} title="LED State" hint="สถานะไฟแสดงผล" value={ledCopy(sample.features.ledState)} badge={ledCopy(sample.features.ledState)} />
      </div>
    </aside>
  );
}

function FeatureStat({
  icon: Icon,
  title,
  hint,
  value,
  badge,
}: {
  icon: typeof Activity;
  title: string;
  hint: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="feature-stat">
      <Icon aria-hidden="true" />
      <span>{title}</span>
      <small>{hint}</small>
      <strong>{value}</strong>
      {badge ? <em>{badge}</em> : null}
    </div>
  );
}

function InstrumentCharts({
  history,
  recordedRows,
  isRecording,
  elapsedMs,
  label,
}: {
  history: SensorSample[];
  recordedRows: RecordingRow[];
  isRecording: boolean;
  elapsedMs: number;
  label: MovementLabel;
}) {
  return (
    <section className="cockpit-card instrument-panel" aria-label="Live sensor graphs">
      <div className="instrument-grid">
        <MultiSparkline
          title="Upper Gyro (°/s)"
          series={[
            { label: "gx", values: history.map((row) => row.upperGyro.gx), color: "var(--chart-x)" },
            { label: "gy", values: history.map((row) => row.upperGyro.gy), color: "var(--chart-y)" },
            { label: "gz", values: history.map((row) => row.upperGyro.gz), color: "var(--chart-z)" },
          ]}
        />
        <MultiSparkline
          title="Thigh Gyro (°/s)"
          series={[
            { label: "gx", values: history.map((row) => row.thighGyro.gx), color: "var(--chart-x)" },
            { label: "gy", values: history.map((row) => row.thighGyro.gy), color: "var(--chart-y)" },
            { label: "gz", values: history.map((row) => row.thighGyro.gz), color: "var(--chart-z)" },
          ]}
        />
        <MultiSparkline
          title="Alignment Delta (°)"
          series={[{ label: "delta", values: history.map((row) => row.features.alignmentDelta), color: "var(--chart-warn)" }]}
        />
        <MultiSparkline
          title="Stability Score"
          series={[{ label: "stability", values: history.map((row) => 100 - row.features.stability * 4), color: "var(--chart-purple)" }]}
        />
        <MultiSparkline
          title="Vibration Events"
          series={[{ label: "events", values: history.map((row) => row.vibration), color: "var(--chart-green)" }]}
        />
      </div>
      <div className="recording-strip" aria-live="polite">
        <strong className={isRecording ? "recording-dot active" : "recording-dot"}>{isRecording ? "RECORDING" : "READY"}</strong>
        <span>Records: {recordedRows.length.toLocaleString()}</span>
        <span>Elapsed: {formatElapsed(elapsedMs)}</span>
        <span>Sampling: ~10 Hz</span>
        <span>Label: {label}</span>
      </div>
    </section>
  );
}

function MultiSparkline({
  title,
  series,
}: {
  title: string;
  series: { label: string; values: number[]; color: string }[];
}) {
  const allValues = series.flatMap((item) => item.values);
  const max = Math.max(1, ...allValues.map((value) => Math.abs(value)));
  const latest = series[0]?.values.at(-1) ?? 0;

  return (
    <div className="instrument-chart">
      <div>
        <strong>{title}</strong>
        <span>{fmt(latest)}</span>
      </div>
      <svg viewBox="0 0 120 54" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="27" x2="120" y2="27" />
        {series.map((item) => (
          <polyline key={item.label} points={multiSparkPoints(item.values, max)} style={{ stroke: item.color }} />
        ))}
      </svg>
      <footer>
        {series.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </footer>
    </div>
  );
}

function multiSparkPoints(values: number[], max: number) {
  const trimmed = values.slice(-48);
  const safeValues = trimmed.length ? trimmed : [0];
  return safeValues
    .map((value, index) => {
      const x = safeValues.length === 1 ? 0 : (index / (safeValues.length - 1)) * 120;
      const y = 27 - (value / max) * 22;
      return `${x.toFixed(2)},${clamp(y, 4, 50).toFixed(2)}`;
    })
    .join(" ");
}

function MotionObject3D({ sample }: { sample: SensorSample }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sampleRef = useRef(sample);

  useEffect(() => {
    sampleRef.current = sample;
  }, [sample]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.7, 6.3);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x75b99f,
      roughness: 0.46,
      metalness: 0.12,
    });
    const thighMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a866,
      roughness: 0.55,
      metalness: 0.08,
    });
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x5fa896,
      transparent: true,
      opacity: 0.36,
    });

    const upper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.85, 0.5), bodyMaterial);
    upper.position.y = 0.6;
    upper.rotation.z = -0.08;
    group.add(upper);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.7, 0.55), thighMaterial);
    lower.position.y = -0.85;
    lower.rotation.z = 0.08;
    group.add(lower);

    const ringX = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.01, 12, 96), ringMaterial);
    ringX.rotation.x = Math.PI / 2;
    group.add(ringX);
    const ringY = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.01, 12, 96), ringMaterial);
    ringY.rotation.y = Math.PI / 2;
    group.add(ringY);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 80),
      new THREE.MeshBasicMaterial({ color: 0x5fa896, transparent: true, opacity: 0.08 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.55;
    scene.add(floor);

    scene.add(new THREE.HemisphereLight(0xfbf8f1, 0x233028, 2.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(2.6, 4.2, 4.6);
    scene.add(key);

    const resize = () => {
      const width = Math.max(260, mount.clientWidth);
      const height = Math.max(260, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let raf = 0;

    const animate = () => {
      const row = sampleRef.current;
      const rpyPitch = row.orientationRpy?.pitch;
      const rpyRoll = row.orientationRpy?.roll;
      const targetX = Math.max(-0.9, Math.min(0.9, typeof rpyPitch === "number" ? rpyPitch * 0.018 : row.upperGyro.gy * 0.055 + row.backAngle * 0.01));
      const targetY = Math.max(-0.85, Math.min(0.85, row.upperGyro.gz * 0.06));
      const targetZ = Math.max(-0.9, Math.min(0.9, typeof rpyRoll === "number" ? -rpyRoll * 0.018 : -row.upperGyro.gx * 0.05));
      group.rotation.x += (targetX - group.rotation.x) * 0.08;
      group.rotation.y += (targetY - group.rotation.y) * 0.08;
      group.rotation.z += (targetZ - group.rotation.z) * 0.08;

      lower.rotation.z += (row.thighGyro.gx * 0.05 - lower.rotation.z) * 0.08;
      const pulse = reducedMotion ? 0 : Math.sin(frame * 0.035) * 0.04;
      group.position.y = pulse;
      const ledColor = row.features.ledState === "red" ? 0xd49186 : row.features.ledState === "yellow" ? 0xd9b173 : 0x7ec4ae;
      bodyMaterial.color.lerp(new THREE.Color(ledColor), 0.04);
      ringMaterial.opacity = row.features.ledState === "green" ? 0.34 : 0.48;
      ringX.rotation.z += reducedMotion ? 0 : 0.004;
      ringY.rotation.x += reducedMotion ? 0 : 0.003;

      renderer.render(scene, camera);
      frame += 1;
      raf = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      upper.geometry.dispose();
      lower.geometry.dispose();
      ringX.geometry.dispose();
      ringY.geometry.dispose();
      floor.geometry.dispose();
      bodyMaterial.dispose();
      thighMaterial.dispose();
      ringMaterial.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div className="motion-canvas" ref={mountRef} aria-label="3D motion alignment object" />;
}

function SensorStackRow({
  item,
  sample,
  live,
}: {
  item: { key: string; name: string; detail: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> };
  sample: SensorSample;
  live: boolean;
}) {
  const Icon = item.icon;
  const upperActive = sample.ble.connected || (live && sample.ble.status !== "manual-disconnected");
  const active =
    item.key === "upper"
      ? upperActive
      : item.key === "vibration"
        ? sample.vibration > 0
        : item.key === "thermo"
          ? Number.isFinite(sample.temperature)
          : item.key === "distance"
            ? Number.isFinite(sample.distance)
            : magnitude(sample.thighGyro) > 0;
  return (
    <div className={active ? "sensor-stack-row active" : "sensor-stack-row"}>
      <div className="sensor-stack-icon">
        <Icon aria-hidden={true} />
      </div>
      <div>
        <strong>{item.name}</strong>
        <span>{item.detail}</span>
      </div>
      <i aria-label={active ? "active" : "waiting"} />
    </div>
  );
}

function FeatureTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: string | number;
  tone?: "state";
}) {
  return (
    <div className={tone === "state" ? "feature-tile state" : "feature-tile"}>
      <Icon aria-hidden={true} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Sparkline({ title, values }: { title: string; values: number[] }) {
  const points = useMemo(() => {
    const rows = values.slice(-80);
    if (!rows.length) return "";
    const min = Math.min(...rows);
    const max = Math.max(...rows);
    const span = Math.max(max - min, 0.01);
    return rows
      .map((value, index) => {
        const x = rows.length === 1 ? 0 : (index / (rows.length - 1)) * 100;
        const y = 44 - ((value - min) / span) * 38;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [values]);

  const latest = values.length ? values[values.length - 1] : 0;
  return (
    <div className="sparkline-card">
      <div>
        <span>{title}</span>
        <strong>{fmt(latest)}</strong>
      </div>
      <svg viewBox="0 0 100 48" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} />
      </svg>
    </div>
  );
}

function SummaryCard({ title, value, detail }: { title: string; value: string | number; detail: string }) {
  return (
    <Card className="clip-card summary-card">
      <CardContent className="clip-card-content">
        <span>{title}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </CardContent>
    </Card>
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
