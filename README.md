# **🤖 Agentic AI Coder & SAP Controller (Modular V2)**

🌱 **A Personal Journey:** This repository represents my personal journey learning how to code and build Artificial Intelligence systems. I started this project to understand local LLMs, Node.js, and homelab architecture. What began as a simple script has evolved into a modular, voice-activated AI Agent and System Administrator. This code documents my progress, my mistakes, and my "aha!" moments. I hope it inspires others learning to build their own AI companions!

An autonomous Node.js Telegram bot that acts as a Linux System Administrator, a C/Python Coder, an Enterprise SAP Controller, and a Stateful Assistant. **Note: While primarily accessed via the Telegram app, this agent now includes a decoupled Enterprise SAPUI5 Web Dashboard designed for macro-recording and RPA bot training.** Powered by local LLMs (Ollama) and designed with a highly extensible **Plug-n-Play Skill Registry**.

## **🚀 Core Capabilities**

* **Dynamic Skill Registry:** Simply drop a new folder into `skills/` with a `skill.js` and `skill.md`, and the bot automatically learns how to use it on boot! No core code edits required.  
* **🗣️ Dynamic Wake-Word Persona ("Veronica"):** By default, the core routing AI acts strictly robotic to ensure 100% JSON accuracy and prevent hallucinations. However, if the user explicitly uses the wake-word "Veronica," the core brain seamlessly delegates a `usePersona` flag to the target skill, allowing the bot to reply with a friendly, conversational personality for that specific request without breaking the underlying architecture.  
* **📊 Interactive Google Sheets (AppSheet Backend):** A modular architecture that turns Google Sheets into a headless database for the Telegram bot.  
  * **Sheet Aliasing:** Turns the Telegram bot into a stateful AppSheet clone with dynamic UI generation (inline keyboards) when parameters are missing.  
  * **Collision-Proof IDs:** Generates AppSheet-compatible unique 8-character hex IDs via Node.js crypto with pre-append collision checks.  
  * **Stateful Flow without DBs:** Passes complex state directly through Telegram's hidden `callback_data` payloads, avoiding the need for external session databases.  
* **🌐 Serverless UI5 Architecture (Fiori + Google Sheets DB):** Features a decoupled Enterprise SAPUI5 frontend (`ui5-apps/dashboard`) built with dynamic XML fragments, JSON model binding, and strict expression binding.  
  * **Headless REST DB:** Utilizes Google Apps Script as a serverless REST API (`doGet` and `doPost`), allowing the UI5 frontend to perform instant CRUD operations directly against a Google Sheet. No traditional SQL database required.  
  * *Note on Version Control:* The Google Apps Script backend code can be synced directly to this GitHub repository using Google's `clasp` (Command Line Apps Script Projects) tool.  
* **Stateful CLI:** Tracks its Current Working Directory (CWD). If you `cd sandbox`, it stays there for subsequent commands. Includes a safe-list for auto-execution and a Telegram confirmation button for unknown commands.  
* **Secure Sandbox Generation:** AI-generated scripts are securely sanitized and written exclusively to the `sandbox/` directory, preventing directory traversal attacks. Markdown formatting is automatically stripped so code is instantly executable.  
* **🔌 Enterprise SAP Integration (Hybrid Architecture):** * **RFC Mode:** Securely connects to SAP backends via TCP/RFC (`node-rfc` + SAP C++ SDK) to pull headless data straight from the database. (e.g., ST22 Shortdumps, SLG1 Application Logs).  
  * **REST Mode:** Connects to SAP via OData/HTTP APIs.  
  * **Desktop GUI Mode (Dynamic VBScript via WebSockets):** Connects to a remote Windows host (e.g., Surface Pro) via a persistent socket.io connection. The Linux Brain beams JSON payloads with strict positional routing to the Windows Client, which dynamically spawns the correct VBScript "Surgeon" to physically drive the SAP GUI (e.g., User Creation via SU01, Headless ABAP Injection via SE38) and streams the console output back to Telegram.  
  * **Web GUI Mode (Web RPA via Puppeteer):** Uses the same WebSocket connection to trigger physical, human-emulated web automation (Puppeteer) on the Windows Host. Includes visual element scanning, exact coordinate clicking, and asynchronous batch queue processing for complex SAP Fiori/UI5 dashboards.  
