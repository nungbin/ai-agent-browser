// File: bot.js
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs').promises;

// ==========================================
// 1. HELPERS & CONFIG
// ==========================================
const commandHandler = require('./helpers/commandHandler');
const voiceHelper = require('./helpers/voiceHelper');
const cronHelper = require('./helpers/cronHelper');
const logger = require('./helpers/logger'); // <-- NEW LOGGER

// 0. GLOBAL ERROR HANDLERS (Now using logger)
process.on('uncaughtException', (err) => logger.error('CRITICAL UNCAUGHT EXCEPTION', err.stack));
process.on('unhandledRejection', (reason) => logger.error('UNHANDLED REJECTION', reason.stack || reason));

const DATA_DIR = path.join(__dirname, 'data');
const SANDBOX_DIR = path.join(__dirname, 'sandbox'); 
const PROMPTS_DIR = path.join(__dirname, 'prompts');
const PROMPT_FILE = path.join(PROMPTS_DIR, 'system_prompt.txt');

const isDebug = process.argv.includes('--debug') || process.argv.includes('-d');
logger.setDebug(isDebug);

async function init() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(SANDBOX_DIR, { recursive: true });
    await fs.mkdir(path.join(__dirname, 'skills'), { recursive: true });
    await fs.mkdir(PROMPTS_DIR, { recursive: true });
}
init();

const token = process.env.TELEGRAM_TOKEN;
const OLLAMA_URL = `http://${process.env.OLLAMA_IP}:11434/api/generate`;
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';  
const bot = new TelegramBot(token, { polling: true });

// Shared State for Helpers & Skills
const state = {
    chatMemory: new Map(),
    safeCommands: [],
    pendingCommands: new Map(),
    MEMORY_FILE: path.join(DATA_DIR, 'memory.json'),
    SAFE_FILE: path.join(DATA_DIR, 'safe_commands.json'),
    SANDBOX_DIR: SANDBOX_DIR
};

// ==========================================
// 2. DYNAMIC SKILL REGISTRY (The Magic)
// ==========================================
const activeSkills = {};
let dynamicPromptAdditions = "";

async function loadSkills() {
    const skillsDir = path.join(__dirname, 'skills');
    try {
        const folders = await fs.readdir(skillsDir);
        for (const folder of folders) {
            const folderPath = path.join(skillsDir, folder);
            const stat = await fs.stat(folderPath);
            
            if (stat.isDirectory()) {
                try {
                    const skillModule = require(path.join(folderPath, 'skill.js'));
                    activeSkills[skillModule.name] = skillModule;
                    
                    const mdContent = await fs.readFile(path.join(folderPath, 'skill.md'), 'utf8');
                    dynamicPromptAdditions += `\n${mdContent.trim()}\n`;
                    
                    logger.info("Skill Loaded", skillModule.name);
                } catch (e) {
                    logger.error(`Failed to load skill in /${folder}`, e.message);
                }
            }
        }
    } catch (e) {
        logger.info("System", "No 'skills' directory found yet.");
    }
}

// ==========================================
// 3. PERSISTENCE & MEMORY
// ==========================================
async function loadData() {
    try {
        const mem = await fs.readFile(state.MEMORY_FILE, 'utf8');
        state.chatMemory = new Map(Object.entries(JSON.parse(mem)));
        const safe = await fs.readFile(state.SAFE_FILE, 'utf8');
        state.safeCommands = JSON.parse(safe);
    } catch (e) {
        state.safeCommands = ['pwd', 'ls', 'whoami', 'date', 'gcc', './', 'which'];
    }
}

function saveToMemory(chatId, role, text) {
    const id = chatId.toString();
    if (!state.chatMemory.has(id)) state.chatMemory.set(id, []);
    state.chatMemory.get(id).push({ role, text });
    if (state.chatMemory.get(id).length > 30) state.chatMemory.get(id).shift();
    fs.writeFile(state.MEMORY_FILE, JSON.stringify(Object.fromEntries(state.chatMemory), null, 2)).catch(()=>{});
}

function getMemoryString(chatId) {
  const history = state.chatMemory.get(chatId.toString()) || [];
  return history.length === 0 ? "No prior context." : history.map(msg => `${msg.role}: ${msg.text}`).join('\n');
}

// ==========================================
// 4. PIPELINE HELPERS & HEALTH CHECK
// ==========================================
async function verifyOllama() {
    logger.info("Health Check", `Checking Ollama connection at ${process.env.OLLAMA_IP}...`);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`http://${process.env.OLLAMA_IP}:11434/api/tags`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        const data = await res.json();
        const exists = (data.models || []).some(m => m.name.includes(CORE_MODEL));

        if (exists) {
            logger.info("Health Check", `✅ Ollama Online. Model [${CORE_MODEL}] is ready.`);
            return true;
        } else {
            logger.error("Health Check", `⚠️ Ollama Online, but model [${CORE_MODEL}] was not found.`);
            return false;
        }
    } catch (e) {
        logger.error("Health Check", `❌ Ollama Connection Failed: ${e.message}`);
        return false;
    }
}

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

