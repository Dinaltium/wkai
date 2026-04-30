#!/bin/bash
# WKAI - Workshop AI - Stop Script for WSL2/Kali Linux
# Usage: ./stop-wkai.sh

set -e

BASE_DIR="$HOME/Projects/wkai"
BACKEND_DIR="$BASE_DIR/wkai-backend"

echo "=========================================="
echo "  Stopping WKAI Servers..."
echo "=========================================="
echo ""

# Stop backend and student apps (kill node processes on relevant ports)
echo "[1/3] Stopping backend server (port 4000)..."
lsof -ti:4000 | xargs -r kill -9 2>/dev/null || true

echo "[2/3] Stopping student app (port 3000/3001)..."
lsof -ti:3000 | xargs -r kill -9 2>/dev/null || true
lsof -ti:3001 | xargs -r kill -9 2>/dev/null || true

echo "[3/3] Stopping database connections..."
# No Docker to stop. Backend will close connections on exit.

echo ""
echo "=========================================="
echo "  All WKAI servers stopped."
echo "=========================================="
