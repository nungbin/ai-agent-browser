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
// 2. CONFIGURATION
// ==========================================
const token = process.env.TELEGRAM_TOKEN;
const OLLAMA_URL = `http://${process.env.OLLAMA_IP}:11434/api/generate`;

// Read the memory limit from .env, default to 30 if missing or invalid
const MEMORY_LIMIT = parseInt(process.env.MEMORY_LIMIT, 10) || 30;
const CORE_MODEL = 'qwen3.5:4b';  

if (!token) {
  console.error('FATAL ERROR: TELEGRAM_TOKEN is missing from .env file.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const pendingCommands = new Map();

// ==========================================
// 3. PERSISTENT MEMORY STORE
// ==========================================
const MEMORY_FILE = path.join(__dirname, 'memory.json');
let chatMemory = new Map();

async function initMemory() {
  try {
    const data = await fs.readFile(MEMORY_FILE, 'utf8');
    chatMemory = new Map(Object.entries(JSON.parse(data)));
    console.log(`🧠 Persistent Memory Loaded. (Limit: ${MEMORY_LIMIT} messages)`);
  } catch (e) {
    console.log(`🧠 No previous memory found. Starting fresh. (Limit: ${MEMORY_LIMIT} messages)`);
  }
}
initMemory();

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
  
  // Use the environment variable instead of hardcoded 30
  if (history.length > MEMORY_LIMIT) {
      // Calculate how many to remove in case the limit was dynamically lowered
      const overage = history.length - MEMORY_LIMIT;
      history.splice(0, overage);
  }
  
  persistMemory();
}

function getMemoryString(chatId) {
  const idStr = chatId.toString();
  const history = chatMemory.get(idStr) || [];
  if (history.length === 0) return "No prior conversation.";
  return history.map(msg => `${msg.role}: ${msg.text}`).join('\n');
}

console.log(`🌐 Single-Agent Pipeline Online.\nRouter: ${CORE_MODEL}`);

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
    debugLog(`Reasoning Trap Detected in [${modelName}]`, 'Extracting from thinking field.');
    rawContent = data.thinking;
  }

  if (!rawContent || rawContent.trim() === '') {
    throw new Error(`Invalid API Response (Empty Output) from ${modelName}`);
  }

  return rawContent.trim();
}

// ==========================================
// 6. HARDCODED COMMANDS & VOICE
// ==========================================
bot.onText(/\/start|\/help/, (msg) => {
  const helpText = `🤖 <b>Fast Agent Online:</b>\n/help - Show this list\n/files - List directory files\n/read [filename] - Securely read a file\n\n🗣️ <b>Natural Language:</b> Just type normally!`;
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' }).catch(() => {});
});