* **Hardware-Optimized AI & ChatML Injection:** The SAP AI analyzer features strict prompt locking, token truncation (`num_predict`), and **ChatML context injection** specifically engineered to prevent 4B parameter models (like Qwen) from getting stuck in infinite `<think>` loops when summarizing C++ kernel traces or SLG1 network errors.  
* **Auto-Cleaning Logger:** Custom logging engine that prepends timestamps, creates daily log files in `logs/`. Retention period is configurable via `.env`.  
* **Voice / TTS / STT:** Generates Text-to-Speech audio replies dynamically, and uses a dedicated CPU microservice to transcribe incoming voice notes via Whisper (`small.en` model). Includes rich Telegram UI progress bars.

## **📂 Project Structure**

```text
/agent-browser              
  ├── bot.js                  # The Core Brain / Router / Wake-Word Detector            
  ├── google-credentials.json # Service Account keys for Google APIs (Ignored in Git)            
  ├── prompts/              
  │    └── system_prompt.txt  # The base instructions for the LLM              
  ├── helpers/              
  │    ├── commandHandler.js  # Telegram slash commands (/safe, /clear)              
  │    ├── cronHelper.js      # Scheduling logic              
  │    ├── logger.js          # Custom environment-aware logging              
  │    ├── voiceHelper.js     # TTS Engine and STT API integrations           
  │    └── socketManager.js   # WebSocket server for Windows RPA (Surface Pro)            
  ├── skills/                 # DYNAMIC PLUG-N-PLAY CAPABILITIES              
  │    ├── abap_developer/    # 🛠️ Headless MCP ABAP Agent (Logic & Gemini Pacing)
  │    │    ├── skill.js      # Single-Pass execution & Rate Limit protection
  │    │    └── skill.md      # Tool definitions for the AI Architect  
  │    ├── batch_dashboard_testing/ # Web RPA skill for SAP Fiori Dashboard Batch Processing  
  │    ├── cli/               # e.g., skill.js and skill.md              
  │    ├── news/              
  │    ├── sap/              
  │    │    ├── skill.js      # Main SAP routing switchboard            
  │    │    ├── skill.md      # Instructions for the AI regarding SAP JSON schemas          
  │    │    ├── gui_modules/  # Windows RPA WebSocket modules          
  │    │    │    └── sapgui.js            
  │    │    ├── rfc_modules/  # node-rfc headless extraction modules          
  │    │    └── rest_modules/ # HTTP/OData extraction modules          
  │    ├── sheets/              
  │    │    ├── skill.js      # Switchboard for sheet aliasing            
  │    │    └── modules/            
  │    │         └── grocery.js # Handles AppSheet logic & Telegram UI buttons            
  │    ├── weather/              
  │    └── write_file/           
  ├── ui5-apps/               # 🌐 ENTERPRISE FRONTENDS & RPA TRAINING GYM    
  │    └── dashboard/         # SAP Fiori UI5 App (Dynamic Fragments & JSON Binding)    
  ├── windows_robot/          # 🪟 Windows RPA Client (Copy this folder to Surface Pro)          
  │    ├── client.js          # Listens for payloads; runs dynamic VBScripts AND Puppeteer Chrome automation          
  │    ├── surgeon.vbs        # VBScript that physically drives SAP GUI (SU01)          
  │    ├── se38_creator.vbs   # VBScript for headless ABAP program injection (SE38)        
  │    ├── se11_creator.vbs   # VBScript for Data Dictionary structure generation (SE11)      
  │    ├── package.json       # Node dependencies for the client          
  │    └── package-lock.json            
  ├── sap_abap_sources/       # Documentation & ABAP Code for the SAP Backend              
  ├── stt-microservice/       # Source code backup for the Whisper STT LXC              
  ├── logs/                   # Auto-generated daily logs (Ignored in Git)              
  ├── data/                   # Persistent memory and settings (Ignored in Git)              
  └── sandbox/                # Workspace for AI-generated code (Ignored in Git)
```

## **🗣️ Usage Examples (Text & Voice)**

You can send these requests to the bot via **Text Message** or by holding down the **Microphone Button** to send a Voice Note!

