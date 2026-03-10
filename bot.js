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
const logger = require('./helpers/logger');

process.on('uncaughtException', (err) => logger.error('CRITICAL EXCEPTION', err.stack));
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

const state = {
    chatMemory: new Map(),
    safeCommands: [],
    pendingCommands: new Map(),
    personaEnabled: false, // Default to Persona OFF
    MEMORY_FILE: path.join(DATA_DIR, 'memory.json'),
    SAFE_FILE: path.join(DATA_DIR, 'safe_commands.json'),
    SANDBOX_DIR: SANDBOX_DIR
};

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
    } catch (e) { }
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
    if (state.chatMemory.get(id).length > parseInt(process.env.MEMORY_LIMIT || 30)) state.chatMemory.get(id).shift();
    fs.writeFile(state.MEMORY_FILE, JSON.stringify(Object.fromEntries(state.chatMemory), null, 2)).catch(()=>{});
}

function getMemoryString(chatId) {
  const history = state.chatMemory.get(chatId.toString()) || [];
  return history.length === 0 ? "No prior context." : history.map(msg => `${msg.role}: ${msg.text}`).join('\n');
}

// ==========================================
// 4. PIPELINE HELPERS
// ==========================================
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
        let output = data.response || data.thinking || "";
        return output.trim();
    } catch (e) {
        clearTimeout(timeoutId);
        throw new Error(e.name === 'AbortError' ? "Ollama request timed out." : `Ollama Error: ${e.message}`);
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

// === BUTTON CLICK HANDLER FOR UNSAFE COMMANDS ===
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;

    if (data === 'cancel') {
        bot.editMessageText("❌ Command cancelled.", { chat_id: chatId, message_id: msgId });
    } else if (data.startsWith('run_')) {
        const cid = data.split('_')[1];
        const cmd = state.pendingCommands.get(cid);
        if (cmd) {
            bot.editMessageText(`⚙️ Executing...\n<pre>${cmd.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' });
            try {
                const resultText = await activeSkills['cli'].runCommand(cmd);
                bot.editMessageText(`💻 <b>Command:</b> <code>${cmd.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>\n✅ <b>Result:</b>\n<pre>${resultText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' });
            } catch(e) {
                bot.editMessageText(`❌ Error: ${e.message}`, { chat_id: chatId, message_id: msgId });
            }
            state.pendingCommands.delete(cid);
        } else {
            bot.editMessageText("❌ Command expired or not found.", { chat_id: chatId, message_id: msgId });
        }
    } else {
        // --- 🌟 NEW: DYNAMIC SKILL BUTTON ROUTING (Grocery) 🌟 ---
        const parts = data.split('|');
        const skillName = parts[0];
        
        if (activeSkills[skillName]) {
            try {
                const parsed = { output: { action: 'button_click', raw_data: data } };
                const escapeHTML = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const context = { bot, chatId, state, processPipeline, escapeHTML, messageId: msgId };
                
                if (typeof activeSkills[skillName].execute === 'function') {
                    await activeSkills[skillName].execute(parsed, context);
                } else if (typeof activeSkills[skillName] === 'function') {
                    await activeSkills[skillName](null, parsed, context); 
                }
            } catch (e) {
                logger.error(`Callback Error [${skillName}]`, e.message);
                bot.sendMessage(chatId, `❌ Button Error: ${e.message}`);
            }
        }
    }
    bot.answerCallbackQuery(query.id).catch(()=>{});
});

// ==========================================
// 5. MAIN TEXT & VOICE ROUTER
// ==========================================
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const fileLink = await bot.getFileLink(msg.voice.file_id);
    let prog = await startProgress(chatId, "Listening...");
    
    try {
        const sttUrl = process.env.STT_SERVER_URL;
        const transcribedText = await voiceHelper.transcribeAudio(fileLink, sttUrl, SANDBOX_DIR);
        if (!transcribedText || transcribedText.trim() === "") throw new Error("Could not hear audio clearly.");
        
        clearInterval(prog.interval);
        bot.deleteMessage(chatId, prog.mid).catch(()=>{});
        bot.sendMessage(chatId, `🗣️ <i>"${transcribedText}"</i>`, { parse_mode: 'HTML' });
        
        await processPipeline(chatId, transcribedText, false, true); 
    } catch (e) {
        clearInterval(prog.interval);
        bot.sendMessage(chatId, `❌ <b>Voice Error:</b> ${e.message}`, { parse_mode: 'HTML' });
    }
});

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/') || msg.voice) return;
    await processPipeline(msg.chat.id, msg.text, false, false);
});

