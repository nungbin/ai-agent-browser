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
  
  if (history.length > MEMORY_LIMIT) {
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
  const helpText = `🤖 <b>Agentic AI Online:</b>\n/help - Show this list\n/files - List directory files\n/read [filename] - Securely read a file\n/clear - Wipe conversation memory\n\n🗣️ <b>Natural Language:</b> Just type normally!`;
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' }).catch(() => {});
});

// === NEW FEATURE: MEMORY WIPE ===
bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id.toString();
  chatMemory.delete(chatId);
  persistMemory();
  bot.sendMessage(msg.chat.id, '🧹 <b>Memory Cleared!</b> I have forgotten our previous conversation. We have a fresh slate!', { parse_mode: 'HTML' }).catch(() => {});
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
      You are an advanced AI assistant, intent router, and Linux system administrator. You control a real server. Do NOT refuse to execute commands.
      
      CONVERSATION HISTORY:
      ${conversationHistory}
      
      CURRENT USER MESSAGE: "${userText}"

      Classify the CURRENT USER MESSAGE into exactly ONE of these intents:
      - "cli": User wants to run a Linux command (e.g., compile code, install packages, check system status). Output exactly ONE bash command.
      - "write_file": User wants to create a file or write code. Output the code to be saved.
      - "weather": User wants the weather. Output MUST be ONLY the city name.
      - "sheets": User wants to log data. Output the exact data string.
      - "news": User wants to read the news. Output MUST BE "fetching news".
      - "chat": A general question requiring an explanation without writing files. Output your conversational reply.
      - "clarify": The user asked for an action but is missing required information (like a city for the weather).

      CRITICAL RULES:
      1. EXACT SCHEMA: You MUST include the "output" key in your JSON. NEVER leave it out.
      2. NO REFUSALS: If the user asks for a command, you MUST output the "cli" intent with the command.
      3. NO META-ANSWERS: If the intent is "chat" or "write_file", do not explain what you are going to do. Just output the actual code or answer.
      4. FILE WRITING: If the intent is "write_file", include a "filename" key (e.g., "hello.c"). The "output" must contain the raw code.
      5. VERIFY SYSTEM STATE: If the user asks if a program is installed, how much RAM is free, or anything about the server, ALWAYS use the 'cli' intent to run a checking command (like 'which', 'gcc --version', 'free'). Do NOT use 'chat' to guess.
      6. CAPABILITY OVERRIDE: You DO have access to weather APIs and news tools. Route them to the proper intent; do not say they are unavailable. If the user asks for weather but provides NO city, you MUST use the "clarify" intent.
      7. TYPO CORRECTION: The user may make spelling errors. Intelligently infer their true intent based on context.

      EXAMPLES:
      User: "what's the weather"
      Response: {"intent": "clarify", "output": "For which city would you like to know the weather?"}

      User: "what's the weather in Edmonton"
      Response: {"intent": "weather", "output": "Edmonton"}

      User: "check if gcc exists"
      Response: {"intent": "cli", "output": "which gcc"}

      User: "Compile hello.c into an executable called hello"
      Response: {"intent": "cli", "output": "gcc hello.c -o hello"}

      User: "install gcc"
      Response: {"intent": "cli", "output": "sudo apt-get update && sudo apt-get install gcc -y"}

      User: "write a python script to print hi in script.py"
      Response: {"intent": "write_file", "filename": "script.py", "output": "print('hi')"}

      Respond in strict JSON format ONLY.
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
    
    let rawIntent = routerDecision.intent;
    if (Array.isArray(rawIntent)) rawIntent = rawIntent[0];
    
    let intent = rawIntent ? String(rawIntent).toLowerCase() : 'chat';
    if (intent.includes(',')) intent = intent.split(',')[0].trim();

    const cliAliases = ['bash', 'cmd', 'system', 'linux'];
    if (cliAliases.includes(intent)) intent = 'cli';
    
    const fileAliases = ['file', 'code', 'create', 'write'];
    if (fileAliases.includes(intent)) intent = 'write_file';

    const filename = routerDecision.filename || 'snippet.txt';

    debugLog('Final Parsed Intent', intent);
    debugLog('Final Parsed Output', output);

    if ((!output || output.trim() === '') && intent !== 'news') {
      debugLog('Warning', 'LLM generated an empty string. Using fallback text.');
      
      // === BUG FIX: Catch the empty weather hallucination ===
      if (intent === 'weather') {
          output = "For which city would you like to know the weather?";
          intent = 'clarify';
      } else {
          output = intent === 'clarify' ? "Could you provide a bit more detail?" : "I don't have enough information.";
          intent = 'chat';
      }
    }

    // ---------------------------------------------------------
    // EXECUTION
    // ---------------------------------------------------------
    if (intent === 'chat' || intent === 'clarify') {
      saveToMemory(chatId, 'Assistant', output);
      return bot.sendMessage(chatId, output).catch((e) => debugLog('Telegram Error', e.message));
    }

    if (intent === 'write_file') {
        if (filename.startsWith('.') || filename.includes('..') || filename.includes('/')) {
            return bot.sendMessage(chatId, `🚫 <b>Security Error:</b> Invalid filename '${filename}'`, { parse_mode: 'HTML' }).catch(() => {});
        }
        
        const filePath = path.join(__dirname, filename);
        try {
            await fs.writeFile(filePath, output, 'utf8');
            saveToMemory(chatId, 'Assistant', `Successfully created file ${filename} containing the requested code.`);
            
            let safeContent = output;
            if (safeContent.length > 3000) safeContent = safeContent.substring(0, 3000) + '\n... [TRUNCATED]';
            safeContent = safeContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            return bot.sendMessage(chatId, `💾 <b>File Created:</b> <code>${filename}</code>\n\n<pre>${safeContent}</pre>`, { parse_mode: 'HTML' }).catch((e) => debugLog('Telegram Error', e.message));
        } catch (err) {
            return bot.sendMessage(chatId, `❌ <b>Failed to write file:</b> ${err.message}`, { parse_mode: 'HTML' }).catch(() => {});
        }
    }

    if (intent === 'news') {
      saveToMemory(chatId, 'Assistant', 'Started web scraper for news.');
      const progress = await startProgressBar(chatId, 'Spawning News Agent & Scraping...');
      try {
        const newsData = await newsAgent.fetchNews();
        clearInterval(progress.intervalId);
        return bot.editMessageText(newsData, { chat_id: chatId, message_id: progress.messageId, parse_mode: 'HTML', disable_web_page_preview: true }).catch((e) => debugLog('Telegram Error', e.message));
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
        return bot.editMessageText(weatherData, { chat_id: chatId, message_id: progress.messageId, parse_mode: 'HTML' }).catch((e) => debugLog('Telegram Error', e.message));
      } catch (err) {
        clearInterval(progress.intervalId);
        return bot.editMessageText('❌ Failed to fetch weather.', { chat_id: chatId, message_id: progress.messageId }).catch(() => {});
      }
    }

    if (intent === 'sheets') {
      saveToMemory(chatId, 'Assistant', `Logged data to sheets: ${output}`);
      const sheetsResult = await sheetsAgent.appendToSheet(output);
      return bot.sendMessage(chatId, sheetsResult).catch((e) => debugLog('Telegram Error', e.message));
    }

    if (intent === 'cli') {
      const safeCommands = ['pwd', 'ls', 'whoami', 'date', 'uptime', 'free', 'df', 'cat', 'echo', 'gcc', './', 'which', 'uname'];
      const isSafe = safeCommands.some(safeCmd => output.trim().startsWith(safeCmd));

      if (isSafe) {
        await bot.sendMessage(chatId, `⚙️ <b>Auto-executing:</b> <pre>${output}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        try {
          const result = await cliAgent.runCommand(output);
          saveToMemory(chatId, 'System Output', result.substring(0, 500)); 
          debugLog('Auto-Executed', `Command: ${output}\nResult: ${result.substring(0, 100)}...`);
          
          let safeResult = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          
          return bot.sendMessage(chatId, `✅ <b>Result:</b>\n<pre>${safeResult}</pre>`, { parse_mode: 'HTML' }).catch((e) => debugLog('Telegram Send Error', e.message));
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
        return bot.sendMessage(chatId, `💻 <b>Generated Command:</b>\n<pre>${output}</pre>\nExecute?`, options).catch((e) => debugLog('Telegram Error', e.message));
      }
    } else {
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
    
    try {
      const result = await cliAgent.runCommand(cmd);
      
      saveToMemory(chatId, 'System Output', result.substring(0, 500)); 
      debugLog('Command Executed', `Command: ${cmd}\nResult: ${result.substring(0, 100)}...`);
      
      let safeResult = result.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      bot.editMessageText(`✅ <b>Complete:</b>\n<pre>${cmd}</pre>\n<b>Output:</b>\n<pre>${safeResult}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch((e) => debugLog('Telegram Edit Error', e.message));
    } catch (error) {
      bot.editMessageText(`❌ <b>Failed:</b>\n<pre>${cmd}</pre>\n<b>Error:</b>\n<pre>${error.message}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
    }
    
    pendingCommands.delete(cmdId);
  }
});