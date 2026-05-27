#!/usr/bin/env python3
"""
Read the Nano 33 BLE Sense JSON payload from UNO Q Linux.

Expected Nano payload:
{"backAngle":18.5,"motion":1.2}
"""

import argparse
import asyncio
import json
import os

from bleak import BleakClient, BleakScanner


BLE_NAME = os.getenv("SATI_BLE_NAME", "Sati-Nano")
BLE_ADDRESS = os.getenv("SATI_BLE_ADDRESS", "")
BLE_CHAR_UUID = os.getenv(
    "SATI_BLE_CHAR",
    "19B10001-E8F2-537E-4F6C-D104768A1214",
)
SCAN_TIMEOUT_SEC = float(os.getenv("SATI_BLE_SCAN_TIMEOUT", "5"))


async def find_device_address() -> str:
    if BLE_ADDRESS:
        return BLE_ADDRESS

    devices = await BleakScanner.discover(timeout=SCAN_TIMEOUT_SEC)
    for device in devices:
        if device.name == BLE_NAME:
            return device.address

    return ""


async def read_samples(count: int, delay_sec: float) -> None:
    address = await find_device_address()
    if not address:
        raise RuntimeError(f"BLE device named {BLE_NAME!r} not found")

    async with BleakClient(address) as client:
        print(f"connected to {BLE_NAME} ({address})")

        for index in range(count):
            raw = await client.read_gatt_char(BLE_CHAR_UUID)
            text = raw.decode("utf-8", errors="ignore").strip()
            data = json.loads(text)

            print(
                f"{index + 1}: raw={text} "
                f"backAngle={float(data['backAngle']):.1f} "
                f"motion={float(data.get('motion', 0.0)):.1f}"
            )

            if index < count - 1:
                await asyncio.sleep(delay_sec)


def main() -> None:
    parser = argparse.ArgumentParser(description="Read Sati Nano BLE JSON payloads")
    parser.add_argument("--count", type=int, default=5, help="number of samples to read")
    parser.add_argument("--delay", type=float, default=0.25, help="seconds between samples")
    args = parser.parse_args()

    asyncio.run(read_samples(max(1, args.count), max(0.0, args.delay)))


if __name__ == "__main__":
    main()
