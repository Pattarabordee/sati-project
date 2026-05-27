#!/usr/bin/env python3
"""
Read the Nano 33 BLE Sense JSON payload from UNO Q Linux.

Expected Nano payload:
{"backAngle":18.5,"motion":1.2}
"""

import argparse
import asyncio
import json
import math
import re
import os

from bleak import BleakClient, BleakScanner


BLE_NAME = os.getenv("SATI_BLE_NAME", "Sati-Nano")
BLE_ADDRESS = os.getenv("SATI_BLE_ADDRESS", "")
BLE_SERVICE_UUID = os.getenv("SATI_BLE_SERVICE", "19B10000-E8F2-537E-4F6C-D104768A1214")
BLE_CHAR_UUID = os.getenv(
    "SATI_BLE_CHAR",
    "19B10001-E8F2-537E-4F6C-D104768A1214",
)
SCAN_TIMEOUT_SEC = float(os.getenv("SATI_BLE_SCAN_TIMEOUT", "5"))


async def find_device_address() -> str:
    if BLE_ADDRESS:
        return BLE_ADDRESS

    results = await BleakScanner.discover(timeout=SCAN_TIMEOUT_SEC, return_adv=True)
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


async def read_samples(count: int, delay_sec: float) -> None:
    address = await find_device_address()
    if not address:
        raise RuntimeError(f"BLE device named {BLE_NAME!r} not found")

    async with BleakClient(address) as client:
        print(f"connected to {BLE_NAME} ({address})")

        for index in range(count):
            raw = await client.read_gatt_char(BLE_CHAR_UUID)
            text = raw.decode("utf-8", errors="ignore").strip()
            data = parse_payload(text)

            print(
                f"{index + 1}: raw={text} "
                f"backAngle={float(data.get('backAngle', 0.0)):.1f} "
                f"motion={float(data.get('motion', 0.0)):.1f}"
            )

            if index < count - 1:
                await asyncio.sleep(delay_sec)


def parse_payload(text: str) -> dict:
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("payload is not a JSON object")
    except Exception:
        data = {key: value for key in ("backAngle", "motion", "ax", "ay", "az", "gx", "gy", "gz") if (value := extract_number(text, key)) is not None}

    if "backAngle" not in data and all(key in data for key in ("ax", "ay", "az")):
        data["backAngle"] = angle_from_accel(float(data["ax"]), float(data["ay"]), float(data["az"]))

    if "motion" not in data and all(key in data for key in ("gx", "gy", "gz")):
        data["motion"] = gyro_magnitude(float(data["gx"]), float(data["gy"]), float(data["gz"]))

    return data


def extract_number(text: str, key: str) -> float | None:
    match = re.search(rf'"{re.escape(key)}"\s*:\s*(-?\d+(?:\.\d+)?)', text)
    return float(match.group(1)) if match else None


def angle_from_accel(ax: float, ay: float, az: float) -> float:
    return abs(math.atan2(ay, math.sqrt((ax * ax) + (az * az))) * 180.0 / math.pi)


def gyro_magnitude(gx: float, gy: float, gz: float) -> float:
    return math.sqrt((gx * gx) + (gy * gy) + (gz * gz))


def main() -> None:
    parser = argparse.ArgumentParser(description="Read Sati Nano BLE JSON payloads")
    parser.add_argument("--count", type=int, default=5, help="number of samples to read")
    parser.add_argument("--delay", type=float, default=0.25, help="seconds between samples")
    args = parser.parse_args()

    asyncio.run(read_samples(max(1, args.count), max(0.0, args.delay)))


if __name__ == "__main__":
    main()
