#!/bin/bash
# WKAI - Workshop AI - Startup Script for WSL2/Kali Linux
# Usage: ./run-wkai.sh

set -e

BASE_DIR="$HOME/Projects/wkai"
BACKEND_DIR="$BASE_DIR/wkai-backend"
STUDENT_DIR="$BASE_DIR/wkai-student"
INSTRUCTOR_DIR="$BASE_DIR/wkai"

echo "=========================================="
echo "  WKAI - Workshop AI Startup Script"
echo "  Platform: WSL2/Kali Linux"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed."
    echo "Install with: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed."
    echo "Install with: sudo apt install -y docker.io"
    echo "Or use Docker Desktop with WSL2 integration."
    exit 1
fi

# Check if directories exist
if [ ! -d "$BACKEND_DIR" ] || [ ! -d "$STUDENT_DIR" ] || [ ! -d "$INSTRUCTOR_DIR" ]; then
    echo "ERROR: Project directories not found in $BASE_DIR"
    exit 1
fi

echo "[1/4] Starting databases (PostgreSQL + Redis)..."
cd "$BACKEND_DIR"
docker compose up -d

echo "      Waiting for databases to be ready..."
sleep 5

echo ""
echo "[2/4] Running database migrations (if needed)..."
npm run db:migrate || true

echo ""
echo "[3/4] Starting backend server..."
echo "      URL: http://localhost:4000"
npm run dev &
BACKEND_PID=$!
sleep 3

echo ""
echo "[4/4] Starting student web app..."
cd "$STUDENT_DIR"
echo "      URL: http://localhost:3000 (or 3001 if port in use)"
npm run dev &
STUDENT_PID=$!
sleep 3

echo ""
echo "=========================================="
echo "  Servers Started Successfully!"
echo "=========================================="
echo ""
echo "  Backend:       http://localhost:4000"
echo "  Student App:   http://localhost:3000"
echo "  Instructor:    Run 'npm run tauri:dev' in $INSTRUCTOR_DIR"
echo ""
echo "  To stop databases:  docker compose down"
echo "  To stop servers:    Press Ctrl+C or run ./stop-wkai.sh"
echo ""
echo "  Instructor app has its own window - start with:"
echo "    cd $INSTRUCTOR_DIR && npm run tauri:dev"
echo "=========================================="
echo ""

# Wait for both background processes
wait $BACKEND_PID $STUDENT_PID
