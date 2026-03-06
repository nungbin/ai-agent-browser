require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs').promises;

// Import Sub-Agents
const newsAgent = require('./agents/newsAgent');
const cliAgent = require('./agents/cliAgent');
const weatherAgent = require('./agents/weatherAgent');
const sheetsAgent = require('./agents/sheetsAgent');
const voiceAgent = require('./agents/voiceAgent');
const cronAgent = require('./agents/cronAgent'); 

// ==========================================
// 1. DEBUG ENGINE
// ==========================================
const isDebug = process.argv.includes('--debug') || process.argv.includes('-d');

function debugLog(label, data = '') {
  if (isDebug) {
    console.log(`\n[DEBUG] === ${label} ===`);
    if (data) {
      console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    }
  }
}

if (isDebug) console.log('⚠️ DEBUG MODE ACTIVATED: Verbose logging enabled.');

// ==========================================
// 2. CONFIGURATION & SAFE COMMANDS
// ==========================================
const token = process.env.TELEGRAM_TOKEN;
const OLLAMA_URL = `http://${process.env.OLLAMA_IP}:11434/api/generate`;

const MEMORY_LIMIT = parseInt(process.env.MEMORY_LIMIT, 10) || 30;
const CORE_MODEL = 'qwen3.5:4b';  

