# 🤖 Agentic AI Coder & SAP Controller (Modular V2)

> 🌱 **A Personal Journey:** This repository represents my personal journey learning how to code and build Artificial Intelligence systems. I started this project to understand local LLMs, Node.js, and homelab architecture. What began as a simple script has evolved into a modular, voice-activated AI Agent and System Administrator. This code documents my progress, my mistakes, and my "aha!" moments. I hope it inspires others learning to build their own AI companions!

An autonomous Node.js Telegram bot that acts as a Linux System Administrator, a C/Python Coder, and a Remote SAP GUI Controller. **Note: This agent is accessed exclusively via the Telegram app—there is no Web UI or Terminal User Interface (TUI).** Powered by local LLMs (Ollama) and designed with a highly extensible **Plug-n-Play Skill Registry**.

## 🚀 Core Capabilities
- **Dynamic Skill Registry:** Simply drop a new folder into `skills/` with a `skill.js` and `skill.md`, and the bot automatically learns how to use it on boot! No core code edits required.
- **Stateful CLI:** Tracks its Current Working Directory (CWD). If you `cd sandbox`, it stays there for subsequent commands. Includes a safe-list for auto-execution and a Telegram confirmation button for unknown commands.
- **Secure Sandbox Generation:** AI-generated scripts are securely sanitized and written exclusively to the `sandbox/` directory, preventing directory traversal attacks. Markdown formatting is automatically stripped so code is instantly executable.
- **Hybrid SAP Control:** Triggers a visible SAP window on a remote Windows host via SSH and Scheduled Tasks (GUI Mode), or prepares for headless data retrieval (RFC Mode).
- **Auto-Cleaning Logger:** Custom logging engine that prepends timestamps, creates daily log files in `logs/`. Retention period is configurable via `.env`.
- **Voice / TTS / STT:** Generates Text-to-Speech audio replies dynamically, and uses a dedicated CPU microservice to transcribe incoming voice notes via Whisper.

---

## 📂 Project Structure

```text
/agent-browser
  ├── bot.js                  # The Core Brain / Router
  ├── prompts/
  │    └── system_prompt.txt  # The base instructions for the LLM
  ├── helpers/
  │    ├── commandHandler.js  # Telegram slash commands (/safe, /clear)
  │    ├── cronHelper.js      # Scheduling logic
  │    ├── logger.js          # Custom environment-aware logging
  │    └── voiceHelper.js     # TTS Engine and STT API integrations
  ├── skills/                 # DYNAMIC PLUG-N-PLAY CAPABILITIES
  │    ├── browser/           # Puppeteer web scraping (WIP)
  │    ├── cli/               # e.g., skill.js and skill.md
  │    ├── news/
  │    ├── sap/
  │    ├── sheets/
  │    ├── weather/
  │    └── write_file/
  ├── stt-microservice/       # Source code backup for the Whisper STT LXC
  ├── logs/                   # Auto-generated daily logs (Ignored in Git)
  ├── data/                   # Persistent memory and settings (Ignored in Git)
  └── sandbox/                # Workspace for AI-generated code (Ignored in Git)
```

---

## 🗣️ Usage Examples (Text & Voice)

You can send these requests to the bot via **Text Message** or by holding down the **Microphone Button** to send a Voice Note!

- **CLI Skill:** `run pwd` or `cd sandbox` or `ls -la`
- **Write File Skill:** `write a python script named hello.py that prints hello world`
- **Weather Skill:** `what is the weather in London?`
- **News Skill:** `get me the latest tech news`
- **SAP Skill (GUI):** `check ST22 in SAP`
- **TTS Generation:** `say "Initialization complete" in a voice note` or `how are you doing today? please speak your reply.`

### ⚠️ Under Construction (Not Tested)
- **Sheets Skill:** `read the latest row from my google sheet` *(Not Tested)*
- **SAP Skill (RFC):** `query the latest sales orders in SAP` *(Not Tested)*
- **Browser Skill:** `go to google.com and scrape the headlines` *(Not Tested)*

---

## 🛠️ Installation & Setup (Main Bot LXC)

1. **Clone & Install:**
```bash
git clone <repository_url>
cd agent-browser
npm install
```

2. **Configure Environment variables:**
Rename `.env.example` to `.env` (or create a new `.env` file) and populate it:
```env
# ==========================================
# 1. CORE TELEGRAM & MEMORY CONFIG
# ==========================================
TELEGRAM_TOKEN=your_telegram_bot_token
MEMORY_LIMIT=30

# ==========================================
# 2. LOCAL AI / OLLAMA CONFIG
# ==========================================
OLLAMA_IP=192.168.1.105
OLLAMA_MODEL=qwen3.5:4b

# ==========================================
# 3. WINDOWS HOST CONFIG (For SAP GUI Automation)
# ==========================================
WINDOWS_HOST=192.168.1.116
WINDOWS_USER=your_windows_admin_user

# ==========================================
# 4. SAP CREDENTIALS (Cold Start Injection)
# ==========================================
SAP_SYSTEM=NPL
SAP_CLIENT=001
SAP_USER=your_actual_username
SAP_PASSWORD=your_actual_password

# ==========================================
# 5. LOGGING & MICROSERVICES
# ==========================================
LOG_RETENTION_DAYS=7
STT_SERVER_URL="[http://192.168.1.156:3000/transcribe](http://192.168.1.156:3000/transcribe)"
```

3. **Start the bot:**
```bash
node bot.js --debug
```

---

## 🎙️ Installation (STT Whisper Microservice LXC)
To keep the AI GPU free, Speech-to-Text runs on a separate CPU-only Ubuntu LXC. We use the `small.en` model which provides exceptional accuracy for accents.

1. **Setup the Container:**
```bash
apt update && apt install -y curl build-essential ffmpeg git python3 make g++ wget
curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | bash -
apt install -y nodejs
```

2. **Deploy the Code:**
Copy the code from this repository's `stt-microservice/server.js` to the new LXC, then run:
```bash
mkdir -p ~/stt-microservice
cd ~/stt-microservice
npm init -y
npm install express multer fluent-ffmpeg whisper-node

# Pre-download the high-accuracy model (Type 'small.en' when prompted)
npx whisper-node download
```

3. **Run on Boot (PM2):**
Make sure you are in the correct directory before starting PM2!
```bash
cd ~/stt-microservice
npm install -g pm2

# Start the server (PM2 saves the absolute path of your current folder)
pm2 start server.js --name stt-server

# Generate the boot script
pm2 startup
# IMPORTANT: Copy and paste the command that PM2 outputs on your screen and run it!

# Save the configuration so it boots on next restart
pm2 save
```

## 🖥️ My Homelab & Hardware Specs
For those curious about the hardware running this local AI architecture, here is my setup:

* **Hypervisor:** Proxmox VE
* **AI Node:** Ollama Server running `qwen3.5:4b`
* **Main Bot Node:** Ubuntu LXC
* **STT Node:** Ubuntu LXC (CPU-only, running `whisper-node` small.en model)
* **SAP Host:** Remote Windows VM for GUI Automation
* **CPU:** Intel Core i5
* **RAM:** 16GB
* **GPU (For Ollama):** NVIDIA GTX 1060 (6GB VRAM)
