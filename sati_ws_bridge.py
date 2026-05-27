#!/usr/bin/env python3
"""
Sati sensor bridge for Arduino UNO Q.

Reads the posture sensor values and publishes them to a WebSocket endpoint:
ws://0.0.0.0:8765
"""

import asyncio
import json
import logging
import math
import os
import random
import re
import signal
import time
from dataclasses import dataclass
from typing import Optional, Set

import websockets

try:
    from bleak import BleakClient, BleakScanner
except ImportError:  # pragma: no cover - used on machines before pip install
    BleakClient = None
    BleakScanner = None

try:
    import serial
except ImportError:  # pragma: no cover - used on machines before pip install
    serial = None


HOST = os.getenv("SATI_WS_HOST", "0.0.0.0")
PORT = int(os.getenv("SATI_WS_PORT", "8765"))
SEND_INTERVAL_SEC = 0.25

BLE_NAME = os.getenv("SATI_BLE_NAME", "Sati-Nano")
BLE_ADDRESS = os.getenv("SATI_BLE_ADDRESS", "")
BLE_SERVICE_UUID = os.getenv("SATI_BLE_SERVICE", "19B10000-E8F2-537E-4F6C-D104768A1214")
DEFAULT_BLE_CHAR_UUID = "19B10001-E8F2-537E-4F6C-D104768A1214"
BLE_CHAR_UUID = os.getenv("SATI_BLE_CHAR", DEFAULT_BLE_CHAR_UUID)
BLE_SCAN_TIMEOUT_SEC = float(os.getenv("SATI_BLE_SCAN_TIMEOUT", "4"))

SERIAL_PORT = os.getenv("SATI_SERIAL_PORT", "/dev/ttyACM0")
SERIAL_BAUD = int(os.getenv("SATI_SERIAL_BAUD", "115200"))
DEFAULT_DISTANCE_CM = 60.0

HUNCHED_ANGLE_DEG = float(os.getenv("SATI_HUNCHED_ANGLE", "20"))
MOVEMENT_IDLE_SEC = float(os.getenv("SATI_MOVEMENT_IDLE_SEC", "5"))
MOVEMENT_DELTA_DEG = float(os.getenv("SATI_MOVEMENT_DELTA_DEG", "4"))
MOVEMENT_HOLD_SEC = float(os.getenv("SATI_MOVEMENT_HOLD_SEC", "1.3"))


@dataclass
class ImuReading:
    back_angle: float
    motion_amount: float
    connected: bool


