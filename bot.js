// File: bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs').promises;

// ==========================================
// 0. GLOBAL ERROR HANDLERS (Anti-Crash)
// ==========================================
process.on('uncaughtException', (err) => {
    console.error('🔥 [CRITICAL] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [NETWORK] Unhandled Rejection:', reason.message || reason);
});

// Import Sub-Agents
const newsAgent = require('./agents/newsAgent');
const cliAgent = require('./agents/cliAgent');
const weatherAgent = require('./agents/weatherAgent');
const sheetsAgent = require('./agents/sheetsAgent');
const voiceAgent = require('./agents/voiceAgent');
const cronAgent = require('./agents/cronAgent'); 
const sapAgent = require('./agents/sapAgent');

// ==========================================
// 1. DIRECTORY SETUP & DEBUG ENGINE
// ==========================================
const DATA_DIR = path.join(__dirname, 'data');
const SANDBOX_DIR = path.join(__dirname, 'sandbox'); 
const PROMPT_FILE = path.join(DATA_DIR, 'system_prompt.txt');

async function initDirectories() {
    try { 
        await fs.mkdir(DATA_DIR, { recursive: true }); 
        await fs.mkdir(SANDBOX_DIR, { recursive: true });
    } 
    catch (err) { console.error("Failed to create necessary directories", err); }
}
initDirectories();

const isDebug = process.argv.includes('--debug') || process.argv.includes('-d');

function debugLog(label, data = '') {
  if (isDebug) {
    console.log(`\n[DEBUG] === ${label} ===`);
    if (data) console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  }
}

if (isDebug) console.log('⚠️ DEBUG MODE ACTIVATED: Verbose logging enabled.');

// ==========================================
// 2. CONFIGURATION & SAFE COMMANDS
// ==========================================
const token = process.env.TELEGRAM_TOKEN;
const OLLAMA_URL = `http://${process.env.OLLAMA_IP}:11434/api/generate`;
const MEMORY_LIMIT = parseInt(process.env.MEMORY_LIMIT, 10) || 30;
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';  

