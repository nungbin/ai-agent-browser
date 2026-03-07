// File: bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs').promises;

// ==========================================
// 0. GLOBAL ERROR HANDLERS
// ==========================================
process.on('uncaughtException', (err) => console.error('🔥 [CRITICAL]:', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ [REJECTION]:', reason.message || reason));

// ==========================================
// 1. IMPORT AGENTS
// ==========================================
const cliAgent = require('./agents/cliAgent');
const sapAgent = require('./agents/sapAgent');
const cronAgent = require('./agents/cronAgent'); 
const newsAgent = require('./agents/newsAgent');
const weatherAgent = require('./agents/weatherAgent');
const voiceAgent = require('./agents/voiceAgent');

// ==========================================
// 2. CONFIG & SETUP
// ==========================================
const DATA_DIR = path.join(__dirname, 'data');
const SANDBOX_DIR = path.join(__dirname, 'sandbox'); 
const PROMPT_FILE = path.join(DATA_DIR, 'system_prompt.txt');
const isDebug = process.argv.includes('--debug') || process.argv.includes('-d');

async function init() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(SANDBOX_DIR, { recursive: true });
}
init();

function debugLog(label, data = '') {
  if (isDebug) {
    console.log(`\n[DEBUG] === ${label} ===`);
    if (data) console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  }
}

const token = process.env.TELEGRAM_TOKEN;
const OLLAMA_URL = `http://${process.env.OLLAMA_IP}:11434/api/generate`;
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';  
const bot = new TelegramBot(token, { polling: true });
const pendingCommands = new Map();

// ==========================================
// 3. PERSISTENCE, MEMORY & CRON
// ==========================================
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const SAFE_FILE = path.join(DATA_DIR, 'safe_commands.json');
let chatMemory = new Map();
let safeCommands = [];

async function loadData() {
    try {
        const mem = await fs.readFile(MEMORY_FILE, 'utf8');
        chatMemory = new Map(Object.entries(JSON.parse(mem)));
        const safe = await fs.readFile(SAFE_FILE, 'utf8');
        safeCommands = JSON.parse(safe);
    } catch (e) {
        safeCommands = ['pwd', 'ls', 'whoami', 'date', 'gcc', './', 'which'];
    }
}
loadData();

// Initialize Cron Agent with the pipeline function
cronAgent.init((chatId, task, isCron) => processPipeline(chatId, task, isCron));

function saveToMemory(chatId, role, text) {
    const id = chatId.toString();
    if (!chatMemory.has(id)) chatMemory.set(id, []);
    chatMemory.get(id).push({ role, text });
    if (chatMemory.get(id).length > 30) chatMemory.get(id).shift();
    fs.writeFile(MEMORY_FILE, JSON.stringify(Object.fromEntries(chatMemory), null, 2)).catch(()=>{});
}

function getMemoryString(chatId) {
  const history = chatMemory.get(chatId.toString()) || [];
  return history.length === 0 ? "No prior context." : history.map(msg => `${msg.role}: ${msg.text}`).join('\n');
}

// ==========================================
// 4. OLLAMA HEALTH CHECK
// ==========================================
async function verifyOllama() {
    console.log(`📡 Checking Ollama connection at ${process.env.OLLAMA_IP}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`http://${process.env.OLLAMA_IP}:11434/api/tags`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await res.json();
        const exists = (data.models || []).some(m => m.name.includes(CORE_MODEL));
        if (exists) console.log(`✅ Ollama Online. Model [${CORE_MODEL}] is ready.`);
        return exists;
    } catch (e) {
        console.error(`❌ Ollama Connection Failed: ${e.message}`);
        return false;
    }
}

// ==========================================
// 5. HELPERS
// ==========================================
async function startProgress(chatId, text) {
    const msg = await bot.sendMessage(chatId, `⏳ ${text}\n[□□□□□□□□□□] 0%`);
    let step = 0;
    const interval = setInterval(() => {
        step++; if (step > 9) step = 9;
        const bar = '■'.repeat(step) + '□'.repeat(10 - step);
        bot.editMessageText(`⏳ ${text}\n[${bar}] ${step*10}%`, { chat_id: chatId, message_id: msg.message_id }).catch(()=>{});
    }, 1000);
    return { interval, mid: msg.message_id };
}

async function callOllama(prompt, json = false) {
    debugLog("Ollama Prompt", prompt);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); 
    try {
        const res = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: CORE_MODEL, prompt, stream: false, keep_alive: -1, format: json ? 'json' : undefined }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        let output = data.response;
        if (!output || output.trim() === "") output = data.thinking || "";
        return output.trim();
    } catch (e) {
        clearTimeout(timeoutId);
        throw new Error(e.name === 'AbortError' ? "Ollama request timed out." : `Ollama Error: ${e.message}`);
    }
}