* **Headless ABAP Agent:** `Veronica, use your ABAP agent to create an SE11 structure named ZST_TEST_MCP with two fields: ID (INT4) and NAME (CHAR40).`
* **CLI Skill:** `run pwd` or `cd sandbox` or `ls -la`  
* **Write File Skill:** `write a python script named hello.py that prints hello world`  
* **Weather Skill:** `what is the weather in London?`  
* **News Skill:** `get me the latest tech news`  
* **Sheets Skill:** `add apples to the grocery list` (Will trigger dynamic UI buttons)  
* **Wake-Word Persona:** `Veronica, add apples to the grocery list` (Will reply conversationally)  
* **SAP Skill (RFC):** `get me the latest SAP shortdumps`  
* **SAP Skill (RFC):** `Check the SLG1 logs for object ZAGENT subobject TEST`  
* **SAP Skill (Desktop GUI):** `Run tcode su01 to create user TEST1` (Triggers Windows Robot over WebSockets)  
* **SAP Skill (Desktop GUI):** `Run se38 to create a program named ZHELLO_WORLD` (Injects ABAP headlessly)  
* **Web RPA Skill (Puppeteer):** `Veronica, process the RPA queue` (Drives Chrome locally on the Windows Robot to automate Fiori dashboards based on Google Sheets queue).  
* **TTS Generation:** `say "Initialization complete"` in a voice note

## **🛠️ Installation & Setup (Main Node.js LXC)**

### **1. SAP ADT & MCP Prerequisites**
The ABAP Architect requires the Model Context Protocol SDK and the ADT Core bridge.
```bash
npm install @modelcontextprotocol/sdk @mcp-abap-adt/core
```

### **2. SAP C++ SDK Prerequisites (Linux)**

To use the SAP RFC module, you must download (please check SAP Note 2573790) the proprietary SAP NW RFC SDK (7.50+) from the SAP Support Portal and install it on your Linux container:

```bash
# Extract to /usr/local/sap/nwrfcsdk  
sudo nano /etc/ld.so.conf.d/nwrfcsdk.conf # Add path to lib directory  
sudo ldconfig
```

### **3. Google Sheets API Prerequisites**

Go to the Google Cloud Console, enable the **Google Sheets API**, and create a Service Account. Download the JSON key file, rename it to `google-credentials.json`, and place it in the root directory. Share your target Google Sheet with the Service Account email address as an Editor.

### **4. Clone & Install**

```bash
git clone <repository_url>  
cd agent-browser  
npm install  
npm install socket.io # Required for the Windows Robot connection
```

### **5. Configure Environment variables**

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
OLLAMA_IP=your_ollama_ip_address
OLLAMA_MODEL=qwen3.5:4b

# ==========================================
# 3. WINDOWS HOST CONFIG (For SAP GUI Automation)
# ==========================================
WINDOWS_HOST=your_own_Windows_ip_address
WINDOWS_USER=your_windows_admin_user

# ==========================================
# 4. SAP CREDENTIALS (Cold Start Injection)
# ==========================================
SAP_HOST=your_own_SAP_Server_ip_address
SAP_SYSTEM=NPL
SAP_CLIENT=001
SAP_USER=your_actual_username
SAP_PASSWORD=your_actual_password

# ==========================================
# 5. LOGGING & MICROSERVICES
# ==========================================
LOG_RETENTION_DAYS=7
STT_SERVER_URL=your_own_STT_Server_ip_address

# ==========================================
# 6. AI PERSONA & IDENTITY
# ==========================================
BOT_NAME=Veronica
USER_NAME=Tony
BOT_PERSONA=You are an incredibly intelligent, highly efficient AI assistant named Veronica. You manage server systems and provide answers for Tony. You speak respectfully, but you always include a touch of dry, sarcastic humor.

# ==========================================
# 7. RPA DASHBOARD & QUEUE
# ==========================================
DASHBOARD_URL="http://your_linux_ip:8080/index.html"
SHEET_ID_BATCH_DASHBOARD_TESTING="your_44_character_sheet_id_here"
SHEET_ID_GROCERY="your_44_character_sheet_id_here"