if (!token) {
  console.error('FATAL ERROR: TELEGRAM_TOKEN is missing from .env file.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const pendingCommands = new Map();

const SAFE_FILE = path.join(DATA_DIR, 'safe_commands.json');
let safeCommands = [];

async function loadSafeCommands() {
    try {
        const data = await fs.readFile(SAFE_FILE, 'utf8');
        safeCommands = JSON.parse(data);
        console.log(`🛡️ Safe Commands Loaded: ${safeCommands.length} authorized.`);
    } catch (e) {
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
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
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
  if (history.length > MEMORY_LIMIT) history.splice(0, history.length - MEMORY_LIMIT);
  
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
    stream: false,
    keep_alive: -1
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
  if ((!rawContent || rawContent.trim() === '') && data.thinking) rawContent = data.thinking;
  if (!rawContent || rawContent.trim() === '') throw new Error(`Invalid API Response from ${modelName}`);
  
  return rawContent.trim();
}

// ==========================================
// 6. HARDCODED COMMANDS
// ==========================================
bot.onText(/\/start|\/help/, (msg) => {
  const helpText = `🤖 <b>Agentic AI Online:</b>
/help - Show this list
/files - List Sandbox files
/read [filename] - Read a Sandbox file
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
  } else {
      bot.sendMessage(msg.chat.id, `ℹ️ <code>${cmd}</code> is already on the safe list.`, { parse_mode: 'HTML' }).catch(() => {});
  }
});

bot.onText(/\/deny (.+)/, async (msg, match) => {
  const cmd = match[1].trim();
  if (safeCommands.includes(cmd)) {
      safeCommands = safeCommands.filter(c => c !== cmd);
      await saveSafeCommands();
      bot.sendMessage(msg.chat.id, `🚫 <b>Removed:</b> <code>${cmd}</code> now requires manual approval.`, { parse_mode: 'HTML' }).catch(() => {});
  } else {
      bot.sendMessage(msg.chat.id, `ℹ️ <code>${cmd}</code> was not on the safe list.`, { parse_mode: 'HTML' }).catch(() => {});
  }
});

bot.onText(/\/jobs/, (msg) => {
  bot.sendMessage(msg.chat.id, cronAgent.listJobs(), { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/removejob (.+)/, async (msg, match) => {
  const result = await cronAgent.removeJob(match[1].trim());
  bot.sendMessage(msg.chat.id, result, { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/files/, async (msg) => {
  try {
    const allFiles = await fs.readdir(SANDBOX_DIR);
    const visibleFiles = allFiles.filter(file => !file.startsWith('.'));
    if (visibleFiles.length === 0) return bot.sendMessage(msg.chat.id, '📂 Sandbox is empty.').catch(() => {});
    bot.sendMessage(msg.chat.id, `📂 <b>Sandbox Files:</b>\n<pre>${visibleFiles.join('\n')}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    bot.sendMessage(msg.chat.id, '❌ Could not read Sandbox directory.').catch(() => {});
  }
});

bot.onText(/\/read (.+)/, async (msg, match) => {
  const fileName = match[1].trim();
  if (fileName.startsWith('.') || fileName.includes('..') || fileName.includes('/')) {
    return bot.sendMessage(msg.chat.id, '🚫 Access Denied. Cannot escape sandbox.').catch(() => {});
  }
  try {
    const filePath = path.join(SANDBOX_DIR, fileName);
    let content = await fs.readFile(filePath, 'utf8');
    if (content.length > 3500) content = content.substring(0, 3500) + '\n... [TRUNCATED]';
    const safeContent = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    bot.sendMessage(msg.chat.id, `📄 <b>${fileName} (Sandbox):</b>\n<pre>${safeContent}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Could not read file in Sandbox: ${fileName}`).catch(() => {});
  }
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
    let promptTemplate;
    try {
        promptTemplate = await fs.readFile(PROMPT_FILE, 'utf8');
    } catch (e) {
        throw new Error("Missing system_prompt.txt! Please create it inside the data/ directory.");
    }

    const routerPrompt = promptTemplate
        .replace('{{CONVERSATION_HISTORY}}', conversationHistory)
        .replace('{{USER_MESSAGE}}', userText);

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

    let output = routerDecision.output || routerDecision.text || routerDecision.city || routerDecision.command || routerDecision.query || routerDecision.task || routerDecision.action || '';
    
    let intent = routerDecision.intent ? String(routerDecision.intent).toLowerCase() : 'chat';
    if (intent.includes(',')) intent = intent.split(',')[0].trim();

    const cliAliases = ['bash', 'cmd', 'system', 'linux'];
    if (cliAliases.includes(intent)) intent = 'cli';

    if ((!output || output.trim() === '') && intent !== 'news') {
      if (intent === 'weather') {
          output = "For which city would you like to know the weather?";
          intent = 'clarify';
      } else if (intent === 'cli') {
          output = userText.replace(/^(run|execute|type|bash|command|sudo|compile)\s+/i, '').trim();
      } else {
          output = "I don't have enough information.";
          intent = 'chat';
      }
    }

    // ---------------------------------------------------------
    // EXECUTION BLOCK
    // ---------------------------------------------------------
    if (intent === 'sap') {
        const progress = await startProgressBar(chatId, 'Connecting to SAP...');
        try {
            const sapData = await sapAgent.querySap(output);
            debugLog('SAP Execution Success', sapData);
            clearInterval(progress.intervalId);
            return bot.editMessageText(sapData, { chat_id: chatId, message_id: progress.messageId, parse_mode: 'HTML' }).catch(() => {});
        } catch (e) {
            debugLog('SAP Execution Error', e.message);
            clearInterval(progress.intervalId);
            return bot.editMessageText(`❌ <b>SAP Error:</b>\n<pre>${e.message}</pre>`, { chat_id: chatId, message_id: progress.messageId, parse_mode: 'HTML' }).catch(() => {});
        }
    }

    if (intent === 'schedule') {
        const cronExp = routerDecision.cron;
        try {
            const id = await cronAgent.addJob(cronExp, output, chatId, processPipeline);
            debugLog('Cron Scheduled Success', `ID: ${id}`);
            saveToMemory(chatId, 'Assistant', `Scheduled task #${id}`);
            return bot.sendMessage(chatId, `⏰ <b>Scheduled Successfully!</b>\n<b>ID:</b> <code>${id}</code>\n<b>Cron:</b> <pre>${cronExp}</pre>\n<b>Task:</b> ${output}`, { parse_mode: 'HTML' }).catch(() => {});
        } catch (e) {
            debugLog('Cron Scheduled Error', e.message);
            return bot.sendMessage(chatId, `❌ <b>Failed to schedule:</b> ${e.message}`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    if (intent === 'unschedule') {
        const result = await cronAgent.removeJob(output);
        debugLog('Cron Unscheduled', result);
        saveToMemory(chatId, 'Assistant', result);
        return bot.sendMessage(chatId, result, { parse_mode: 'HTML' }).catch(() => {});
    }

    if (intent === 'chat' || intent === 'clarify') {
      saveToMemory(chatId, 'Assistant', output);
      return bot.sendMessage(chatId, output).catch(() => {});
    }

    if (intent === 'write_file') {
        const filename = routerDecision.filename || 'snippet.txt';
        const filePath = path.join(SANDBOX_DIR, filename);
        
        // --- NEW: Sanitize LLM Output ---
        let fileContent = output;
        if (fileContent.includes('```')) {
            // Extract the block if wrapped in markdown
            const match = fileContent.match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
            if (match && match[1]) {
                fileContent = match[1].trim();
            }
        } else {
            // Failsafe: 4B model forgot backticks and prepended English text
            // Hunt for the first line that looks like real code (C, Python, JS, etc.)
            const codeStartRegex = /^[ \t]*(#include|import|def\s|class\s|int\s|void\s|function\s|const\s|let\s|var\s|\/\/|\/\*)/m;
            const match = fileContent.match(codeStartRegex);
            if (match) {
                fileContent = fileContent.substring(match.index).trim();
            }
        }

        await fs.writeFile(filePath, fileContent, 'utf8');
        let safeContent = fileContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        debugLog('File Written', `sandbox/${filename}`);
        return bot.sendMessage(chatId, `💾 <b>File Created:</b> <code>sandbox/${filename}</code>\n<pre>${safeContent}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
    }

    if (intent === 'news') {
      const newsData = await newsAgent.fetchNews();
      return bot.sendMessage(chatId, newsData, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
    }

    if (intent === 'weather') {
      const weatherData = await weatherAgent.getWeather(output);
      debugLog('Weather Success', weatherData);
      return bot.sendMessage(chatId, weatherData, { parse_mode: 'HTML' }).catch(() => {});
    }

    if (intent === 'cli') {
      const isSafe = safeCommands.some(safeCmd => output.trim().startsWith(safeCmd));

      if (isSafe) {
        if (!isCron) await bot.sendMessage(chatId, `⚙️ <b>Auto-executing:</b> <pre>${output}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        try {
          const result = await cliAgent.runCommand(output);
          debugLog('CLI Execution Success', result); // <--- LOGS SUCCESSFUL CLI TO CONSOLE
          let safeResult = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return bot.sendMessage(chatId, `✅ <b>Result:</b>\n<pre>${safeResult}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        } catch (error) {
          debugLog('CLI Execution Error', error.message); // <--- LOGS STDERR TO CONSOLE
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
    debugLog('Pipeline Critical Error', error.message);
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
      debugLog('CLI Manual Execution Success', result); // <--- LOGS SUCCESS TO CONSOLE
      let safeResult = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      bot.editMessageText(`✅ <b>Complete:</b>\n<pre>${cmd}</pre>\n<b>Output:</b>\n<pre>${safeResult}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    } catch (error) {
      debugLog('CLI Manual Execution Error', error.message); // <--- LOGS STDERR TO CONSOLE
      bot.editMessageText(`❌ <b>Failed:</b>\n<pre>${cmd}</pre>\n<b>Error:</b>\n<pre>${error.message}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    }
    pendingCommands.delete(cmdId);
  }
});