// ==========================================
// 6. HARDCODED COMMANDS (Restored!)
// ==========================================
bot.onText(/\/start|\/help/, (msg) => {
    const helpText = `🤖 <b>Agentic AI Online:</b>
/files - List Sandbox files
/read [filename] - Read Sandbox file
/clear - Wipe memory context
/safe - View auto-execute CLI list
/allow [cmd] - Add to auto-execute
/deny [cmd] - Remove from auto-execute
/jobs - View scheduled tasks
/removejob [id] - Delete a task
/status - Check Ollama health`;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' });
});

bot.onText(/\/clear/, (msg) => {
    chatMemory.delete(msg.chat.id.toString());
    fs.writeFile(MEMORY_FILE, JSON.stringify(Object.fromEntries(chatMemory), null, 2)).catch(()=>{});
    bot.sendMessage(msg.chat.id, '🧹 <b>Memory Cleared!</b>', { parse_mode: 'HTML' });
});

bot.onText(/\/safe$/, (msg) => bot.sendMessage(msg.chat.id, `🛡️ <b>Safe List:</b>\n<pre>${safeCommands.join('\n')}</pre>`, { parse_mode: 'HTML' }));

bot.onText(/\/allow (.+)/, async (msg, match) => {
    const cmd = match[1].trim();
    if (!safeCommands.includes(cmd)) {
        safeCommands.push(cmd);
        await fs.writeFile(SAFE_FILE, JSON.stringify(safeCommands, null, 2));
        bot.sendMessage(msg.chat.id, `✅ <b>Added:</b> <code>${cmd}</code>`, { parse_mode: 'HTML' });
    }
});

bot.onText(/\/deny (.+)/, async (msg, match) => {
    const cmd = match[1].trim();
    safeCommands = safeCommands.filter(c => c !== cmd);
    await fs.writeFile(SAFE_FILE, JSON.stringify(safeCommands, null, 2));
    bot.sendMessage(msg.chat.id, `🚫 <b>Removed:</b> <code>${cmd}</code>`, { parse_mode: 'HTML' });
});

bot.onText(/\/jobs/, (msg) => bot.sendMessage(msg.chat.id, cronAgent.listJobs(), { parse_mode: 'HTML' }));
bot.onText(/\/removejob (.+)/, async (msg, match) => bot.sendMessage(msg.chat.id, await cronAgent.removeJob(match[1].trim()), { parse_mode: 'HTML' }));

bot.onText(/\/files/, async (msg) => {
    try {
        const all = await fs.readdir(SANDBOX_DIR);
        const files = all.filter(f => !f.startsWith('.'));
        bot.sendMessage(msg.chat.id, `📂 <b>Sandbox:</b>\n<pre>${files.join('\n') || 'Empty'}</pre>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, '❌ Error reading sandbox.'); }
});

bot.onText(/\/read (.+)/, async (msg, match) => {
    const file = match[1].trim();
    if (file.includes('..') || file.includes('/')) return;
    try {
        const data = await fs.readFile(path.join(SANDBOX_DIR, file), 'utf8');
        bot.sendMessage(msg.chat.id, `📄 <b>sandbox/${file}:</b>\n<pre>${data.substring(0, 3500)}</pre>`, { parse_mode: 'HTML' });
    } catch (e) { bot.sendMessage(msg.chat.id, '❌ File not found.'); }
});

bot.onText(/\/status/, async (msg) => {
    bot.sendMessage(msg.chat.id, await verifyOllama() ? "✅ Ollama connection is healthy." : "❌ Ollama is unreachable.");
});

// ==========================================
// 7. VOICE INPUT HANDLER
// ==========================================
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.voice.file_id;
    const fileLink = await bot.getFileLink(fileId);
    
    console.log(`🎤 Received Voice Message: ${fileLink}`);
    let prog = await startProgress(chatId, "Downloading & Transcribing Voice...");
    
    try {
        // [STT LOGIC WILL GO HERE]
        // Example: const transcribedText = await voiceAgent.transcribe(fileLink);
        
        // For now, hardcode a mock transcript:
        const transcribedText = "This is a simulated transcript. How are you?";
        
        clearInterval(prog.interval);
        bot.deleteMessage(chatId, prog.mid).catch(()=>{});
        
        bot.sendMessage(chatId, `🗣️ <i>You said: "${transcribedText}"</i>\n(Speech-to-Text not yet installed. Proceeding with text response...)`, { parse_mode: 'HTML' });
        
        // Feed the text back into the main brain!
        await processPipeline(chatId, transcribedText, false);
        
    } catch (e) {
        clearInterval(prog.interval);
        bot.sendMessage(chatId, `❌ <b>Voice Error:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
});

// ==========================================
// 8. MAIN TEXT ROUTER
// ==========================================
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/') || msg.voice) return;
    await processPipeline(msg.chat.id, msg.text, false);
});

