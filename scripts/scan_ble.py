#!/usr/bin/env python3
"""Scan BLE devices from UNO Q Linux."""

import argparse
import asyncio

from bleak import BleakScanner


TARGET_SERVICE = "19b10000-e8f2-537e-4f6c-d104768a1214"


async def scan(timeout: float, show_all: bool) -> None:
    results = await BleakScanner.discover(timeout=timeout, return_adv=True)
    rows = []

    for address, (device, adv) in results.items():
        name = device.name or adv.local_name or ""
        uuids = [uuid.lower() for uuid in (adv.service_uuids or [])]
        is_interesting = TARGET_SERVICE in uuids or "sati" in name.lower() or "nano" in name.lower()

        if show_all or is_interesting:
            rows.append((adv.rssi, address, name or "(no name)", ", ".join(uuids)))

    rows.sort(reverse=True)
    print(f"found {len(results)} BLE devices; showing {len(rows)}")
    for rssi, address, name, services in rows:
        print(f"{address} | rssi={rssi:>4} | {name} | {services}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan BLE devices from UNO Q")
    parser.add_argument("--timeout", type=float, default=8, help="scan timeout in seconds")
    parser.add_argument("--all", action="store_true", help="show all devices, not only likely Sati/Nano devices")
    args = parser.parse_args()

    asyncio.run(scan(max(1.0, args.timeout), args.all))


if __name__ == "__main__":
    main()
