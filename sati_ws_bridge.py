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
import struct
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Optional, Set

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
BLE_ALLOW_SERVICE_FALLBACK = os.getenv("SATI_BLE_ALLOW_SERVICE_FALLBACK", "false").lower() in {"1", "true", "yes", "on"}

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
    upper_gyro: dict
    upper_accel: dict
    upper_mag: dict
    orientation_quat: dict
    orientation_rpy: dict
    raw_payload: dict
    raw_text: str
    device_name: str = ""
    address: str = ""
    characteristic_uuid: str = ""
    ble_status: str = "scanning"


@dataclass
class SerialReading:
    distance_cm: float
    thigh_gyro: dict
    vibration: int
    temperature: float
    raw_payload: dict


class BleControlState:
    """Keeps the browser BLE control request shared with the sensor loop."""

    def __init__(self) -> None:
        self.enabled = True
        self.status = "scanning"

    def request_connect(self) -> None:
        self.enabled = True
        self.status = "scanning"

    def request_disconnect(self) -> None:
        self.enabled = False
        self.status = "manual-disconnected"


class BleImuReader:
    """อ่านมุมหลังจาก Nano 33 BLE Sense ผ่าน BLE พร้อม fallback."""

    def __init__(self, control: Optional[BleControlState] = None) -> None:
        self.control = control or BleControlState()
        self.client: Optional[BleakClient] = None
        self.char_uuid = BLE_CHAR_UUID
        self.last_mock_log = 0.0
        self.connected_address = ""
        self.connected_name = ""

    async def read(self) -> ImuReading:
        if not self.control.enabled:
            await self._disconnect()
            self.control.status = "manual-disconnected"
            return self._mock_reading("manual-disconnected")

        # ถ้ายังไม่ได้ต่อ BLE ให้ลองต่อก่อน แล้วใช้ค่า mock ถ้าต่อไม่ได้
        if not self._is_connected():
            self.control.status = "scanning"
            await self._connect()

        if self._is_connected() and self.char_uuid:
            try:
                raw = await self.client.read_gatt_char(self.char_uuid)
                reading = self._parse_payload(raw)
                reading.ble_status = "connected"
                self.control.status = "connected"
                return reading
            except Exception as exc:
                logging.warning("BLE read failed, using mock: %s", exc)
                await self._disconnect()

        if self.control.enabled and self.control.status != "error":
            self.control.status = "scanning"
        self._log_mock_once()
        return self._mock_reading(self.control.status)

    async def _connect(self) -> None:
        if BleakClient is None or BleakScanner is None:
            self.control.status = "error"
            self._log_mock_once()
            return

        try:
            self.control.status = "scanning"
            address = BLE_ADDRESS or await self._find_device_address()
            if not address:
                self._log_mock_once()
                return

            self.client = BleakClient(address)
            await self.client.connect(timeout=8)
            self.char_uuid = self._resolve_characteristic_uuid()
            self.connected_address = address
            self.connected_name = BLE_NAME
            self.control.status = "connected"
            logging.info("BLE connected to %s", address)
        except Exception as exc:
            self.control.status = "error"
            logging.warning("BLE connect failed: %s", exc)
            await self._disconnect()
            self._log_mock_once()

    def _resolve_characteristic_uuid(self) -> str:
        if self.client is None:
            return BLE_CHAR_UUID

        preferred = BLE_CHAR_UUID.lower()
        fallback = ""

        for service in self.client.services:
            for char in service.characteristics:
                props = set(char.properties or [])
                if "read" not in props:
                    continue
                char_uuid = char.uuid.lower()
                service_uuid = service.uuid.lower()
                if preferred and char_uuid == preferred:
                    return char.uuid
                if not fallback and service_uuid.startswith("19b100"):
                    fallback = char.uuid

        if fallback:
            logging.warning("BLE characteristic %s not found; using discovered Sati characteristic %s", BLE_CHAR_UUID, fallback)
            return fallback

        return BLE_CHAR_UUID

    async def _find_device_address(self) -> str:
        # Prefer the team's Nano name first, so UNO Q does not attach to another board by accident.
        results = await BleakScanner.discover(timeout=BLE_SCAN_TIMEOUT_SEC, return_adv=True)
        service_match = ""
        service_match_names = ""
        target_service = BLE_SERVICE_UUID.lower()

        for address, (device, adv) in results.items():
            names = [name for name in (device.name, adv.local_name) if name]
            service_uuids = [uuid.lower() for uuid in (adv.service_uuids or [])]
            if BLE_NAME in names:
                return address
            if target_service in service_uuids and not service_match:
                service_match = address
                service_match_names = ", ".join(names) or "unnamed"

        if service_match and BLE_ALLOW_SERVICE_FALLBACK:
            logging.warning(
                "BLE device named %r not found; using service UUID fallback at %s",
                BLE_NAME,
                service_match,
            )
            return service_match

        if service_match:
            logging.warning(
                "Found Sati BLE service at %s (%s), but device name was not %r. Set SATI_BLE_ALLOW_SERVICE_FALLBACK=true to allow it.",
                service_match,
                service_match_names,
                BLE_NAME,
            )

        return ""

    async def _disconnect(self) -> None:
        if self.client is not None:
            try:
                if self.client.is_connected:
                    await self.client.disconnect()
            except Exception:
                pass
        self.client = None
        self.connected_address = ""
        self.connected_name = ""

    def _is_connected(self) -> bool:
        return bool(self.client and self.client.is_connected)

    def _parse_payload(self, raw: bytes) -> ImuReading:
        # รองรับทั้ง JSON จาก Nano และตัวเลขมุมเดี่ยว เพื่อให้ง่ายต่อการทดสอบ
        text = raw.decode("utf-8", errors="ignore").strip()
        raw_payload: dict[str, Any] = {}
        try:
            data = json.loads(text)
            if not isinstance(data, dict):
                raise ValueError("JSON payload is not an object")
            raw_payload = data
            back_angle, motion_amount, upper_gyro, upper_accel, upper_mag, orientation_quat, orientation_rpy = self._parse_json_object(data)
        except Exception:
            try:
                back_angle, motion_amount, upper_gyro, upper_accel, upper_mag, orientation_quat, orientation_rpy = self._parse_text_fallback(text)
            except Exception:
                back_angle, motion_amount, upper_gyro, upper_accel, upper_mag, orientation_quat, orientation_rpy = self._parse_binary_payload(raw)

        return ImuReading(
            back_angle=back_angle,
            motion_amount=motion_amount,
            connected=True,
            upper_gyro=upper_gyro,
            upper_accel=upper_accel,
            upper_mag=upper_mag,
            orientation_quat=orientation_quat,
            orientation_rpy=orientation_rpy,
            raw_payload=raw_payload,
            raw_text=text,
            device_name=self.connected_name,
            address=self.connected_address,
            characteristic_uuid=self.char_uuid,
            ble_status="connected",
        )

    def _parse_json_object(self, data: dict) -> tuple[float, float, dict, dict, dict, dict, dict]:
        upper_gyro = self._gyro_from_array(data.get("gy")) or self._gyro_from_object(data.get("upperGyro")) or self._gyro_from_object(data.get("upper_gyro")) or self._gyro_from_object(data)
        upper_accel = self._accel_from_array(data.get("a")) or self._accel_from_object(data.get("upperAccel")) or self._accel_from_object(data.get("upper_accel")) or self._accel_from_object(data)
        upper_mag = self._mag_from_array(data.get("m")) or self._mag_from_object(data.get("upperMag")) or self._mag_from_object(data.get("upper_mag"))
        orientation_quat = self._quat_from_array(data.get("q")) or self._quat_from_object(data.get("orientationQuat")) or self._quat_from_object(data.get("orientation_quat"))
        orientation_rpy = self._rpy_from_array(data.get("rpy")) or self._rpy_from_object(data.get("orientationRpy")) or self._rpy_from_object(data.get("orientation_rpy"))

        if "backAngle" in data or "angle" in data:
            back_angle = float(data.get("backAngle", data.get("angle", 15.0)))
        elif orientation_rpy:
            back_angle = max(abs(float(orientation_rpy["roll"])), abs(float(orientation_rpy["pitch"])))
        elif upper_accel:
            back_angle = self._angle_from_accel(float(upper_accel["ax"]), float(upper_accel["ay"]), float(upper_accel["az"]))
        else:
            back_angle = 15.0

        if "motion" in data or "motionAmount" in data:
            motion_amount = float(data.get("motion", data.get("motionAmount", 0.0)))
        elif upper_gyro:
            motion_amount = self._gyro_magnitude(float(upper_gyro["gx"]), float(upper_gyro["gy"]), float(upper_gyro["gz"]))
        else:
            motion_amount = 0.0

        return back_angle, motion_amount, upper_gyro, upper_accel, upper_mag, orientation_quat, orientation_rpy

    def _parse_text_fallback(self, text: str) -> tuple[float, float, dict, dict, dict, dict, dict]:
        values = {key: self._extract_number(text, key) for key in ("backAngle", "angle", "motion", "motionAmount", "ax", "ay", "az", "gx", "gy", "gz")}
        upper_gyro = {}
        upper_accel = {}

        if values["backAngle"] is not None or values["angle"] is not None:
            back_angle = float(values["backAngle"] if values["backAngle"] is not None else values["angle"])
        elif all(values[key] is not None for key in ("ax", "ay", "az")):
            upper_accel = {"ax": float(values["ax"]), "ay": float(values["ay"]), "az": float(values["az"])}
            back_angle = self._angle_from_accel(float(upper_accel["ax"]), float(upper_accel["ay"]), float(upper_accel["az"]))
        else:
            back_angle = float(text)

        if values["motion"] is not None or values["motionAmount"] is not None:
            motion_amount = float(values["motion"] if values["motion"] is not None else values["motionAmount"])
        elif all(values[key] is not None for key in ("gx", "gy", "gz")):
            upper_gyro = {"gx": float(values["gx"]), "gy": float(values["gy"]), "gz": float(values["gz"])}
            motion_amount = self._gyro_magnitude(float(upper_gyro["gx"]), float(upper_gyro["gy"]), float(upper_gyro["gz"]))
        else:
            motion_amount = 0.0

        return back_angle, motion_amount, upper_gyro, upper_accel, {}, {}, {}

    def _extract_number(self, text: str, key: str) -> Optional[float]:
        match = re.search(rf'"{re.escape(key)}"\s*:\s*(-?\d+(?:\.\d+)?)', text)
        return float(match.group(1)) if match else None

    def _parse_binary_payload(self, raw: bytes) -> tuple[float, float, dict, dict, dict, dict, dict]:
        # NanoIMU sketches may send little-endian floats: ax, ay, az, gx, gy, gz.
        if len(raw) >= 24:
            ax, ay, az, gx, gy, gz = struct.unpack("<6f", raw[:24])
            upper_accel = {"ax": ax, "ay": ay, "az": az}
            upper_gyro = {"gx": gx, "gy": gy, "gz": gz}
            return self._angle_from_accel(ax, ay, az), self._gyro_magnitude(gx, gy, gz), upper_gyro, upper_accel, {}, {}, {}
        if len(raw) >= 12:
            ax, ay, az = struct.unpack("<3f", raw[:12])
            upper_accel = {"ax": ax, "ay": ay, "az": az}
            return self._angle_from_accel(ax, ay, az), 0.0, {}, upper_accel, {}, {}, {}
        if len(raw) >= 8:
            back_angle, motion_amount = struct.unpack("<2f", raw[:8])
            return back_angle, motion_amount, {}, {}, {}, {}, {}
        if len(raw) >= 4:
            return struct.unpack("<f", raw[:4])[0], 0.0, {}, {}, {}, {}, {}

        raise ValueError(f"unsupported BLE binary payload length: {len(raw)}")

    def _numbers_from_array(self, value: Any, length: int) -> list[float]:
        if not isinstance(value, list) or len(value) < length:
            return []
        try:
            return [float(value[index]) for index in range(length)]
        except (TypeError, ValueError):
            return []

    def _gyro_from_array(self, value: Any) -> dict:
        values = self._numbers_from_array(value, 3)
        if not values:
            return {}
        return {"gx": values[0], "gy": values[1], "gz": values[2]}

    def _accel_from_array(self, value: Any) -> dict:
        values = self._numbers_from_array(value, 3)
        if not values:
            return {}
        return {"ax": values[0], "ay": values[1], "az": values[2]}

    def _mag_from_array(self, value: Any) -> dict:
        values = self._numbers_from_array(value, 3)
        if not values:
            return {}
        return {"mx": values[0], "my": values[1], "mz": values[2]}

    def _quat_from_array(self, value: Any) -> dict:
        values = self._numbers_from_array(value, 4)
        if not values:
            return {}
        return {"qw": values[0], "qx": values[1], "qy": values[2], "qz": values[3]}

    def _rpy_from_array(self, value: Any) -> dict:
        values = self._numbers_from_array(value, 3)
        if not values:
            return {}
        return {"roll": values[0], "pitch": values[1], "yaw": values[2]}

    def _gyro_from_object(self, value: Any) -> dict:
        if not isinstance(value, dict):
            return {}
        if all(key in value for key in ("gx", "gy", "gz")):
            return {"gx": float(value["gx"]), "gy": float(value["gy"]), "gz": float(value["gz"])}
        return {}

    def _accel_from_object(self, value: Any) -> dict:
        if not isinstance(value, dict):
            return {}
        if all(key in value for key in ("ax", "ay", "az")):
            return {"ax": float(value["ax"]), "ay": float(value["ay"]), "az": float(value["az"])}
        return {}

    def _mag_from_object(self, value: Any) -> dict:
        if not isinstance(value, dict):
            return {}
        if all(key in value for key in ("mx", "my", "mz")):
            return {"mx": float(value["mx"]), "my": float(value["my"]), "mz": float(value["mz"])}
        return {}

    def _quat_from_object(self, value: Any) -> dict:
        if not isinstance(value, dict):
            return {}
        if all(key in value for key in ("qw", "qx", "qy", "qz")):
            return {"qw": float(value["qw"]), "qx": float(value["qx"]), "qy": float(value["qy"]), "qz": float(value["qz"])}
        return {}

    def _rpy_from_object(self, value: Any) -> dict:
        if not isinstance(value, dict):
            return {}
        if all(key in value for key in ("roll", "pitch", "yaw")):
            return {"roll": float(value["roll"]), "pitch": float(value["pitch"]), "yaw": float(value["yaw"])}
        return {}

    def _angle_from_accel(self, ax: float, ay: float, az: float) -> float:
        side_magnitude = math.sqrt((ax * ax) + (az * az))
        return abs(math.atan2(ay, side_magnitude) * 180.0 / math.pi)

    def _gyro_magnitude(self, gx: float, gy: float, gz: float) -> float:
        return math.sqrt((gx * gx) + (gy * gy) + (gz * gz))

    def _mock_reading(self, ble_status: str = "scanning") -> ImuReading:
        now = time.monotonic()
        wave = math.sin(now / 3.0) * 2.5
        noise = random.uniform(-0.6, 0.6)
        upper_gyro = {
            "gx": 1.8 + math.sin(now * 0.8) * 1.2,
            "gy": 0.6 + math.cos(now * 0.7) * 0.8,
            "gz": 0.5 + math.sin(now * 0.5) * 0.6,
        }
        return ImuReading(
            back_angle=15.0 + wave + noise,
            motion_amount=self._gyro_magnitude(float(upper_gyro["gx"]), float(upper_gyro["gy"]), float(upper_gyro["gz"])),
            connected=False,
            upper_gyro=upper_gyro,
            upper_accel={},
            upper_mag={},
            orientation_quat={},
            orientation_rpy={},
            raw_payload={},
            raw_text="",
            ble_status=ble_status,
        )

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

    def read(self) -> SerialReading:
        if serial is None:
            self._log_default_once()
            return self._default_reading()

        if self.serial_port is None or not self.serial_port.is_open:
            self._open()

        if self.serial_port is None or not self.serial_port.is_open:
            self._log_default_once()
            return self._default_reading()

        try:
            line = self.serial_port.readline().decode("utf-8", errors="ignore").strip()
        except Exception:
            self._close()
            self._log_default_once()
            return self._default_reading()

        if not line:
            self._log_default_once()
            return self._default_reading()

        try:
            return self._parse_line(line)
        except Exception:
            self._log_default_once()
            return self._default_reading()

    def read_cm(self) -> float:
        # MCU sketch ต้องส่งค่า ToF ออก Serial เป็น {"tof": 62.5} หรือเลข cm เดี่ยว
        return self.read().distance_cm

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

    def _parse_line(self, line: str) -> SerialReading:
        try:
            data = json.loads(line)
            if isinstance(data, dict):
                distance_cm = float(data.get("tof", data.get("distance", data.get("screenDistance", DEFAULT_DISTANCE_CM))))
                thigh_gyro = self._parse_gyro(data)
                vibration = int(float(data.get("vibration", data.get("vib", data.get("rough", 0)))))
                temperature = float(data.get("temperature", data.get("temp", data.get("thermo", 30.0))))
                raw_payload = data
            else:
                distance_cm = float(data)
                thigh_gyro = {}
                vibration = 0
                temperature = 30.0
                raw_payload = {"tof": distance_cm}
        except Exception:
            distance_cm = float(line)
            thigh_gyro = {}
            vibration = 0
            temperature = 30.0
            raw_payload = {"tof": distance_cm}

        if not math.isfinite(distance_cm) or distance_cm <= 0:
            raise ValueError(f"unexpected distance: {distance_cm} cm")
        return SerialReading(
            distance_cm=round(distance_cm, 1),
            thigh_gyro=thigh_gyro,
            vibration=1 if vibration else 0,
            temperature=round(temperature, 1),
            raw_payload=raw_payload,
        )

    def _parse_gyro(self, data: dict) -> dict:
        for key in ("thighGyro", "thigh_gyro", "lowerGyro", "lower_gyro", "movementGyro", "movement_gyro", "modulinoMovement"):
            value = data.get(key)
            if isinstance(value, dict) and all(axis in value for axis in ("gx", "gy", "gz")):
                return {"gx": float(value["gx"]), "gy": float(value["gy"]), "gz": float(value["gz"])}

        if all(key in data for key in ("thigh_gx", "thigh_gy", "thigh_gz")):
            return {"gx": float(data["thigh_gx"]), "gy": float(data["thigh_gy"]), "gz": float(data["thigh_gz"])}
        if all(key in data for key in ("lower_gx", "lower_gy", "lower_gz")):
            return {"gx": float(data["lower_gx"]), "gy": float(data["lower_gy"]), "gz": float(data["lower_gz"])}

        return {}

    def _default_reading(self) -> SerialReading:
        return SerialReading(
            distance_cm=DEFAULT_DISTANCE_CM,
            thigh_gyro={},
            vibration=0,
            temperature=30.0,
            raw_payload={},
        )

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

    def __init__(self, ble_control: Optional[BleControlState] = None) -> None:
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.ble_control = ble_control or BleControlState()

    async def handler(self, websocket) -> None:
        self.clients.add(websocket)
        logging.info("WebSocket client connected (%s total)", len(self.clients))
        try:
            async for message in websocket:
                self._handle_client_message(message)
        finally:
            self.clients.discard(websocket)
            logging.info("WebSocket client disconnected (%s total)", len(self.clients))

    def _handle_client_message(self, message: str) -> None:
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            return

        if not isinstance(data, dict):
            return

        command_type = data.get("type")
        if command_type == "ble.connect":
            self.ble_control.request_connect()
            logging.info("BLE connect requested from WebSocket client")
        elif command_type == "ble.disconnect":
            self.ble_control.request_disconnect()
            logging.info("BLE disconnect requested from WebSocket client")

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