// ==========================================
// 9. THE CORE AI PIPELINE
// ==========================================
async function processPipeline(chatId, userText, isCron = false) {
    debugLog(isCron ? "CRON" : "USER", userText);
    saveToMemory(chatId, isCron ? 'System' : 'User', userText);

    let prog;
    if (!isCron) prog = await startProgress(chatId, "Thinking...");

    try {
        const promptTemplate = await fs.readFile(PROMPT_FILE, 'utf8');
        const finalPrompt = promptTemplate.replace('{{CONVERSATION_HISTORY}}', getMemoryString(chatId)).replace('{{USER_MESSAGE}}', userText);

        const raw = await callOllama(finalPrompt, true);
        debugLog("LLM Result", raw);
        if (!raw || raw === "") throw new Error("Empty response from Ollama.");

        let cleanStr = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
        const firstBrace = cleanStr.indexOf('{');
        const lastBrace = cleanStr.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) throw new Error("Invalid JSON.");
        cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);

        const dec = JSON.parse(cleanStr);
        if (!isCron) { clearInterval(prog.interval); bot.deleteMessage(chatId, prog.mid).catch(()=>{}); }

        const intent = String(dec.intent).toLowerCase();
        let out = dec.output || '';

        // Intent Logic
        if (intent === 'news') return bot.sendMessage(chatId, await newsAgent.fetchNews(), { parse_mode: 'HTML', disable_web_page_preview: true });
        if (intent === 'weather') return bot.sendMessage(chatId, await weatherAgent.getWeather(out), { parse_mode: 'HTML' });

        if (intent === 'sap') {
            const sapProg = await startProgress(chatId, `Engaging SAP Agent (${dec.action})...`);
            try {
                const res = await sapAgent.querySap(out, dec.action || "gui");
                clearInterval(sapProg.interval);
                return bot.editMessageText(res, { chat_id: chatId, message_id: sapProg.mid, parse_mode: 'HTML' });
            } catch (e) {
                clearInterval(sapProg.interval);
                return bot.editMessageText(`❌ <b>SAP Error:</b> ${e.message}`, { chat_id: chatId, message_id: sapProg.mid, parse_mode: 'HTML' });
            }
        }

        if (intent === 'write_file') {
            const filename = dec.filename || 'snippet.txt';
            let content = out;
            if (content.includes('```')) {
                const m = content.match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
                if (m) content = m[1].trim();
            } else if (filename.endsWith('.c') && content.includes('#include')) {
                content = content.substring(content.indexOf('#include'));
            }
            await fs.writeFile(path.join(SANDBOX_DIR, filename), content, 'utf8');
            return bot.sendMessage(chatId, `💾 <b>File Created:</b> <code>sandbox/${filename}</code>\n<pre>${content}</pre>`, { parse_mode: 'HTML' });
        }

        if (intent === 'cli') {
            if (safeCommands.some(s => out.trim().startsWith(s))) {
                return bot.sendMessage(chatId, `✅ <b>Result:</b>\n<pre>${await cliAgent.runCommand(out)}</pre>`, { parse_mode: 'HTML' });
            } else {
                const cid = Date.now().toString();
                pendingCommands.set(cid, out);
                return bot.sendMessage(chatId, `💻 <b>Confirm:</b> <pre>${out}</pre>`, {
                    parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Run', callback_data: `run_${cid}` }, { text: 'Cancel', callback_data: 'cancel' }]] }
                });
            }
        }

        if (intent === 'chat') {
            // Check if user wants audio reply
            if (userText.toLowerCase().includes("voice") || userText.toLowerCase().includes("speak") || userText.toLowerCase().includes("say")) {
                let ttsProg = await startProgress(chatId, "Generating Audio...");
                const audioPath = await voiceAgent.generateSpeech(out);
                clearInterval(ttsProg.interval);
                bot.deleteMessage(chatId, ttsProg.mid).catch(()=>{});
                await bot.sendVoice(chatId, audioPath, { caption: out });
                return fs.unlink(audioPath).catch(()=>{});
            }
            return bot.sendMessage(chatId, out);
        }

    } catch (e) {
        if (!isCron && prog) clearInterval(prog.interval);
        bot.sendMessage(chatId, `❌ <b>Error:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
}

// CLI Approval
bot.on('callback_query', async (q) => {
    const { message: { chat: { id: chatId }, message_id: mid }, data } = q;
    if (data === 'cancel') return bot.editMessageText('🚫 Cancelled.', { chat_id: chatId, message_id: mid });
    if (data.startsWith('run_')) {
        const cmd = pendingCommands.get(data.split('_')[1]);
        if (!cmd) return;
        bot.editMessageText(`⚙️ Executing...`, { chat_id: chatId, message_id: mid });
        try {
            bot.editMessageText(`✅ <b>Complete:</b>\n<pre>${await cliAgent.runCommand(cmd)}</pre>`, { chat_id: chatId, message_id: mid, parse_mode: 'HTML' });
        } catch (e) {
            bot.editMessageText(`❌ <b>Failed:</b>\n<pre>${e.message}</pre>`, { chat_id: chatId, message_id: mid, parse_mode: 'HTML' });
        }
    }
});

verifyOllama().then(() => console.log("🤖 Agentic Bot Online."));