class BleImuReader:
    """อ่านมุมหลังจาก Nano 33 BLE Sense ผ่าน BLE พร้อม fallback."""

    def __init__(self) -> None:
        self.client: Optional[BleakClient] = None
        self.last_mock_log = 0.0

    async def read(self) -> ImuReading:
        # ถ้ายังไม่ได้ต่อ BLE ให้ลองต่อก่อน แล้วใช้ค่า mock ถ้าต่อไม่ได้
        if not self._is_connected():
            await self._connect()

        if self._is_connected() and BLE_CHAR_UUID:
            try:
                raw = await self.client.read_gatt_char(BLE_CHAR_UUID)
                return self._parse_payload(raw)
            except Exception as exc:
                logging.warning("BLE read failed, using mock: %s", exc)
                await self._disconnect()

        self._log_mock_once()
        return self._mock_reading()

    async def _connect(self) -> None:
        if BleakClient is None or BleakScanner is None:
            self._log_mock_once()
            return

        try:
            address = BLE_ADDRESS or await self._find_device_address()
            if not address:
                self._log_mock_once()
                return

            self.client = BleakClient(address)
            await self.client.connect(timeout=8)
            logging.info("BLE connected to %s", address)
        except Exception as exc:
            logging.warning("BLE connect failed: %s", exc)
            await self._disconnect()
            self._log_mock_once()

    async def _find_device_address(self) -> str:
        # หาอุปกรณ์จากชื่อหรือ service UUID; service UUID ช่วยเมื่อทีมตั้งชื่อ Nano คนละชื่อ
        results = await BleakScanner.discover(timeout=BLE_SCAN_TIMEOUT_SEC, return_adv=True)
        service_match = ""
        target_service = BLE_SERVICE_UUID.lower()

        for address, (device, adv) in results.items():
            name = device.name or adv.local_name or ""
            service_uuids = [uuid.lower() for uuid in (adv.service_uuids or [])]
            if name == BLE_NAME:
                return address
            if target_service in service_uuids and not service_match:
                service_match = address

        return service_match

    async def _disconnect(self) -> None:
        if self.client is not None:
            try:
                if self.client.is_connected:
                    await self.client.disconnect()
            except Exception:
                pass
        self.client = None

    def _is_connected(self) -> bool:
        return bool(self.client and self.client.is_connected)

    def _parse_payload(self, raw: bytes) -> ImuReading:
        # รองรับทั้ง JSON จาก Nano และตัวเลขมุมเดี่ยว เพื่อให้ง่ายต่อการทดสอบ
        text = raw.decode("utf-8", errors="ignore").strip()
        try:
            data = json.loads(text)
            if not isinstance(data, dict):
                raise ValueError("JSON payload is not an object")
            back_angle, motion_amount = self._parse_json_object(data)
        except Exception:
            back_angle, motion_amount = self._parse_text_fallback(text)

        return ImuReading(back_angle=back_angle, motion_amount=motion_amount, connected=True)

    def _parse_json_object(self, data: dict) -> tuple[float, float]:
        if "backAngle" in data or "angle" in data:
            back_angle = float(data.get("backAngle", data.get("angle", 15.0)))
        elif all(key in data for key in ("ax", "ay", "az")):
            back_angle = self._angle_from_accel(float(data["ax"]), float(data["ay"]), float(data["az"]))
        else:
            back_angle = 15.0

        if "motion" in data or "motionAmount" in data:
            motion_amount = float(data.get("motion", data.get("motionAmount", 0.0)))
        elif all(key in data for key in ("gx", "gy", "gz")):
            motion_amount = self._gyro_magnitude(float(data["gx"]), float(data["gy"]), float(data["gz"]))
        else:
            motion_amount = 0.0

        return back_angle, motion_amount

    def _parse_text_fallback(self, text: str) -> tuple[float, float]:
        values = {key: self._extract_number(text, key) for key in ("backAngle", "angle", "motion", "motionAmount", "ax", "ay", "az", "gx", "gy", "gz")}

        if values["backAngle"] is not None or values["angle"] is not None:
            back_angle = float(values["backAngle"] if values["backAngle"] is not None else values["angle"])
        elif all(values[key] is not None for key in ("ax", "ay", "az")):
            back_angle = self._angle_from_accel(float(values["ax"]), float(values["ay"]), float(values["az"]))
        else:
            back_angle = float(text)

        if values["motion"] is not None or values["motionAmount"] is not None:
            motion_amount = float(values["motion"] if values["motion"] is not None else values["motionAmount"])
        elif all(values[key] is not None for key in ("gx", "gy", "gz")):
            motion_amount = self._gyro_magnitude(float(values["gx"]), float(values["gy"]), float(values["gz"]))
        else:
            motion_amount = 0.0

        return back_angle, motion_amount

    def _extract_number(self, text: str, key: str) -> Optional[float]:
        match = re.search(rf'"{re.escape(key)}"\s*:\s*(-?\d+(?:\.\d+)?)', text)
        return float(match.group(1)) if match else None

    def _angle_from_accel(self, ax: float, ay: float, az: float) -> float:
        side_magnitude = math.sqrt((ax * ax) + (az * az))
        return abs(math.atan2(ay, side_magnitude) * 180.0 / math.pi)

    def _gyro_magnitude(self, gx: float, gy: float, gz: float) -> float:
        return math.sqrt((gx * gx) + (gy * gy) + (gz * gz))

    def _mock_reading(self) -> ImuReading:
        now = time.monotonic()
        wave = math.sin(now / 3.0) * 2.5
        noise = random.uniform(-0.6, 0.6)
        return ImuReading(back_angle=15.0 + wave + noise, motion_amount=0.0, connected=False)

    def _log_mock_once(self) -> None:
        # ลด log ซ้ำ ๆ แต่ยังบอกชัดว่าตอนนี้ใช้ข้อมูลจำลอง
        now = time.monotonic()
        if now - self.last_mock_log > 5:
            logging.warning("BLE not connected, using mock")
            self.last_mock_log = now


class SerialBridgeReader:
    """อ่านระยะหน้าจอจาก Serial bridge ของ MCU พร้อม fallback."""

    def __init__(self) -> None:
        self.serial_port = None
        self.last_fail_log = 0.0
        self.last_open_log = 0.0

    def read_cm(self) -> float:
        # MCU sketch ต้องส่งค่า ToF ออก Serial เป็น {"tof": 62.5} หรือเลข cm เดี่ยว
        if serial is None:
            self._log_default_once()
            return DEFAULT_DISTANCE_CM

        if self.serial_port is None or not self.serial_port.is_open:
            self._open()

        if self.serial_port is None or not self.serial_port.is_open:
            self._log_default_once()
            return DEFAULT_DISTANCE_CM

        try:
            line = self.serial_port.readline().decode("utf-8", errors="ignore").strip()
        except Exception:
            self._close()
            self._log_default_once()
            return DEFAULT_DISTANCE_CM

        if not line:
            self._log_default_once()
            return DEFAULT_DISTANCE_CM

        try:
            return self._parse_line(line)
        except Exception:
            self._log_default_once()
            return DEFAULT_DISTANCE_CM

    def _open(self) -> None:
        try:
            self.serial_port = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=0.05)
            logging.info("Serial bridge connected on %s", SERIAL_PORT)
        except Exception as exc:
            self.serial_port = None
            self._log_open_failed_once(exc)

    def _close(self) -> None:
        if self.serial_port is not None:
            try:
                self.serial_port.close()
            except Exception:
                pass
        self.serial_port = None

    def _parse_line(self, line: str) -> float:
        try:
            data = json.loads(line)
            if isinstance(data, dict):
                distance_cm = float(data["tof"])
            else:
                distance_cm = float(data)
        except Exception:
            distance_cm = float(line)

        if not math.isfinite(distance_cm) or distance_cm <= 0:
            raise ValueError(f"unexpected distance: {distance_cm} cm")
        return round(distance_cm, 1)

    def _log_open_failed_once(self, exc: Exception) -> None:
        now = time.monotonic()
        if now - self.last_open_log > 5:
            logging.warning("Serial bridge open failed: %s", exc)
            self.last_open_log = now

    def _log_default_once(self) -> None:
        now = time.monotonic()
        if now - self.last_fail_log > 5:
            logging.warning("ToF read failed, using default")
            self.last_fail_log = now