def gyro_magnitude(gyro: dict) -> float:
    return math.sqrt(
        (float(gyro.get("gx", 0.0)) ** 2)
        + (float(gyro.get("gy", 0.0)) ** 2)
        + (float(gyro.get("gz", 0.0)) ** 2)
    )


def led_state_for(alignment_delta: float, stability: float) -> str:
    if alignment_delta < 3 and stability < 8:
        return "green"
    if alignment_delta < 7 and stability < 16:
        return "yellow"
    return "red"


async def sensor_loop(broadcaster: WebSocketBroadcaster, stop_event: asyncio.Event) -> None:
    # วนอ่าน sensor ทุก 250ms แล้วส่ง JSON ให้หน้าเว็บ
    imu = BleImuReader(broadcaster.ble_control)
    tof = SerialBridgeReader()
    classifier = PostureClassifier()
    vibration_events = deque()

    while not stop_event.is_set():
        started_at = time.monotonic()

        imu_reading = await imu.read()
        serial_reading = tof.read()
        distance_cm = serial_reading.distance_cm
        posture_class = classifier.classify(imu_reading)
        upper_signal = imu_reading.motion_amount or gyro_magnitude(imu_reading.upper_gyro)
        thigh_signal = gyro_magnitude(serial_reading.thigh_gyro)
        if serial_reading.vibration:
            vibration_events.append(started_at)
        while vibration_events and started_at - vibration_events[0] > 10:
            vibration_events.popleft()
        vibration_count = len(vibration_events)
        alignment_delta = abs(upper_signal - thigh_signal)
        stability = upper_signal + thigh_signal + vibration_count
        led_state = led_state_for(alignment_delta, stability)

        payload = {
            "backAngle": round(float(imu_reading.back_angle), 1),
            "screenDistance": round(float(distance_cm), 1),
            "postureClass": posture_class,
            "upperGyro": {
                "gx": round(float(imu_reading.upper_gyro.get("gx", 0.0)), 2),
                "gy": round(float(imu_reading.upper_gyro.get("gy", 0.0)), 2),
                "gz": round(float(imu_reading.upper_gyro.get("gz", 0.0)), 2),
            },
            "upperAccel": imu_reading.upper_accel,
            "upperMag": imu_reading.upper_mag,
            "orientationQuat": imu_reading.orientation_quat,
            "orientationRpy": imu_reading.orientation_rpy,
            "thighGyro": {
                "gx": round(float(serial_reading.thigh_gyro.get("gx", 0.0)), 2),
                "gy": round(float(serial_reading.thigh_gyro.get("gy", 0.0)), 2),
                "gz": round(float(serial_reading.thigh_gyro.get("gz", 0.0)), 2),
            },
            "vibration": int(serial_reading.vibration),
            "temperature": round(float(serial_reading.temperature), 1),
            "distance": round(float(distance_cm), 1),
            "motion": round(float(upper_signal), 2),
            "features": {
                "upperSignal": round(float(upper_signal), 2),
                "thighSignal": round(float(thigh_signal), 2),
                "alignmentDelta": round(float(alignment_delta), 2),
                "stability": round(float(stability), 2),
                "vibrationCount": int(vibration_count),
                "ledState": led_state,
            },
            "ble": {
                "targetName": BLE_NAME,
                "connected": bool(imu_reading.connected),
                "status": imu_reading.ble_status,
                "deviceName": imu_reading.device_name or BLE_NAME,
                "address": imu_reading.address,
                "characteristicUuid": imu_reading.characteristic_uuid,
            },
            "nanoRaw": imu_reading.raw_payload or {"raw": imu_reading.raw_text},
            "modulinoRaw": serial_reading.raw_payload,
            "timestampMs": int(time.time() * 1000),
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
    logging.info("BLE target name: %s", BLE_NAME)
    if BLE_ADDRESS:
        logging.info("BLE target address override enabled: %s", BLE_ADDRESS)
    elif BLE_ALLOW_SERVICE_FALLBACK:
        logging.warning("BLE service UUID fallback is enabled; exact name %s is still preferred.", BLE_NAME)

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
