🤖 Telegram Agentic AI & SAP Middleware

A powerful, self-hosted Telegram bot powered by Ollama and local Large Language Models (like Qwen 3.5). This is not just a chatbot—it is an Autonomous System Administrator and Enterprise SAP Middleware.

Using an advanced Agentic Intent Router, the bot understands natural language, corrects typos, and delegates complex tasks to a suite of specialized sub-agents.

✨ Key Features

🧠 Local AI Brain: Powered entirely locally via Ollama, ensuring zero data leakage to third-party APIs.

💼 SAP "Cold Start" Automation: Remotely wakes up a Windows host via SSH, launches SAP GUI, injects credentials, scrapes legacy ALV grids (like ST22 dumps), and safely logs out. Also supports seamless fallback to node-rfc or OData REST APIs.

⏰ Natural Language Cron: Tell the bot to "Check SAP for ST22 dumps every morning at 8 AM" and it will autonomously write the cron expression, schedule the job, and message you the results.

💻 Secure CLI Execution: Safely execute Linux bash commands on your host server. Features a dynamic "Safelist" configurable directly from Telegram (/allow, /deny) to bypass manual approvals for trusted commands.

⛅ Weather & 📰 News Agents: Geocoding-powered weather updates and real-time Hacker News scraping built right in.

💾 Persistent Memory: Remembers conversation history and scheduled cron jobs across server reboots.

🏗️ Architecture

Linux LXC Host: Runs the core Node.js bot, Ollama LLM, and internet-facing sub-agents (News, Weather).

Windows GUI Slave: An optional Windows machine connected via OpenSSH. Used exclusively by the sapAgent.js to execute pywin32 scripts for driving legacy SAP GUI transactions.

🛠️ Prerequisites

Node.js (v18 or higher)

Ollama running locally (ollama pull qwen3.5:4b)

A Telegram Bot Token (from @BotFather)

(Optional) Windows PC with SAP Logon and OpenSSH Server installed.

🚀 Installation & Setup

Clone the repository:

git clone [https://github.com/YourUsername/telegram-ai-agent.git](https://github.com/YourUsername/telegram-ai-agent.git)
cd telegram-ai-agent


Install dependencies:

npm install node-telegram-bot-api dotenv axios node-cron


(If using the SAP RFC agent, also install node-rfc)

Configure Environment Variables:
Create a .env file in the root directory (use the template below):

# ==========================================
# 1. CORE TELEGRAM & MEMORY CONFIG
# ==========================================
TELEGRAM_TOKEN=your_telegram_bot_token_here
MEMORY_LIMIT=30

# ==========================================
# 2. LOCAL AI / OLLAMA CONFIG
# ==========================================
OLLAMA_IP=127.0.0.1
OLLAMA_MODEL=qwen3.5:4b

# ==========================================
# 3. WINDOWS HOST CONFIG (For SAP GUI Automation)
# ==========================================
WINDOWS_IP=192.168.1.100
WINDOWS_USER=Administrator

# ==========================================
# 4. SAP CREDENTIALS (Cold Start Injection)
# ==========================================
SAP_SYSTEM_NAME="PRD [Production]"
SAP_CLIENT=100
SAP_USER=your_sap_username
SAP_PASS=your_super_secret_password


Start the Bot:

node bot.js

# Or, to run with verbose reasoning logs:
node bot.js --debug


🗣️ Usage & Commands

Hardcoded Commands:

/safe - View the current auto-execute CLI whitelist.

/allow [cmd] - Add a command to the whitelist (e.g., /allow git).

/deny [cmd] - Remove a command from the whitelist.

/jobs - View scheduled cron tasks and their IDs.

/removejob [id] - Delete a scheduled cron task.

/clear - Wipe conversation memory.

/files - List files in the current directory.

/read [filename] - Securely read a text file.

Natural Language Examples (Just type them!):

"Compile hello.c into an executable called hello"

"Send me the tech news every Friday at 5 PM."

"Run a health check on SAP."

"What's the weather in Tokyo?"