async function callOllama(prompt) {
    logger.debug("Ollama Prompt", prompt);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); 
    
    try {
        const res = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: CORE_MODEL, prompt, stream: false, keep_alive: -1, format: 'json' }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        let output = data.response;
        if (!output || output.trim() === "") output = data.thinking || "";
        return output.trim();
    } catch (e) {
        clearTimeout(timeoutId);
        throw new Error(e.name === 'AbortError' ? "Ollama request timed out (took over 5 mins)." : `Ollama Error: ${e.message}`);
    }
}

// ==========================================
// 5. MAIN TEXT & VOICE ROUTER
// ==========================================
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.voice.file_id;
    const fileLink = await bot.getFileLink(fileId);
    
    logger.info("Received Voice Message", `Link: ${fileLink}`);
    let prog = await startProgress(chatId, "Downloading & Transcribing Voice...");
    
    try {
        const transcribedText = "This is a simulated transcript. How are you?";
        clearInterval(prog.interval);
        bot.deleteMessage(chatId, prog.mid).catch(()=>{});
        bot.sendMessage(chatId, `🗣️ <i>You said: "${transcribedText}"</i>\n(STT not yet installed. Proceeding...)`, { parse_mode: 'HTML' });
        
        await processPipeline(chatId, transcribedText, false);
    } catch (e) {
        clearInterval(prog.interval);
        logger.error("Voice Error", e.message);
        bot.sendMessage(chatId, `❌ <b>Voice Error:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/') || msg.voice) return;
    await processPipeline(msg.chat.id, msg.text, false);
});

async function processPipeline(chatId, userText, isCron = false) {
    logger.debug(isCron ? "Incoming CRON Pipeline" : "Incoming USER Pipeline", userText);
    saveToMemory(chatId, isCron ? 'System' : 'User', userText);

    let prog;
    if (!isCron) prog = await startProgress(chatId, "Thinking...");

    try {
        const promptTemplate = await fs.readFile(PROMPT_FILE, 'utf8');
        let finalPrompt = promptTemplate
            .replace('{{CONVERSATION_HISTORY}}', getMemoryString(chatId))
            .replace('{{USER_MESSAGE}}', userText)
            .replace('{{DYNAMIC_SKILLS}}', dynamicPromptAdditions);

        const raw = await callOllama(finalPrompt);
        logger.debug("LLM Result", raw);
        if (!raw || raw === "") throw new Error("Empty response from Ollama.");

        let cleanStr = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
        const firstBrace = cleanStr.indexOf('{');
        const lastBrace = cleanStr.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) throw new Error("Invalid JSON.");
        cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);

        const dec = JSON.parse(cleanStr);
        if (!isCron) { clearInterval(prog.interval); bot.deleteMessage(chatId, prog.mid).catch(()=>{}); }

        const intent = String(dec.intent).toLowerCase();
        const skillContext = { bot, chatId, state, processPipeline };

        if (activeSkills[intent]) {
            let skillProg = await startProgress(chatId, `Engaging [${intent}] skill...`);
            try {
                const result = await activeSkills[intent].execute(dec, skillContext);
                clearInterval(skillProg.interval);
                bot.deleteMessage(chatId, skillProg.mid).catch(()=>{});
                
                if (result) bot.sendMessage(chatId, result, { parse_mode: 'HTML', disable_web_page_preview: true });
            } catch (e) {
                clearInterval(skillProg.interval);
                logger.error(`Skill Error (${intent})`, e.message);
                bot.editMessageText(`❌ <b>Skill Error (${intent}):</b> ${e.message}`, { chat_id: chatId, message_id: skillProg.mid, parse_mode: 'HTML' });
            }
        } 
        else if (intent === 'chat') {
            const out = dec.output || "I'm not sure how to respond to that.";
            saveToMemory(chatId, 'Assistant', out);
            
            if (userText.toLowerCase().includes("voice") || userText.toLowerCase().includes("speak")) {
                let ttsProg = await startProgress(chatId, "Generating Audio...");
                const audioPath = await voiceHelper.generateSpeech(out, SANDBOX_DIR);
                clearInterval(ttsProg.interval);
                bot.deleteMessage(chatId, ttsProg.mid).catch(()=>{});
                await bot.sendVoice(chatId, audioPath, { caption: out });
                return fs.unlink(audioPath).catch(()=>{});
            }
            return bot.sendMessage(chatId, out);
        } else {
            logger.error("Skill Missing", `Tried to use ${intent} but folder not found.`);
            bot.sendMessage(chatId, `⚠️ I decided to use the <b>${intent}</b> skill, but it is not installed.`, { parse_mode: 'HTML' });
        }

    } catch (e) {
        if (!isCron && prog) clearInterval(prog.interval);
        logger.error("Pipeline Error", e.message);
        bot.sendMessage(chatId, `❌ <b>Error:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
}

// ==========================================
// 6. INITIALIZATION
// ==========================================
async function startSystem() {
    // Run the 7-day log cleanup before doing anything else
    await logger.cleanOldLogs();
    
    await loadData();
    await loadSkills();
    
    commandHandler.register(bot, state);
    cronHelper.init((chatId, task, isCron) => processPipeline(chatId, task, isCron));
    
    await verifyOllama();
    logger.info("System", "🤖 Agentic Bot Online (Modular V2).");
}

startSystem();