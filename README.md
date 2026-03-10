# **🤖 Agentic AI Coder & SAP Controller (Modular V2)**

🌱 **A Personal Journey:** This repository represents my personal journey learning how to code and build Artificial Intelligence systems. I started this project to understand local LLMs, Node.js, and homelab architecture. What began as a simple script has evolved into a modular, voice-activated AI Agent and System Administrator. This code documents my progress, my mistakes, and my "aha\!" moments. I hope it inspires others learning to build their own AI companions\!

An autonomous Node.js Telegram bot that acts as a Linux System Administrator, a C/Python Coder, and an Enterprise SAP Controller. **Note: This agent is accessed exclusively via the Telegram app—there is no Web UI or Terminal User Interface (TUI).** Powered by local LLMs (Ollama) and designed with a highly extensible **Plug-n-Play Skill Registry**.

## **🚀 Core Capabilities**

* **Dynamic Skill Registry:** Simply drop a new folder into skills/ with a skill.js and skill.md, and the bot automatically learns how to use it on boot\! No core code edits required.  
* **Stateful CLI:** Tracks its Current Working Directory (CWD). If you cd sandbox, it stays there for subsequent commands. Includes a safe-list for auto-execution and a Telegram confirmation button for unknown commands.  
* **Secure Sandbox Generation:** AI-generated scripts are securely sanitized and written exclusively to the sandbox/ directory, preventing directory traversal attacks. Markdown formatting is automatically stripped so code is instantly executable.  
* **🔌 Enterprise SAP Integration (Hybrid Architecture):**  
  * **RFC Mode:** Securely connects to SAP backends via TCP/RFC (node-rfc \+ SAP C++ SDK) to pull headless data straight from the database. Supported modules include:  
    * **ST22 Shortdumps:** Analyzes ABAP memory crashes.  
    * **SLG1 Application Logs:** Extracts and translates complex SAP business process failures.  
  * **GUI Mode:** Triggers a visible SAP window on a remote Windows host via SSH and Scheduled Tasks to execute legacy GUI automation using VBScript.  
* **Hardware-Optimized AI & ChatML Injection:** The SAP AI analyzer features strict prompt locking, token truncation (num\_predict), and **ChatML context injection** specifically engineered to prevent 4B parameter models (like Qwen) from getting stuck in infinite \<think\> loops when summarizing C++ kernel traces or SLG1 network errors.  
* **Auto-Cleaning Logger:** Custom logging engine that prepends timestamps, creates daily log files in logs/. Retention period is configurable via .env.  
* **Voice / TTS / STT:** Generates Text-to-Speech audio replies dynamically, and uses a dedicated CPU microservice to transcribe incoming voice notes via Whisper (small.en model).

## **📂 Project Structure**

/agent-browser  
  ├── bot.js                  \# The Core Brain / Router  
  ├── prompts/  
  │    └── system\_prompt.txt  \# The base instructions for the LLM  
  ├── helpers/  
  │    ├── commandHandler.js  \# Telegram slash commands (/safe, /clear)  
  │    ├── cronHelper.js      \# Scheduling logic  
  │    ├── logger.js          \# Custom environment-aware logging  
  │    └── voiceHelper.js     \# TTS Engine and STT API integrations  
  ├── skills/                 \# DYNAMIC PLUG-N-PLAY CAPABILITIES  
  │    ├── cli/               \# e.g., skill.js and skill.md  
  │    ├── news/  
  │    ├── sap/               \# Includes modular sub-routing for RFC vs GUI  
  │    ├── sheets/  
  │    ├── weather/  
  │    └── write\_file/  
  ├── sap\_abap\_sources/       \# Documentation & ABAP Code for the SAP Backend  
  ├── stt-microservice/       \# Source code backup for the Whisper STT LXC  
  ├── logs/                   \# Auto-generated daily logs (Ignored in Git)  
  ├── data/                   \# Persistent memory and settings (Ignored in Git)  
  └── sandbox/                \# Workspace for AI-generated code (Ignored in Git)

## **🗣️ Usage Examples (Text & Voice)**

You can send these requests to the bot via **Text Message** or by holding down the **Microphone Button** to send a Voice Note\!

* **CLI Skill:** run pwd or cd sandbox or ls \-la  
* **Write File Skill:** write a python script named hello.py that prints hello world  
* **Weather Skill:** what is the weather in London?  
* **News Skill:** get me the latest tech news  
* **SAP Skill (RFC):** get me the latest SAP shortdumps  
* **SAP Skill (RFC):** Check the SLG1 logs for object ZAGENT subobject TEST  
* **SAP Skill (GUI):** check ST22 in SAP  
* **TTS Generation:** say "Initialization complete" in a voice note

## **🛠️ Installation & Setup (Main Node.js LXC)**

