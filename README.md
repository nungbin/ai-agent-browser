🤖 Agentic AI Coder & SAP Controller (Modular V2)

An autonomous Node.js Telegram bot that acts as a Linux System Administrator, a C/Python Coder, and a Remote SAP GUI Controller. Powered by local LLMs (Ollama) and designed with a highly extensible Plug-n-Play Skill Registry.

🚀 Core Capabilities

Dynamic Skill Registry: Simply drop a new folder into skills/ with a skill.js and skill.md, and the bot automatically learns how to use it on boot! No core code edits required.

Stateful CLI: Tracks its Current Working Directory (CWD). If you cd sandbox, it stays there for subsequent commands. Includes a safe-list for auto-execution and a Telegram confirmation button for unknown commands.

Hybrid SAP Control: - GUI Mode: Triggers a visible SAP window on a remote Windows host via SSH and Scheduled Tasks.

RFC Mode: Placeholder for headless data retrieval.

Auto-Cleaning Logger: Custom logging engine that prepends timestamps, creates daily log files in logs/, and automatically deletes files older than 7 days.

Voice / TTS: Generates Text-to-Speech audio replies dynamically.

📂 Project Structure

/agent-browser
  ├── bot.js                  # The Core Brain / Router
  ├── prompts/
  │    └── system_prompt.txt  # The base instructions for the LLM
  ├── helpers/
  │    ├── commandHandler.js  # Telegram slash commands (/safe, /clear)
  │    ├── cronHelper.js      # Scheduling logic
  │    ├── logger.js          # Custom 7-day retention logging
  │    └── voiceHelper.js     # TTS Engine
  ├── skills/                 # DYNAMIC PLUG-N-PLAY CAPABILITIES
  │    ├── cli/               # e.g., skill.js and skill.md
  │    ├── news/
  │    ├── sap/
  │    ├── sheets/
  │    ├── weather/
  │    └── write_file/
  ├── logs/                   # Auto-generated daily logs (Ignored in Git)
  ├── data/                   # Persistent memory and settings (Ignored in Git)
  └── sandbox/                # Workspace for AI-generated code (Ignored in Git)


🛠️ Remote SAP Setup (Windows Host)

To enable the bot to control SAP GUI visibly on a Windows machine:

Copy sap_master.vbs from this repo's Windows_Script/ folder to C:\SAP_Bots\sap_master.vbs on Windows.

Create an empty folder at C:\SAP_Bots\scripts\.

Create a Scheduled Task named LaunchSAP_NPL:

Action: wscript.exe "C:\SAP_Bots\sap_master.vbs"

Security: "Run only when user is logged on" (Interactive mode).

📥 Installation (Linux LXC / Host)

Clone this repository:

git clone <repository_url>
cd agent-browser
npm install


Configure .env:

TELEGRAM_TOKEN=your_telegram_bot_token
OLLAMA_IP=192.168.1.105
OLLAMA_MODEL=qwen3.5:4b
WINDOWS_HOST=192.168.1.116
WINDOWS_USER=hpa6
SAP_SYSTEM=NPL
SAP_CLIENT=001
SAP_USER=
SAP_PASSWORD=your_actual_password


Start the bot:

node bot.js --debug
