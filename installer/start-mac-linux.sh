#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "======================================================="
echo "  Starting Nuvio TV Server for Hisense VIDAA OS"
echo "======================================================="
echo ""

if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 could not be found. Please install Python 3."
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "[TIP] Running without sudo. Direct web server on port 4173 will start."
    echo "[TIP] (For TV Home Screen Launcher installer on port 53/443, re-run with sudo)."
    echo ""
    python3 server.py 2>/dev/null || python3 installer/server.py
else
    python3 server.py 2>/dev/null || python3 installer/server.py
fi