### **1\. SAP C++ SDK Prerequisites (Linux)**

To use the SAP RFC module, you must download (please check SAP Note 2573790\) the proprietary SAP NW RFC SDK (7.50+) from the SAP Support Portal and install it on your Linux container:

\# Extract to /usr/local/sap/nwrfcsdk  
sudo nano /etc/ld.so.conf.d/nwrfcsdk.conf \# Add path to lib directory  
sudo ldconfig

### **2\. Clone & Install**

git clone \<repository\_url\>  
cd agent-browser  
npm install

### **3\. Configure Environment variables**

Rename .env.example to .env (or create a new .env file) and populate it:

\# \==========================================  
\# 1\. CORE TELEGRAM & MEMORY CONFIG  
\# \==========================================  
TELEGRAM\_TOKEN=your\_telegram\_bot\_token  
MEMORY\_LIMIT=30

\# \==========================================  
\# 2\. LOCAL AI / OLLAMA CONFIG  
\# \==========================================  
OLLAMA\_IP=your\_own\_ip\_address
OLLAMA\_MODEL=qwen3.5:4b

\# \==========================================  
\# 3\. WINDOWS HOST CONFIG (For SAP GUI Automation)  
\# \==========================================  
WINDOWS\_HOST=your\_own\_ip\_address  
WINDOWS\_USER=your\_windows\_admin\_user

\# \==========================================  
\# 4\. SAP CREDENTIALS (RFC & GUI Injection)  
\# \==========================================  
SAP\_HOST=your\_own\_ip\_address  
SAP\_SYSTEM=NPL  
SAP\_CLIENT=001  
SAP\_USER=your\_actual\_username  
SAP\_PASSWORD=your\_actual\_password

\# \==========================================  
\# 5\. LOGGING & MICROSERVICES  
\# \==========================================  
LOG\_RETENTION\_DAYS=7  
STT\_SERVER\_URL=your\_own\_ip\_address

### **4\. Start the bot**

node bot.js \--debug

## **🎙️ Installation (STT Whisper Microservice LXC)**

To keep the AI GPU free, Speech-to-Text runs on a separate CPU-only Ubuntu LXC. We use the small.en model which provides exceptional accuracy for accents.

\# Install dependencies  
apt update && apt install \-y curl build-essential ffmpeg git python3 make g++ wget  
curl \-fsSL \[https://deb.nodesource.com/setup\_20.x\](https://deb.nodesource.com/setup\_20.x) | bash \-  
apt install \-y nodejs

\# Deploy Code  
mkdir \-p \~/stt-microservice && cd \~/stt-microservice  
npm init \-y  
npm install express multer fluent-ffmpeg whisper-node

\# Start via PM2  
npm install \-g pm2  
pm2 start server.js \--name stt-server  
pm2 startup  
pm2 save

## **🪟 Installation (Windows SAP GUI Host)**

To allow the Node.js Linux Agent to control the SAP GUI visually, you must bypass Windows **Session 0 Isolation**. If you try to run SAP GUI directly via an SSH command, it will open invisibly in the background (Session 0\) and the VBScript automation will fail.

**1\. Install OpenSSH Server on Windows (Run as Admin in PowerShell):**

Add-WindowsCapability \-Online \-Name OpenSSH.Server\~\~\~\~0.0.1.0  
Start-Service sshd  
Set-Service \-Name sshd \-StartupType 'Automatic'

**2\. Configure the SSH Key Bypass:**

Generate an SSH key on the Linux LXC (ssh-keygen) and copy the public key to C:\\Users\\YourUser\\.ssh\\authorized\_keys on the Windows host so the bot can connect passwordlessly.

**3\. The Session 0 Bypass (Scheduled Task):**

1. Open Windows **Task Scheduler**.  
2. Create a new Task named RunSAPAuto.  
3. Set the security option to: **"Run only when user is logged on"** (CRITICAL: This forces the task into the visible desktop session, bypassing Session 0).  
4. **Action:** Start a program. Point it to your VBScript handler.  
5. In your Node.js Bot, execute the task over SSH like this:  
   ssh user@windowshost "schtasks /run /tn \\"RunSAPAuto\\""

## **🖥️ Homelab & Hardware Specs**

For those curious about the hardware running this local AI architecture, here is the setup:

* **Hypervisor:** Proxmox VE  
* **AI Node:** Ollama Server running qwen3.5:4b  
* **Main Bot Node:** Ubuntu LXC  
* **STT Node:** Ubuntu LXC (CPU-only, running whisper-node small.en model)  
* **SAP Host:** Remote Windows VM for GUI Automation  
* **CPU:** Intel Core i5  
* **RAM:** 16GB  
* **GPU (For Ollama):** NVIDIA GTX 1060 (6GB VRAM)