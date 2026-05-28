#!/usr/bin/env python3
"""Sati Clip App Lab entrypoint.

Starts two Linux-side services for UNO Q:
- Static web UI on http://0.0.0.0:8080
- Sensor WebSocket bridge on ws://0.0.0.0:8765
"""

from __future__ import annotations

import asyncio
import functools
import logging
import os
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Default values; App Lab environment variables can override these.
os.environ.setdefault("SATI_WEB_HOST", "0.0.0.0")
os.environ.setdefault("SATI_WEB_PORT", "8080")
os.environ.setdefault("SATI_WS_HOST", "0.0.0.0")
os.environ.setdefault("SATI_WS_PORT", "8765")
os.environ.setdefault("SATI_BLE_NAME", "Sati-Nano")
os.environ.setdefault("SATI_BLE_CHAR", "19B10001-E8F2-537E-4F6C-D104768A1214")

try:
    from arduino.app_utils import App
except Exception:  # Allows local testing outside Arduino App Lab.

    class App:  # type: ignore[no-redef]
        @staticmethod
        def run(user_loop=None):
            logging.warning("Arduino App Lab runtime not found; running standalone loop.")
            try:
                while True:
                    if user_loop:
                        user_loop()
                    time.sleep(1)
            except KeyboardInterrupt:
                logging.info("Standalone loop stopped by keyboard interrupt.")


import sati_ws_bridge


WEB_DIR = Path(__file__).resolve().parent / "web"
WEB_HOST = os.getenv("SATI_WEB_HOST", "0.0.0.0")
WEB_PORT = int(os.getenv("SATI_WEB_PORT", "8080"))

_started = False
_http_server: ThreadingHTTPServer | None = None
_http_thread: threading.Thread | None = None
_bridge_thread: threading.Thread | None = None


class SatiStaticHandler(SimpleHTTPRequestHandler):
    """Serve the generated Next.js static export from python/web."""

    def log_message(self, format: str, *args) -> None:
        logging.info("web %s", format % args)


def start_static_web() -> None:
    """Start the static web server once."""

    global _http_server, _http_thread

    index_file = WEB_DIR / "index.html"
    if not index_file.exists():
        logging.warning("Static web bundle missing: %s", index_file)

    handler = functools.partial(SatiStaticHandler, directory=str(WEB_DIR))
    _http_server = ThreadingHTTPServer((WEB_HOST, WEB_PORT), handler)
    _http_thread = threading.Thread(target=_http_server.serve_forever, name="sati-web", daemon=True)
    _http_thread.start()
    logging.info("Sati Clip web listening on http://%s:%s", WEB_HOST, WEB_PORT)


async def run_bridge_until_process_stops() -> None:
    """Run the existing WebSocket bridge without signal handlers."""

    stop_event = asyncio.Event()
    broadcaster = sati_ws_bridge.WebSocketBroadcaster()

    async with sati_ws_bridge.websockets.serve(
        broadcaster.handler,
        sati_ws_bridge.HOST,
        sati_ws_bridge.PORT,
    ):
        logging.info("Sati bridge listening on ws://%s:%s", sati_ws_bridge.HOST, sati_ws_bridge.PORT)
        sensor_task = asyncio.create_task(sati_ws_bridge.sensor_loop(broadcaster, stop_event))
        try:
            while True:
                await asyncio.sleep(3600)
        finally:
            stop_event.set()
            sensor_task.cancel()


def bridge_thread_main() -> None:
    """Background thread wrapper for the async bridge."""

    try:
        asyncio.run(run_bridge_until_process_stops())
    except Exception:
        logging.exception("Sati bridge stopped unexpectedly")


def start_bridge() -> None:
    """Start WebSocket bridge once."""

    global _bridge_thread
    _bridge_thread = threading.Thread(target=bridge_thread_main, name="sati-bridge", daemon=True)
    _bridge_thread.start()


def start_services_once() -> None:
    """Start web and bridge services only on the first App Lab loop call."""

    global _started
    if _started:
        return

    logging.basicConfig(
        level=os.getenv("SATI_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    logging.info("Starting Sati Clip App Lab services")
    logging.info("BLE target name: %s", sati_ws_bridge.BLE_NAME)

    start_static_web()
    start_bridge()
    _started = True


def loop() -> None:
    """App Lab calls this repeatedly."""

    start_services_once()
    time.sleep(1)


App.run(user_loop=loop)
