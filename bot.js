// File: bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs').promises;

// Error Handlers
process.on('uncaughtException', (err) => console.error('🔥 [CRITICAL]:', err.message));
process.on('unhandledRejection', (reason) => console.error('⚠️ [REJECTION]:', reason.message || reason));

// Agents
const cliAgent = require('./agents/cliAgent');
const sapAgent = require('./agents/sapAgent');
const cronAgent = require('./agents/cronAgent'); 
const newsAgent = require('./agents/newsAgent');
const weatherAgent = require('./agents/weatherAgent');

// Config
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

// Persistence
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

// Health Check
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

// Helpers
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
        
        // Handle models that return "thinking" instead of "response"
        let output = data.response;
        if (!output || output.trim() === "") {
            output = data.thinking || "";
        }
        return output.trim();
    } catch (e) {
        clearTimeout(timeoutId);
        throw new Error(e.name === 'AbortError' ? "Ollama timed out." : `Ollama Error: ${e.message}`);
    }
}

// Bot Handlers
bot.onText(/\/start|\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, "🤖 <b>Agentic AI Online</b>\n/files - View Sandbox\n/read [file] - Read Sandbox file\n/status - Check health", { parse_mode: 'HTML' });
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    saveToMemory(chatId, 'User', msg.text);

    let prog = await startProgress(chatId, "Thinking...");

    try {
        const promptTemplate = await fs.readFile(PROMPT_FILE, 'utf8');
        const finalPrompt = promptTemplate.replace('{{CONVERSATION_HISTORY}}', getMemoryString(chatId)).replace('{{USER_MESSAGE}}', msg.text);

        const raw = await callOllama(finalPrompt, true);
        debugLog("LLM Result", raw);

        if (!raw || raw === "") throw new Error("Ollama returned an empty response.");

        // Robust JSON Extraction
        let cleanStr = raw.replace(/<think>[\s\S]*?<\/think>/gi, ''); // Remove thinking tags
        cleanStr = cleanStr.replace(/```json|```/gi, '').trim();
        
        const firstBrace = cleanStr.indexOf('{');
        const lastBrace = cleanStr.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) throw new Error("Response is not valid JSON.");
        cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);

        const dec = JSON.parse(cleanStr);

        clearInterval(prog.interval);
        bot.deleteMessage(chatId, prog.mid).catch(()=>{});

        const intent = String(dec.intent).toLowerCase();
        let out = dec.output || '';

        // Intent Logic
        if (intent === 'news') {
            const res = await newsAgent.fetchNews();
            return bot.sendMessage(chatId, res, { parse_mode: 'HTML', disable_web_page_preview: true });
        }

        if (intent === 'weather') {
            const res = await weatherAgent.getWeather(out);
            return bot.sendMessage(chatId, res, { parse_mode: 'HTML' });
        }

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
            const filePath = path.join(SANDBOX_DIR, filename);
            let content = out;
            if (content.includes('```')) {
                const m = content.match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
                if (m) content = m[1].trim();
            }
            await fs.writeFile(filePath, content, 'utf8');
            return bot.sendMessage(chatId, `💾 <b>File Created:</b> <code>sandbox/${filename}</code>\n<pre>${content}</pre>`, { parse_mode: 'HTML' });
        }

        if (intent === 'cli') {
            const isSafe = safeCommands.some(s => out.trim().startsWith(s));
            if (isSafe) {
                const res = await cliAgent.runCommand(out);
                return bot.sendMessage(chatId, `✅ <b>Result:</b>\n<pre>${res}</pre>`, { parse_mode: 'HTML' });
            } else {
                const cid = Date.now().toString();
                pendingCommands.set(cid, out);
                return bot.sendMessage(chatId, `💻 <b>Confirm:</b> <pre>${out}</pre>`, {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: [[{ text: 'Run', callback_data: `run_${cid}` }, { text: 'Cancel', callback_data: 'cancel' }]] }
                });
            }
        }

        if (intent === 'chat') return bot.sendMessage(chatId, out);

    } catch (e) {
        if (prog) clearInterval(prog.interval);
        bot.sendMessage(chatId, `❌ <b>Error:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
});

bot.on('callback_query', async (q) => {
    const { message: { chat: { id: chatId }, message_id: mid }, data } = q;
    if (data === 'cancel') return bot.editMessageText('🚫 Cancelled.', { chat_id: chatId, message_id: mid });
    if (data.startsWith('run_')) {
        const cmd = pendingCommands.get(data.split('_')[1]);
        if (!cmd) return;
        bot.editMessageText(`⚙️ Executing...`, { chat_id: chatId, message_id: mid });
        try {
            const res = await cliAgent.runCommand(cmd);
            bot.editMessageText(`✅ <b>Complete:</b>\n<pre>${res}</pre>`, { chat_id: chatId, message_id: mid, parse_mode: 'HTML' });
        } catch (e) {
            bot.editMessageText(`❌ <b>Failed:</b>\n<pre>${e.message}</pre>`, { chat_id: chatId, message_id: mid, parse_mode: 'HTML' });
        }
    }
});

verifyOllama().then(() => console.log("🤖 Hybrid Bot Online."));