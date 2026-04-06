# WKAI — How to Run

Complete setup instructions for **WSL2/Kali Linux** and **Windows**.

---

## Prerequisites

### For WSL2/Kali Linux
```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Docker
sudo apt install -y docker.io
sudo usermod -aG docker $USER  # Log out and back in after this

# Or use Docker Desktop on Windows with WSL2 integration
```

### For Windows
1. **Node.js 20+** — https://nodejs.org/
2. **Docker Desktop** — https://docker.com/products/docker-desktop/
   - Enable WSL2 integration in Settings → Resources → WSL2
3. **Rust** — https://rustup.rs/ (run `rustup-init.exe`)
4. **Visual Studio Build Tools** — https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Select "Desktop development with C++" workload

---

## Quick Start

### WSL2/Kali Linux

```bash
# Run all servers (automated)
./run-wkai.sh
```

Or manually:
```bash
# Terminal 1 - Databases
cd ~/Projects/wkai/wkai-backend
docker compose up -d

# Terminal 2 - Backend
cd ~/Projects/wkai/wkai-backend
npm run db:migrate  # first time only
npm run dev

# Terminal 3 - Student App
cd ~/Projects/wkai/wkai-student
npm run dev

# Terminal 4 - Instructor App (optional - has GUI)
cd ~/Projects/wkai/wkai
npm run tauri:dev
```

### Windows (PowerShell)

```powershell
# Run all servers (automated)
.\run-wkai.bat
```

Or manually (open 4 separate PowerShell windows):

```powershell
# Window 1 - Databases
cd C:\Projects\WKAI\wkai\wkai-backend
docker compose up -d

# Window 2 - Backend
cd C:\Projects\WKAI\wkai\wkai-backend
npm run db:migrate  # first time only
npm run dev

# Window 3 - Student App
cd C:\Projects\WKAI\wkai\wkai-student
npm run dev

# Window 4 - Instructor App
cd C:\Projects\WKAI\wkai\wkai
npm run tauri icon -- --input ./icons/128x128.png  # first time only
npm run tauri:dev
```

---

## Access URLs

| Component | URL | Port |
|-----------|-----|------|
| Backend API | http://localhost:4000 | 4000 |
| Student Web App | http://localhost:3000 | 3000 |
| Instructor App | Desktop window | 1420 (internal) |

---

## First-Time Setup

### 1. Start Databases
```bash
cd wkai-backend
docker compose up -d
docker compose ps  # verify both show "running"
```

### 2. Configure Environment
```bash
cd wkai-backend
cp .env.example .env
# Edit .env and add your API keys:
# - GROQ_API_KEY (free at https://console.groq.com)
# - CLOUDINARY_* (free at https://cloudinary.com)
```

### 3. Run Database Migrations
```bash
cd wkai-backend
npm run db:migrate
```

### 4. Install Dependencies (all repos)
```bash
cd wkai-backend && npm install
cd ../wkai-student && npm install
cd ../wkai && npm install
```

---

## Using the App

### Starting a Workshop Session

1. **Open Instructor App** (desktop window from Tauri)
2. Fill in:
   - Instructor Name
   - Workshop Title
   - (Optional) Folder to watch for file sharing
3. Click **Start Session**
4. Copy the **6-character room code** (e.g., `A3F9KX`)

### Joining as Student

1. Open browser to http://localhost:3000
2. Enter the 6-character room code
3. Click **Join**
4. Wait for guide blocks to appear as instructor teaches

---

## Stopping Everything

### WSL2/Kali
```bash
# Stop databases
docker compose down

# Or use the stop script
./stop-wkai.sh
```

### Windows
```powershell
# Stop databases
docker compose down

# Press Ctrl+C in each PowerShell window to stop servers
```

---

## Troubleshooting

### Docker I/O Error (WSL2)
```
/bin/bash: line 1: /usr/bin/docker: Input/output error
```
**Fix:** Restart Docker Desktop on Windows, ensure WSL2 integration is enabled.

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::4000
```
**Fix:** Find and kill the process:
```bash
# WSL2
lsof -ti:4000 | xargs kill -9

# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F
```

### Tauri Icon Error (Windows)
```
error RC2176 : old DIB in icon.ico
```
**Fix:**
```powershell
npm run tauri icon -- --input ./icons/128x128.png
```

### Rust Build Fails (Windows)
**Fix:** Install Visual Studio Build Tools with "Desktop development with C++" workload.

### Student App Opens on Wrong Port
If port 3000 is in use, Vite auto-assigns 3001. Check the terminal output for the actual URL.

---

## Project Structure

```
~/Projects/wkai/          # WSL2
C:\Projects\WKAI\wkai\    # Windows

├── wkai/              # Instructor desktop app (Tauri + React)
├── wkai-backend/      # Backend server (Node.js + WebSocket)
└── wkai-student/      # Student web app (React + Vite)
```

---

## Support

For issues, check the main documentation:
- `WKAI_PROJECT_STRUCTURE.md` — Full architecture overview
- `WKAI_Qwen35_Prompt.md` — Complete project structure with AI stack details
