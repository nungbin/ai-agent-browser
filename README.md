🤖 Telegram AI Agent (Local LLM Powered)A powerful, self-hosted Telegram bot powered by Ollama and local Large Language Models (like Qwen 3.5). Instead of basic keyword matching, this bot uses an advanced Agentic Intent Router to understand natural language, summarize requests, and delegate tasks to specialized sub-agents.✨ Features🧠 Local AI Brain: Powered entirely locally via Ollama, ensuring zero data leakage to third-party APIs like OpenAI.🔀 Smart Intent Routing: Automatically detects whether you want to chat, fetch news, check the weather, or run system commands.💾 Persistent Memory: Remembers conversation history across reboots (configurable limit via .env).💻 Remote CLI Execution: Safely execute Linux bash commands on your host server directly from Telegram.⛅ Weather Agent: Hyper-fast, geocoding-powered weather updates via Open-Meteo.📰 News Agent: Scrapes real-time trending tech articles from Hacker News with clickable links.🛡️ Crash-Proof: Built-in JSON sanitization and reasoning-trap extractors to handle LLM formatting hallucinations gracefully.🛠️ PrerequisitesNode.js (v18 or higher recommended)Ollama installed and running on your host machine or network.Qwen 3.5 (4B) downloaded in Ollama (ollama pull qwen3.5:4b).A Telegram Bot Token (from @BotFather on Telegram).🚀 InstallationClone the repository:git clone [https://github.com/YourUsername/telegram-ai-agent.git](https://github.com/YourUsername/telegram-ai-agent.git)
cd telegram-ai-agent
Install dependencies:npm install node-telegram-bot-api dotenv axios
Configure Environment Variables:Create a .env file in the root directory and add your specific details:TELEGRAM_TOKEN=your_telegram_bot_token_here
OLLAMA_IP=127.0.0.1
MEMORY_LIMIT=30
Start the Bot:node bot.js

# Or, to run with verbose reasoning logs:
node bot.js --debug

# Or, use PM2 to keep it running in the background forever:
pm2 start bot.js --name "ai-bot"
🗣️ UsageSimply message your bot on Telegram!Ask for the weather: "What's the weather like in Tokyo today?"Get the news: "Catch me up on the latest tech news."Run server commands: "Show me the current directory" or "How much RAM is free?"Or just chat naturally!