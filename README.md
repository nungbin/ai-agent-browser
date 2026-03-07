🤖 Agentic AI Coder & SAP Controller

An autonomous Node.js Telegram bot that acts as a Linux System Administrator, a C/Python Coder, and a Remote SAP GUI Controller.

🚀 Core Capabilities

Sandbox Coding: All generated files (.c, .py, .txt) are isolated in the sandbox/ folder.

Stateful CLI: The bot tracks its Current Working Directory (CWD). If you cd sandbox, it stays there for subsequent commands.

AI Cold-Start Fix: Uses keep_alive: -1 to keep the LLM in VRAM for instant responses.

Hybrid SAP Control: - GUI Mode: Triggered when a T-Code is detected. Uses SSH + Windows Task Scheduler + VBScript to pop a visible SAP window.

RFC Mode: Triggered for general SAP queries without a T-Code. (Placeholder for headless data fetching).

🛠️ Remote SAP Setup (Windows Host)

To enable the bot to control SAP GUI visibly on a Windows machine, you need to set up the remote listener scripts provided in this repository.

Copy the Master Script:

Take the sap_master.vbs file from the Windows_Script/ folder in this repository.

Copy it to your Windows machine and place it at: C:\SAP_Bots\sap_master.vbs

Create the Script Library:

On the Windows machine, create an empty folder at C:\SAP_Bots\scripts\.

(You can save recorded SAP GUI VBScripts here named after their T-Codes, e.g., ST22.vbs, and the master script will automatically run them!)

Create the Windows Scheduled Task:

Open Task Scheduler on Windows and create a new task named LaunchSAP_NPL.

Security Options: Check "Run only when user is logged on" (This is critical to bypass Session 0 isolation and make the GUI visible).

Actions: Start a program

Program/script: wscript.exe

Add arguments: "C:\SAP_Bots\sap_master.vbs"

📥 Installation (Linux LXC / Host)

Clone this repository and install dependencies:

npm install


Create a .env file in the root directory and configure it:

# Telegram Config
TELEGRAM_TOKEN=your_telegram_bot_token
OLLAMA_IP=192.168.1.105
OLLAMA_MODEL=qwen3.5:4b

# Remote Windows Host (Where SAP GUI is installed)
WINDOWS_HOST=192.168.1.116
WINDOWS_USER=hpa6

# SAP System Credentials
SAP_SYSTEM=NPL
SAP_CLIENT=001
SAP_USER=bshu
SAP_PASSWORD=your_actual_password


Ensure you have SSH Key-Based Authentication set up between your Linux machine and the Windows Host (so the bot doesn't get stuck waiting for a password prompt).

Start the bot:

node bot.js --debug


(Note: The bot includes an Ollama health check on startup to verify the LLM is loaded into VRAM before accepting messages).