if (!token) {
  console.error('FATAL ERROR: TELEGRAM_TOKEN is missing from .env file.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const pendingCommands = new Map();

// --- DYNAMIC SAFE COMMANDS ---
const SAFE_FILE = path.join(__dirname, 'safe_commands.json');
let safeCommands = [];

async function loadSafeCommands() {
    try {
        const data = await fs.readFile(SAFE_FILE, 'utf8');
        safeCommands = JSON.parse(data);
        console.log(`🛡️ Safe Commands Loaded: ${safeCommands.length} authorized.`);
    } catch (e) {
        // Defaults if file doesn't exist yet
        safeCommands = ['pwd', 'ls', 'whoami', 'date', 'uptime', 'free', 'df', 'cat', 'echo', 'gcc', './', 'which', 'uname'];
        await fs.writeFile(SAFE_FILE, JSON.stringify(safeCommands, null, 2));
        console.log('🛡️ Created new safe_commands.json file with defaults.');
    }
}
loadSafeCommands();

async function saveSafeCommands() {
    await fs.writeFile(SAFE_FILE, JSON.stringify(safeCommands, null, 2), 'utf8');
}

// ==========================================
// 3. PERSISTENT MEMORY & CRON INIT
// ==========================================
const MEMORY_FILE = path.join(__dirname, 'memory.json');
let chatMemory = new Map();

async function initMemory() {
  try {
    const data = await fs.readFile(MEMORY_FILE, 'utf8');
    chatMemory = new Map(Object.entries(JSON.parse(data)));
    console.log(`🧠 Persistent Memory Loaded. (Limit: ${MEMORY_LIMIT} messages)`);
  } catch (e) {
    console.log(`🧠 No previous memory found. Starting fresh.`);
  }
}
initMemory();

// Initialize Cron Agent and pass it the pipeline execution function
cronAgent.init((chatId, task, isCron) => processPipeline(chatId, task, isCron));

function persistMemory() {
  const obj = Object.fromEntries(chatMemory);
  fs.writeFile(MEMORY_FILE, JSON.stringify(obj, null, 2), 'utf8')
    .catch(err => debugLog('Memory Save Error', err));
}

function saveToMemory(chatId, role, text) {
  const idStr = chatId.toString();
  if (!chatMemory.has(idStr)) chatMemory.set(idStr, []);
  const history = chatMemory.get(idStr);
  
  history.push({ role, text });
  
  if (history.length > MEMORY_LIMIT) {
      history.splice(0, history.length - MEMORY_LIMIT);
  }
  
  persistMemory();
}

function getMemoryString(chatId) {
  const idStr = chatId.toString();
  const history = chatMemory.get(idStr) || [];
  if (history.length === 0) return "No prior conversation.";
  return history.map(msg => `${msg.role}: ${msg.text}`).join('\n');
}

console.log(`🌐 Agentic Pipeline Online.\nRouter: ${CORE_MODEL}`);

// ==========================================
// 4. HELPER: ANIMATED PROGRESS BAR
// ==========================================
async function startProgressBar(chatId, text) {
  const totalSteps = 10;
  let currentStep = 0;
  const filledChar = '■';
  const emptyChar = '□';
  
  const loadingMsg = await bot.sendMessage(chatId, `⏳ ${text}\n[${emptyChar.repeat(totalSteps)}] 0%`);
  
  const intervalId = setInterval(() => {
    currentStep++;
    if (currentStep >= totalSteps) currentStep = totalSteps - 1; 
    
    const bar = filledChar.repeat(currentStep) + emptyChar.repeat(totalSteps - currentStep);
    const percentage = currentStep * 10;
    
    bot.editMessageText(`⏳ ${text}\n[${bar}] ${percentage}%`, {
      chat_id: chatId,
      message_id: loadingMsg.message_id
    }).catch(() => {}); 
  }, 1000); 

  return { intervalId, messageId: loadingMsg.message_id };
}

// ==========================================
// 5. HELPER: OLLAMA API CALLER
// ==========================================
async function callOllama(modelName, promptText, expectJson = false) {
  debugLog(`Sending Prompt to [${modelName}]...`);
  
  const payload = {
    model: modelName,
    prompt: promptText,
    stream: false
  };
  if (expectJson) payload.format = 'json';

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (data.error) throw new Error(`Ollama API Error (${modelName}): ${data.error}`);

  let rawContent = data.response;
  if ((!rawContent || rawContent.trim() === '') && data.thinking) {
    rawContent = data.thinking;
  }
  if (!rawContent || rawContent.trim() === '') {
    throw new Error(`Invalid API Response from ${modelName}`);
  }
  return rawContent.trim();
}

// ==========================================
// 6. HARDCODED COMMANDS (SAFE LIST & CRON)
// ==========================================
bot.onText(/\/start|\/help/, (msg) => {
  const helpText = `🤖 <b>Agentic AI Online:</b>
/help - Show this list
/files - List directory files
/read [filename] - Read a file
/clear - Wipe memory
/safe - View auto-execute whitelist
/allow [cmd] - Add to whitelist
/deny [cmd] - Remove from whitelist
/jobs - View scheduled cron tasks
/removejob [id] - Delete a cron task

🗣️ <b>Natural Language:</b> Type normally to chat or schedule!`;
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/clear/, (msg) => {
  chatMemory.delete(msg.chat.id.toString());
  persistMemory();
  bot.sendMessage(msg.chat.id, '🧹 <b>Memory Cleared!</b>', { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/safe$/, (msg) => {
  bot.sendMessage(msg.chat.id, `🛡️ <b>Auto-Execute Whitelist:</b>\n<pre>${safeCommands.join('\n')}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/allow (.+)/, async (msg, match) => {
  const cmd = match[1].trim();
  if (!safeCommands.includes(cmd)) {
      safeCommands.push(cmd);
      await saveSafeCommands();
      bot.sendMessage(msg.chat.id, `✅ <b>Added:</b> <code>${cmd}</code> will now auto-execute without approval.`, { parse_mode: 'HTML' }).catch(() => {});
  }
});

bot.onText(/\/deny (.+)/, async (msg, match) => {
  const cmd = match[1].trim();
  safeCommands = safeCommands.filter(c => c !== cmd);
  await saveSafeCommands();
  bot.sendMessage(msg.chat.id, `🚫 <b>Removed:</b> <code>${cmd}</code> now requires manual approval.`, { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/jobs/, (msg) => {
  bot.sendMessage(msg.chat.id, cronAgent.listJobs(), { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/removejob (.+)/, async (msg, match) => {
  const result = await cronAgent.removeJob(match[1].trim());
  bot.sendMessage(msg.chat.id, result, { parse_mode: 'HTML' }).catch(() => {});
});

// ==========================================
// 7. THE CORE AI PIPELINE
// ==========================================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return; 
  await processPipeline(msg.chat.id, msg.text, false);
});

async function processPipeline(chatId, userText, isCron = false) {
  const logPrefix = isCron ? "⏰ [CRON TASK]:" : "User Message";
  debugLog(logPrefix, userText);
  saveToMemory(chatId, isCron ? 'System Task Triggered' : 'User', userText);
  
  const conversationHistory = getMemoryString(chatId);
  
  let thinkingProgress;
  if (!isCron) thinkingProgress = await startProgressBar(chatId, `🧠 Processing Request...`);

  try {
    const routerPrompt = `
      You are an advanced AI assistant, intent router, and Linux system administrator. You control a real server.
      
      CONVERSATION HISTORY:
      ${conversationHistory}
      
      CURRENT MESSAGE: "${userText}"

      Classify the message into exactly ONE of these intents:
      - "cli": Run a Linux command. Output exactly ONE bash command.
      - "write_file": Create a file. Output the code. Needs "filename" key.
      - "weather": Fetch weather. Output ONLY city name.
      - "sheets": Log data to Google Sheets. Output the data string.
      - "news": Fetch the news. Output MUST BE "fetching news".
      - "schedule": Schedule a recurring task. Output MUST include "cron" (a valid 5-part cron expression like "0 8 * * *") and "output" (the task description to run).
      - "unschedule": Stop a scheduled task. Output the ID or task keyword.
      - "chat": A general question requiring an explanation.
      - "clarify": Missing information (like a city for the weather).

      CRITICAL RULES:
      1. EXACT SCHEMA: You MUST include the "output" key in your JSON. Do not use "city", "command", or "query". Use "output".
      2. SCHEDULING: If intent is "schedule", include a "cron" key with standard cron syntax.
      3. SYSTEM STATE: If asked about the server (RAM, disk space), use the 'cli' intent (e.g., 'free -h', 'df -h').

      EXAMPLES:
      User: "what's the weather in Edmonton"
      Response: {"intent": "weather", "output": "Edmonton"}

      User: "Send me the weather in Tokyo every morning at 8 AM"
      Response: {"intent": "schedule", "cron": "0 8 * * *", "output": "what's the weather in tokyo"}

      User: "cancel the weather schedule"
      Response: {"intent": "unschedule", "output": "weather"}

      User: "what's the weather"
      Response: {"intent": "clarify", "output": "For which city would you like to know the weather?"}

      Respond in strict JSON format ONLY.
    `;

    const rawJsonResponse = await callOllama(CORE_MODEL, routerPrompt, true);
    debugLog(`Output from [${CORE_MODEL}]`, rawJsonResponse);

    let cleanStr = rawJsonResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = cleanStr.indexOf('{');
    const lastBrace = cleanStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);

    let routerDecision = JSON.parse(cleanStr);
    
    if (!isCron) {
        clearInterval(thinkingProgress.intervalId);
        bot.deleteMessage(chatId, thinkingProgress.messageId).catch(() => {});
    }

    // === BUG FIX: EXTENDED ALIAS CATCHER ===
    // If the LLM hallucinates a key, we catch it here so it doesn't fail.
    let output = routerDecision.output || routerDecision.text || routerDecision.city || routerDecision.command || routerDecision.query || routerDecision.task || routerDecision.action || '';
    
    let intent = routerDecision.intent ? String(routerDecision.intent).toLowerCase() : 'chat';
    if (intent.includes(',')) intent = intent.split(',')[0].trim();

    const cliAliases = ['bash', 'cmd', 'system', 'linux'];
    if (cliAliases.includes(intent)) intent = 'cli';

    if ((!output || output.trim() === '') && intent !== 'news') {
      if (intent === 'weather') {
          output = "For which city would you like to know the weather?";
          intent = 'clarify';
      } else {
          output = "I don't have enough information.";
          intent = 'chat';
      }
    }

    // ---------------------------------------------------------
    // EXECUTION BLOCK
    // ---------------------------------------------------------
    if (intent === 'schedule') {
        const cronExp = routerDecision.cron;
        try {
            const id = await cronAgent.addJob(cronExp, output, chatId, processPipeline);
            saveToMemory(chatId, 'Assistant', `Scheduled task #${id}`);
            return bot.sendMessage(chatId, `⏰ <b>Scheduled Successfully!</b>\n<b>ID:</b> <code>${id}</code>\n<b>Cron:</b> <pre>${cronExp}</pre>\n<b>Task:</b> ${output}`, { parse_mode: 'HTML' }).catch(() => {});
        } catch (e) {
            return bot.sendMessage(chatId, `❌ <b>Failed to schedule:</b> ${e.message}`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    if (intent === 'unschedule') {
        const result = await cronAgent.removeJob(output);
        saveToMemory(chatId, 'Assistant', result);
        return bot.sendMessage(chatId, result, { parse_mode: 'HTML' }).catch(() => {});
    }

    if (intent === 'chat' || intent === 'clarify') {
      saveToMemory(chatId, 'Assistant', output);
      return bot.sendMessage(chatId, output).catch(() => {});
    }

    if (intent === 'write_file') {
        const filename = routerDecision.filename || 'snippet.txt';
        const filePath = path.join(__dirname, filename);
        await fs.writeFile(filePath, output, 'utf8');
        let safeContent = output.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return bot.sendMessage(chatId, `💾 <b>File Created:</b> <code>${filename}</code>\n<pre>${safeContent}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
    }

    if (intent === 'news') {
      const newsData = await newsAgent.fetchNews();
      return bot.sendMessage(chatId, newsData, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
    }

    if (intent === 'weather') {
      const weatherData = await weatherAgent.getWeather(output);
      return bot.sendMessage(chatId, weatherData, { parse_mode: 'HTML' }).catch(() => {});
    }

    if (intent === 'cli') {
      const isSafe = safeCommands.some(safeCmd => output.trim().startsWith(safeCmd));

      if (isSafe) {
        if (!isCron) await bot.sendMessage(chatId, `⚙️ <b>Auto-executing:</b> <pre>${output}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        try {
          const result = await cliAgent.runCommand(output);
          let safeResult = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return bot.sendMessage(chatId, `✅ <b>Result:</b>\n<pre>${safeResult}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        } catch (error) {
          return bot.sendMessage(chatId, `❌ <b>Failed:</b>\n<pre>${error.message}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        }
      } else {
        const commandId = Date.now().toString();
        pendingCommands.set(commandId, output); 
        const options = { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[ { text: '⚠️ Approve & Run', callback_data: `run_${commandId}` }, { text: '❌ Cancel', callback_data: `cancel_${commandId}` } ]] } };
        return bot.sendMessage(chatId, `💻 <b>Generated Command:</b>\n<pre>${output}</pre>\nExecute?`, options).catch(() => {});
      }
    }

  } catch (error) {
    if (!isCron) {
        clearInterval(thinkingProgress.intervalId);
        bot.deleteMessage(chatId, thinkingProgress.messageId).catch(() => {});
    }
    bot.sendMessage(chatId, `❌ <b>Pipeline Error:</b>\n<pre>${error.message}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
  }
}

// ==========================================
// 8. CLI EXECUTION APPROVAL HANDLER
// ==========================================
bot.on('callback_query', async (query) => {
  const { message: { chat: { id: chatId }, message_id: msgId }, data } = query;

  if (data.startsWith('cancel_')) {
    pendingCommands.delete(data.replace('cancel_', ''));
    return bot.editMessageText('🚫 <i>Cancelled.</i>', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
  }

  if (data.startsWith('run_')) {
    const cmdId = data.replace('run_', '');
    const cmd = pendingCommands.get(cmdId);
    if (!cmd) return bot.answerCallbackQuery(query.id, { text: 'Expired', show_alert: true }).catch(() => {});

    bot.editMessageText(`⚙️ <b>Executing:</b> <pre>${cmd}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    
    try {
      const result = await cliAgent.runCommand(cmd);
      let safeResult = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      bot.editMessageText(`✅ <b>Complete:</b>\n<pre>${cmd}</pre>\n<b>Output:</b>\n<pre>${safeResult}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    } catch (error) {
      bot.editMessageText(`❌ <b>Failed:</b>\n<pre>${cmd}</pre>\n<b>Error:</b>\n<pre>${error.message}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    }
    pendingCommands.delete(cmdId);
  }
});