async function processPipeline(chatId, userText, isCron = false, isVoiceInput = false) {
    saveToMemory(chatId, isCron ? 'System' : 'User', userText);
    let prog; if (!isCron) prog = await startProgress(chatId, "Thinking...");

    try {
        const promptTemplate = await fs.readFile(PROMPT_FILE, 'utf8');
        
        // --- 🌟 NEW: THE WAKE-WORD LOGIC 🌟 ---
        const lowerText = userText.toLowerCase();
        const heardName = lowerText.includes('veronica');
        
        // Persona is ON if global toggle is ON, or if 'veronica' was spoken
        const isPersonaOn = state.personaEnabled || heardName;
        
        if (heardName && !state.personaEnabled) {
            logger.info("Wake-Word", `👱‍♀️ 'Veronica' detected! Temporarily enabling personality.`);
        }
        
        const BOT_PERSONA = isPersonaOn ? (process.env.BOT_PERSONA || 'You are an advanced AI assistant.') 
                                        : 'You are a strict command routing engine. Do NOT generate conversational replies. Route everything to the correct skill immediately.';
        const BOT_NAME = isPersonaOn ? (process.env.BOT_NAME || 'Assistant') : 'System Router';
        const USER_NAME = isPersonaOn ? (process.env.USER_NAME || 'User') : 'Administrator';

        let finalPrompt = promptTemplate
            .replace(/\{\{BOT_PERSONA\}\}/g, BOT_PERSONA)
            .replace(/\{\{BOT_NAME\}\}/g, BOT_NAME)
            .replace(/\{\{USER_NAME\}\}/g, USER_NAME)
            .replace(/\{\{CONVERSATION_HISTORY\}\}/g, getMemoryString(chatId))
            .replace(/\{\{USER_MESSAGE\}\}/g, userText)
            .replace(/\{\{DYNAMIC_SKILLS\}\}/g, dynamicPromptAdditions);

        const raw = await callOllama(finalPrompt);
        if (!raw || raw === "") throw new Error("Empty response from Ollama.");

        let cleanStr = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
        cleanStr = cleanStr.substring(cleanStr.indexOf('{'), cleanStr.lastIndexOf('}') + 1);
        const dec = JSON.parse(cleanStr);
        
        if (!isCron) { clearInterval(prog.interval); bot.deleteMessage(chatId, prog.mid).catch(()=>{}); }

        const intent = String(dec.intent).toLowerCase();
        const wantsVoice = isVoiceInput || userText.toLowerCase().includes("voice") || userText.toLowerCase().includes("speak");

        // ONLY output conversational reply if Persona is ON
        if (dec.conversational_reply && intent !== 'chat' && isPersonaOn) {
            saveToMemory(chatId, 'Assistant', dec.conversational_reply);
            if (wantsVoice) {
                try {
                    const audioPath = await voiceHelper.generateSpeech(dec.conversational_reply, SANDBOX_DIR);
                    await bot.sendVoice(chatId, audioPath, { caption: `💬 ${dec.conversational_reply}` });
                    fs.unlink(audioPath).catch(()=>{});
                } catch (e) { 
                    bot.sendMessage(chatId, `💬 <i>${dec.conversational_reply}</i>`, { parse_mode: 'HTML' })
                       .catch(() => bot.sendMessage(chatId, `💬 ${dec.conversational_reply}`)); 
                }
            } else {
                bot.sendMessage(chatId, `💬 <i>${dec.conversational_reply}</i>`, { parse_mode: 'HTML' })
                   .catch(() => bot.sendMessage(chatId, `💬 ${dec.conversational_reply}`));
            }
        }

        // 3. EXECUTE THE SKILL
        if (activeSkills[intent]) {
            let skillProg = await startProgress(chatId, `Executing task...`);
            try {
                const escapeHTML = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                
                // Passed usePersona to context so skills know if they should talk!
                const result = await activeSkills[intent].execute(dec, { bot, chatId, state, processPipeline, escapeHTML, usePersona: isPersonaOn });
                
                clearInterval(skillProg.interval);
                bot.deleteMessage(chatId, skillProg.mid).catch(()=>{});
                
                if (result) {
                    bot.sendMessage(chatId, result, { parse_mode: 'HTML', disable_web_page_preview: true })
                       .catch(err => {
                           logger.error("Telegram HTML Error", err.message);
                           bot.sendMessage(chatId, result, { disable_web_page_preview: true });
                       });
                }
            } catch (e) {
                clearInterval(skillProg.interval);
                bot.editMessageText(`❌ <b>Error:</b> ${e.message}`, { chat_id: chatId, message_id: skillProg.mid, parse_mode: 'HTML' })
                   .catch(() => bot.editMessageText(`❌ Error: ${e.message}`, { chat_id: chatId, message_id: skillProg.mid }));
            }
        } 
        else if (intent === 'chat') {
            if (!isPersonaOn) {
                return bot.sendMessage(chatId, "🔇 <i>Persona is disabled. Please provide a valid CLI command or skill request.</i>", { parse_mode: 'HTML' });
            }

            const out = dec.conversational_reply || dec.output || "I'm not sure how to respond to that.";
            saveToMemory(chatId, 'Assistant', out);
            if (wantsVoice) {
                let ttsProg = await startProgress(chatId, "Generating Audio...");
                try {
                    const audioPath = await voiceHelper.generateSpeech(out, SANDBOX_DIR);
                    clearInterval(ttsProg.interval);
                    bot.deleteMessage(chatId, ttsProg.mid).catch(()=>{});
                    await bot.sendVoice(chatId, audioPath, { caption: out });
                    return fs.unlink(audioPath).catch(()=>{});
                } catch(e) { 
                    clearInterval(ttsProg.interval);
                    bot.deleteMessage(chatId, ttsProg.mid).catch(()=>{});
                    logger.error("TTS Error", e.message);
                    return bot.sendMessage(chatId, out); 
                }
            }
            return bot.sendMessage(chatId, out);
        }

    } catch (e) {
        if (!isCron && prog) clearInterval(prog.interval);
        logger.error("Pipeline Error", e.message);
        bot.sendMessage(chatId, `❌ <b>Error:</b> ${e.message}`, { parse_mode: 'HTML' })
           .catch(() => bot.sendMessage(chatId, `❌ Error: ${e.message}`));
    }
}

// ==========================================
// 6. INITIALIZATION
// ==========================================
async function checkOllama() {
    logger.info("AI Check", `Pinging Ollama at ${process.env.OLLAMA_IP}...`);
    try {
        const res = await fetch(`http://${process.env.OLLAMA_IP}:11434/api/tags`);
        if (!res.ok) throw new Error("Bad status code");
        logger.info("AI Check", "✅ Ollama is online and responsive.");
    } catch (e) {
        logger.error("AI Check", `❌ Could not connect to Ollama: ${e.message}`);
    }
}

async function startSystem() {
    await logger.cleanOldLogs();
    await checkOllama();
    await loadData();
    await loadSkills();
    commandHandler.register(bot, state);
    cronHelper.init((chatId, task, isCron) => processPipeline(chatId, task, isCron));
    
    // Dynamically display whether Persona is ON or OFF at startup
    const status = state.personaEnabled ? "ON" : "OFF";
    logger.info("System", `🤖 ${process.env.BOT_NAME || 'Agentic Bot'} Online (Persona is ${status}).`);
}

startSystem();