class PostureClassifier:
    """แปลงค่าจาก sensor เป็น postureClass ที่หน้าเว็บต้องใช้."""

    def __init__(self) -> None:
        self.previous_angle: Optional[float] = None
        self.last_movement_at = time.monotonic()
        self.movement_until = 0.0

    def classify(self, reading: ImuReading) -> str:
        now = time.monotonic()
        moved = self._has_moved(reading)

        # ถ้านิ่งเกิน 5 วินาทีแล้วมีการขยับ ให้ส่ง movement ชั่วครู่
        if moved:
            if now - self.last_movement_at >= MOVEMENT_IDLE_SEC:
                self.movement_until = now + MOVEMENT_HOLD_SEC
            self.last_movement_at = now

        self.previous_angle = reading.back_angle

        if now <= self.movement_until:
            return "movement"
        if reading.back_angle > HUNCHED_ANGLE_DEG:
            return "hunched"
        return "normal"

    def _has_moved(self, reading: ImuReading) -> bool:
        if reading.motion_amount >= MOVEMENT_DELTA_DEG:
            return True
        if self.previous_angle is None:
            return False
        return abs(reading.back_angle - self.previous_angle) >= MOVEMENT_DELTA_DEG


class WebSocketBroadcaster:
    """ดูแล client WebSocket และส่งข้อมูลชุดล่าสุดให้ทุกคน."""

    def __init__(self) -> None:
        self.clients: Set[websockets.WebSocketServerProtocol] = set()

    async def handler(self, websocket) -> None:
        self.clients.add(websocket)
        logging.info("WebSocket client connected (%s total)", len(self.clients))
        try:
            await websocket.wait_closed()
        finally:
            self.clients.discard(websocket)
            logging.info("WebSocket client disconnected (%s total)", len(self.clients))

    async def broadcast(self, payload: dict) -> None:
        message = json.dumps(payload, separators=(",", ":"))
        disconnected = []

        for client in list(self.clients):
            try:
                await client.send(message)
            except Exception as exc:
                logging.warning("WebSocket send failed, client removed: %s", exc)
                disconnected.append(client)

        for client in disconnected:
            self.clients.discard(client)


async def sensor_loop(broadcaster: WebSocketBroadcaster, stop_event: asyncio.Event) -> None:
    # วนอ่าน sensor ทุก 250ms แล้วส่ง JSON ให้หน้าเว็บ
    imu = BleImuReader()
    tof = SerialBridgeReader()
    classifier = PostureClassifier()

    while not stop_event.is_set():
        started_at = time.monotonic()

        imu_reading = await imu.read()
        distance_cm = tof.read_cm()
        posture_class = classifier.classify(imu_reading)

        payload = {
            "backAngle": round(float(imu_reading.back_angle), 1),
            "screenDistance": round(float(distance_cm), 1),
            "postureClass": posture_class,
        }

        await broadcaster.broadcast(payload)
        logging.debug("sent %s", payload)

        elapsed = time.monotonic() - started_at
        await asyncio.sleep(max(0.0, SEND_INTERVAL_SEC - elapsed))


async def main() -> None:
    logging.basicConfig(
        level=os.getenv("SATI_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    if BLE_CHAR_UUID == "":
        logging.warning("SATI_BLE_CHAR not set — BLE data will not be read. Set env var to enable.")

    stop_event = asyncio.Event()
    broadcaster = WebSocketBroadcaster()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            pass

    async with websockets.serve(broadcaster.handler, HOST, PORT):
        logging.info("Sati bridge listening on ws://%s:%s", HOST, PORT)
        sensor_task = asyncio.create_task(sensor_loop(broadcaster, stop_event))
        await stop_event.wait()
        sensor_task.cancel()
        try:
            await sensor_task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    asyncio.run(main())