# ==========================================
# 8. ABAP AI CODER CONFIG (MCP + GEMINI)
# ==========================================
SAP_SYSTEM_URL=your_own_SAP_Server_ip_address:8000
GEMINI_API_KEY=put_your_free_google_ai_studio_key_here
MCP_ABAP_COMMAND=node ./node_modules/@mcp-abap-adt/core/bin/mcp-abap-adt.js
```

### **6. Start the bot**

```bash
node bot.js --debug
```

### **7. UI5 Dashboard & Google Sheets Database Setup**

To run the decoupled SAPUI5 frontend and its serverless Apps Script backend:

1. **The Database:** Create a Google Sheet with tabs for each dynamic view (e.g., 2022, 2021). Establish column headers matching your UI5 model (e.g., LastName, FirstName).  
2. **The REST API:** Open **Extensions > Apps Script** in your Google Sheet. Add your `doGet()` and `doPost()` methods to parse and serve the sheet data. Click **Deploy > New Deployment** as a **Web App** with access set to "Anyone".  
3. **The Frontend:** Open `/ui5-apps/dashboard/webapp/controller/View1.controller.js` and update the `_sApiUrl` variable with your new Google Web App URL.  
4. **Run Locally:** Navigate into the `ui5-apps/dashboard` directory and run your preferred local web server (or `ui5 serve` if using the UI5 Tooling CLI).

## **🪟 Installation (Windows SAP GUI & Web RPA Robot)**

To allow the Node.js Linux Agent to control the SAP GUI and Web Dashboards visually without Windows Session 0 Isolation issues, this project utilizes a **WebSocket Architecture**.

### **Prerequisites: Enable SAP GUI Scripting & Editor Settings**

Before the VBScript can interact with SAP, you must properly configure the environment:

1. **Server-side Scripting:** Log into your SAP system, run transaction code **RZ11**, search for the profile parameter `sapgui/user_scripting`, and change its value to `TRUE`.  
2. **Client-side Scripting:** Open SAP Logon on the Windows host, go to Options -> Accessibility & Scripting -> Scripting, and check "Enable scripting". Uncheck the notification options below it to prevent popup interruptions.  
3. **Headless SE38 Injection:** For the bot to successfully write ABAP code headlessly, log into SAP manually, go to transaction SE38 -> Utilities -> Settings -> ABAP Editor, and change the editor to **Front-End Editor (Plain text)**.

### **Client Setup**

1. Copy the `windows_robot/` folder from this repository to your Windows machine (e.g., your Surface Pro).  
2. Install **Node.js** and **Google Chrome** on the Windows machine.  
3. Open a Command Prompt inside the `windows_robot` folder and install the dependencies (Puppeteer is required for Web RPA):  
   ```bash
   npm install socket.io puppeteer socket.io-client
   ```
4. Open `client.js` in a text editor and ensure the `linuxBrainIP` variable points to your Linux LXC's IP address (e.g., `http://<your_linux_ip>:3000`).  
5. Run the client!  
   ```bash
   node client.js
   ```

The Windows Robot will now securely connect to the Linux Brain and idle silently in the background until Telegram beams a JSON payload to it!

## **🎙️ Installation (STT Whisper Microservice LXC)**

To keep the AI GPU free, Speech-to-Text runs on a separate CPU-only Ubuntu LXC. We use the `small.en` model which provides exceptional accuracy for accents.

```bash
# Install dependencies  
apt update && apt install -y curl build-essential ffmpeg git python3 make g++ wget  
curl -fsSL [https://deb.nodesource.com/setup_20.x](https://deb.nodesource.com/setup_20.x) | bash -  
apt install -y nodejs

# Deploy Code  
mkdir -p ~/stt-microservice && cd ~/stt-microservice  
npm init -y  
npm install express multer fluent-ffmpeg whisper-node

# Start via PM2  
npm install -g pm2  
pm2 start server.js --name stt-server  
pm2 startup  
pm2 save
```

## **🖥️ Homelab & Hardware Specs**

For those curious about the hardware running this local AI architecture, here is the setup:

* **Hypervisor:** Proxmox VE  
* **AI Node:** Ollama Server running `qwen3.5:4b`  
* **Main Bot Node:** Ubuntu LXC  
* **STT Node:** Ubuntu LXC (CPU-only, running whisper-node small.en model)  
* **SAP Host:** Remote Windows PC (Surface Pro) for WebSocket GUI Automation & Puppeteer Chrome RPA  
* **CPU:** Intel Core i5  
* **RAM:** 16GB  
* **GPU (For Ollama):** NVIDIA GTX 1060 (6GB VRAM)
