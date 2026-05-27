#!/usr/bin/env python3
"""
Send a short BLE message from UNO Q Linux to Sati-Nano.

Default message:
LPK is here!
"""

import asyncio
import logging
import os
import sys

from bleak import BleakClient, BleakScanner


BLE_NAME = os.getenv("SATI_BLE_NAME", "Sati-Nano")
BLE_ADDRESS = os.getenv("SATI_BLE_ADDRESS", "")
INBOX_CHAR_UUID = os.getenv(
    "SATI_BLE_INBOX_CHAR",
    "19B10002-E8F2-537E-4F6C-D104768A1214",
)
SCAN_TIMEOUT_SEC = float(os.getenv("SATI_BLE_SCAN_TIMEOUT", "5"))
DEFAULT_MESSAGE = os.getenv("SATI_BLE_MESSAGE", "LPK is here!")


async def find_device_address() -> str:
    if BLE_ADDRESS:
        return BLE_ADDRESS

    devices = await BleakScanner.discover(timeout=SCAN_TIMEOUT_SEC)
    for device in devices:
        if device.name == BLE_NAME:
            return device.address

    return ""


async def send_message(message: str) -> None:
    address = await find_device_address()
    if not address:
        raise RuntimeError(f"BLE device named {BLE_NAME!r} not found")

    encoded = message.encode("utf-8")
    if len(encoded) > 40:
        raise ValueError("Message is too long for the Nano inbox characteristic (max 40 bytes)")

    async with BleakClient(address) as client:
        try:
            await client.write_gatt_char(INBOX_CHAR_UUID, encoded, response=True)
        except Exception:
            await client.write_gatt_char(INBOX_CHAR_UUID, encoded, response=False)

    print(f"sent to {BLE_NAME} ({address}): {message}")


def main() -> None:
    logging.basicConfig(level=os.getenv("SATI_LOG_LEVEL", "WARNING"))
    message = " ".join(sys.argv[1:]).strip() or DEFAULT_MESSAGE
    asyncio.run(send_message(message))


if __name__ == "__main__":
    main()