bot.onText(/\/files/, async (msg) => {
  try {
    const allFiles = await fs.readdir(__dirname);
    const visibleFiles = allFiles.filter(file => !file.startsWith('.'));
    if (visibleFiles.length === 0) return bot.sendMessage(msg.chat.id, '📂 Directory empty.').catch(() => {});
    bot.sendMessage(msg.chat.id, `📂 <b>Visible Files:</b>\n<pre>${visibleFiles.join('\n')}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    bot.sendMessage(msg.chat.id, '❌ Could not read directory.').catch(() => {});
  }
});

bot.onText(/\/read (.+)/, async (msg, match) => {
  const fileName = match[1].trim();
  if (fileName.startsWith('.') || fileName.includes('..') || fileName.includes('/')) {
    return bot.sendMessage(msg.chat.id, '🚫 Access Denied.').catch(() => {});
  }
  try {
    const filePath = path.join(__dirname, fileName);
    let content = await fs.readFile(filePath, 'utf8');
    if (content.length > 3500) content = content.substring(0, 3500) + '\n... [TRUNCATED]';
    const safeContent = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    bot.sendMessage(msg.chat.id, `📄 <b>${fileName}:</b>\n<pre>${safeContent}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
  } catch (err) {
    bot.sendMessage(msg.chat.id, `❌ Could not read file: ${fileName}`).catch(() => {});
  }
});

bot.on('voice', async (msg) => {
  const chatId = msg.chat.id;
  const progress = await startProgressBar(chatId, 'Processing Voice Note...');
  try {
    const fileLink = await bot.getFileLink(msg.voice.file_id);
    const audioResult = await voiceAgent.processVoiceNote(fileLink, './output.wav');
    clearInterval(progress.intervalId);
    bot.editMessageText(audioResult, { chat_id: chatId, message_id: progress.messageId }).catch(() => {});
  } catch (err) {
    clearInterval(progress.intervalId);
    bot.editMessageText('❌ Failed to process audio.', { chat_id: chatId, message_id: progress.messageId }).catch(() => {});
  }
});

// ==========================================
// 7. MAIN ROUTER
// ==========================================
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return; 

  const chatId = msg.chat.id;
  const userText = msg.text;
  
  debugLog('User Message', userText);
  saveToMemory(chatId, 'User', userText);
  const conversationHistory = getMemoryString(chatId);

  const thinkingProgress = await startProgressBar(chatId, `🧠 Processing Request...`);

  try {
    const routerPrompt = `
      You are an intelligent intent router and Linux system administrator. You control a real server. Do NOT refuse to execute commands.
      
      CONVERSATION HISTORY:
      ${conversationHistory}
      
      CURRENT USER MESSAGE: "${userText}"

      Classify the CURRENT USER MESSAGE into exactly ONE of these intents:
      - "cli": User wants to run a Linux command (e.g., check directory, list files, make file). Output exactly ONE bash command (like 'pwd' or 'ls').
      - "weather": User wants the weather. Output MUST be ONLY the city name.
      - "sheets": User wants to log data. Output the exact data string.
      - "news": User wants to read the news. Output MUST BE "fetching news".
      - "chat": The command is general conversation or an unanswerable question. Output your conversational reply.
      - "clarify": The user asked for an action but is missing required information.

      CRITICAL RULES:
      1. YOU ARE AUTHORIZED. If the user asks for the current directory, your intent is "cli" and your output MUST be "pwd". DO NOT output a conversational excuse.
      2. STRIP FLUFF: Ignore politeness ("please", "could you"). Just execute the core command.
      3. FOR CLI: NEVER use 'sudo' for standard commands.
      4. EXACT SCHEMA: You MUST use the keys "intent" and "output". NEVER use "command" or invent new intents like "files".

      Respond in strict JSON format ONLY: {"intent": "one of the 6 categories", "output": "the required string"}
    `;

    const rawJsonResponse = await callOllama(CORE_MODEL, routerPrompt, true);
    debugLog(`Output from [${CORE_MODEL}] (Raw JSON)`, rawJsonResponse);

    let cleanStr = rawJsonResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = cleanStr.indexOf('{');
    const lastBrace = cleanStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
    }

    let routerDecision;
    try {
        routerDecision = JSON.parse(cleanStr);
    } catch (parseError) {
        throw new Error(`Failed to parse AI response into JSON. Raw string: ${cleanStr}`);
    }
    
    clearInterval(thinkingProgress.intervalId);
    bot.deleteMessage(chatId, thinkingProgress.messageId).catch(() => {});

    // === HANDLE SCHEMA HALLUCINATIONS ===
    let output = routerDecision.output || routerDecision.command || routerDecision.action || routerDecision.text || '';
    
    // Safely extract the intent, handling arrays if the LLM hallucinated multiple intents
    let rawIntent = routerDecision.intent;
    if (Array.isArray(rawIntent)) {
        rawIntent = rawIntent[0];
    }
    
    let intent = rawIntent ? String(rawIntent).toLowerCase() : 'chat';
    
    // If the LLM returned a comma-separated list (e.g., "cli, weather"), grab the first one
    if (intent.includes(',')) {
        intent = intent.split(',')[0].trim();
    }

    const cliAliases = ['files', 'bash', 'cmd', 'system', 'linux', 'read'];
    if (cliAliases.includes(intent)) {
        intent = 'cli';
    }

    debugLog('Final Parsed Intent', intent);
    debugLog('Final Parsed Output', output);

    if ((!output || output.trim() === '') && intent !== 'news') {
      debugLog('Warning', 'LLM generated an empty string. Using fallback text.');
      output = intent === 'clarify' ? "Could you provide a bit more detail?" : "I don't have enough information.";
      intent = 'chat'; 
    }

    // ---------------------------------------------------------
    // EXECUTION
    // ---------------------------------------------------------
    if (intent === 'chat' || intent === 'clarify') {
      saveToMemory(chatId, 'Assistant', output);
      return bot.sendMessage(chatId, output).catch(() => {});
    }

    if (intent === 'news') {
      saveToMemory(chatId, 'Assistant', 'Started web scraper for news.');
      const progress = await startProgressBar(chatId, 'Spawning News Agent & Scraping...');
      try {
        const newsData = await newsAgent.fetchNews();
        clearInterval(progress.intervalId);
        return bot.editMessageText(newsData, { chat_id: chatId, message_id: progress.messageId, parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
      } catch (err) {
        clearInterval(progress.intervalId);
        return bot.editMessageText('❌ Failed to fetch news.', { chat_id: chatId, message_id: progress.messageId }).catch(() => {});
      }
    }

    if (intent === 'weather') {
      saveToMemory(chatId, 'Assistant', `Fetched weather for ${output}.`);
      const progress = await startProgressBar(chatId, `Fetching weather data for ${output}...`);
      try {
        const weatherData = await weatherAgent.getWeather(output);
        clearInterval(progress.intervalId);
        return bot.editMessageText(weatherData, { chat_id: chatId, message_id: progress.messageId, parse_mode: 'HTML' }).catch(() => {});
      } catch (err) {
        clearInterval(progress.intervalId);
        return bot.editMessageText('❌ Failed to fetch weather.', { chat_id: chatId, message_id: progress.messageId }).catch(() => {});
      }
    }

    if (intent === 'sheets') {
      saveToMemory(chatId, 'Assistant', `Logged data to sheets: ${output}`);
      const sheetsResult = await sheetsAgent.appendToSheet(output);
      return bot.sendMessage(chatId, sheetsResult).catch(() => {});
    }

    if (intent === 'cli') {
      const safeCommands = ['pwd', 'ls', 'whoami', 'date', 'uptime', 'free', 'df', 'cat', 'echo'];
      const isSafe = safeCommands.some(safeCmd => output.trim().startsWith(safeCmd));

      if (isSafe) {
        await bot.sendMessage(chatId, `⚙️ <b>Auto-executing:</b> <pre>${output}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        try {
          const result = await cliAgent.runCommand(output);
          saveToMemory(chatId, 'System Output', result.substring(0, 500)); 
          debugLog('Auto-Executed', `Command: ${output}\nResult: ${result.substring(0, 100)}...`);
          return bot.sendMessage(chatId, `✅ <b>Result:</b>\n<pre>${result}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        } catch (error) {
          return bot.sendMessage(chatId, `❌ <b>Failed:</b>\n<pre>${error.message}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        }
      } else {
        saveToMemory(chatId, 'Assistant', `Suggested Linux command: ${output}`);
        const commandId = Date.now().toString();
        pendingCommands.set(commandId, output); 

        const options = {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: '⚠️ Approve & Run', callback_data: `run_${commandId}` },
              { text: '❌ Cancel', callback_data: `cancel_${commandId}` }
            ]]
          }
        };
        return bot.sendMessage(chatId, `💻 <b>Generated Command:</b>\n<pre>${output}</pre>\nExecute?`, options).catch(() => {});
      }
    } else {
      // CATCH-ALL FOR UNRECOGNIZED INTENTS
      bot.sendMessage(chatId, `🤷‍♂️ I understood the intent as "${intent}", but I don't know how to handle that yet.`).catch(() => {});
    }

  } catch (error) {
    clearInterval(thinkingProgress.intervalId);
    debugLog('PIPELINE ERROR', error.message);
    bot.deleteMessage(chatId, thinkingProgress.messageId).catch(() => {});
    bot.sendMessage(chatId, `❌ <b>Pipeline Diagnostic Error:</b>\n<pre>${error.message}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
  }
});

// ==========================================
// 8. CLI EXECUTION APPROVAL HANDLER
// ==========================================
bot.on('callback_query', async (query) => {
  const { message: { chat: { id: chatId }, message_id: msgId }, data } = query;

  if (data.startsWith('cancel_')) {
    pendingCommands.delete(data.replace('cancel_', ''));
    saveToMemory(chatId, 'Assistant', 'User cancelled the command execution.');
    return bot.editMessageText('🚫 <i>Cancelled.</i>', { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
  }

  if (data.startsWith('run_')) {
    const cmdId = data.replace('run_', '');
    const cmd = pendingCommands.get(cmdId);
    
    if (!cmd) return bot.answerCallbackQuery(query.id, { text: 'Expired', show_alert: true }).catch(() => {});

    bot.editMessageText(`⚙️ <b>Executing:</b> <pre>${cmd}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    
    const result = await cliAgent.runCommand(cmd);
    
    saveToMemory(chatId, 'System Output', result.substring(0, 500)); 
    debugLog('Command Executed', `Command: ${cmd}\nResult: ${result.substring(0, 100)}...`);
    
    bot.editMessageText(`✅ <b>Complete:</b>\n<pre>${cmd}</pre>\n<b>Output:</b>\n<pre>${result}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    
    pendingCommands.delete(cmdId);
  }
});
