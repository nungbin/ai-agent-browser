require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// ==========================================
// CONFIGURATION
// ==========================================
// IMPORTANT: Replace this with the actual IP address of your Ollama LXC
const OLLAMA_URL = 'http://192.168.1.105:11434/api/generate'; 

// Enable the stealth plugin to strip bot fingerprints
puppeteer.use(StealthPlugin());

// Initialize the Telegram Bot using the token from the .env file
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error('FATAL ERROR: TELEGRAM_TOKEN is missing from .env file.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Memory store for holding LLM-generated commands until the user approves them
const pendingCommands = new Map();

console.log('🤖 Telegram Assistant is running and listening for commands...');


// ==========================================
// COMMAND 1: /news (The Web Scraper)
// ==========================================
bot.onText(/\/news/, async (msg) => {
  const chatId = msg.chat.id;
  const loadingMsg = await bot.sendMessage(chatId, '⚙️ Launching browser and fetching top news... please wait.');

  try {
    const browser = await puppeteer.launch({
      headless: true, 
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const sourceSite = 'Hacker News';
    
    await page.goto('https://news.ycombinator.com/', { waitUntil: 'domcontentloaded' });

    const articles = await page.evaluate(() => {
      const rows = document.querySelectorAll('.titleline > a');
      const topNews = [];
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        topNews.push({ title: rows[i].innerText, link: rows[i].href });
      }
      return topNews;
    });

    await browser.close();

    let responseText = `📰 <b>Top 5 News from ${sourceSite}</b>\n\n`;
    articles.forEach((article, index) => {
      responseText += `${index + 1}. <a href="${article.link}">${article.title}</a>\n\n`;
    });

    await bot.editMessageText(responseText, {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

  } catch (error) {
    console.error('Error fetching news:', error);
    bot.editMessageText('❌ Sorry, an error occurred while scraping the news.', {
      chat_id: chatId, message_id: loadingMsg.message_id
    });
  }
});


// ==========================================
// COMMAND 2: /files (List Directory)
// ==========================================
bot.onText(/\/files/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const allFiles = await fs.readdir(__dirname);
    const visibleFiles = allFiles.filter(file => !file.startsWith('.'));

    if (visibleFiles.length === 0) {
      return bot.sendMessage(chatId, '📂 The directory is empty (no visible files).');
    }

    const fileList = visibleFiles.join('\n');
    bot.sendMessage(chatId, `📂 <b>Visible Files:</b>\n<pre>${fileList}</pre>`, { parse_mode: 'HTML' });
    
  } catch (error) {
    console.error('Error reading directory:', error);
    bot.sendMessage(chatId, '❌ Could not read the directory.');
  }
});


// ==========================================
// COMMAND 3: /read <filename> (Secure File Reader)
// ==========================================
bot.onText(/\/read (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fileName = match[1].trim();

  if (fileName.startsWith('.') || fileName.includes('..') || fileName.includes('/')) {
    return bot.sendMessage(chatId, '🚫 Access Denied: You cannot read hidden files or navigate outside this folder.');
  }

  const filePath = path.join(__dirname, fileName);

  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return bot.sendMessage(chatId, '❌ That is a directory, not a file.');
    }

    let content = await fs.readFile(filePath, 'utf8');

    if (content.length > 3500) {
      content = content.substring(0, 3500) + '\n\n... [TRUNCATED DUE TO LENGTH] ...';
    }

    const safeContent = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    bot.sendMessage(chatId, `📄 <b>${fileName}:</b>\n<pre>${safeContent}</pre>`, { parse_mode: 'HTML' });
    
  } catch (error) {
    bot.sendMessage(chatId, `❌ Could not find or read the file: ${fileName}`);
  }
});


// ==========================================
// COMMAND 4: The Smart AI Router (Chat vs CLI)
// ==========================================
bot.on('message', async (msg) => {
  // Ignore explicit commands (starting with '/')
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const userText = msg.text;

  // Let the user know the AI is thinking
  bot.sendChatAction(chatId, 'typing');

  // The new prompt forces the LLM to choose between a chat reply or a CLI command
  const prompt = `
    You are an expert AI assistant and Linux Ubuntu system administrator.
    The user's message is: "${userText}"

    You must classify this message into one of two categories:
    1. "chat": The user is making a conversational statement, asking a general question, or saying hello.
    2. "cli": The user wants you to perform a system action, read a file, install software, or check server status.

    If "chat", provide your conversational reply in the "output" field.
    If "cli", provide EXACTLY ONE valid Linux terminal command in the "output" field.

    CRITICAL RULES FOR "cli":
    - NEVER use 'sudo' for standard commands (ls, cat, pwd, echo, etc.).
    - ONLY use 'sudo' if installing or updating or removing a package via 'apt'.
    - If using apt, always include the '-y' flag.

    You MUST respond in strict JSON format using exactly this structure:
    {
      "type": "chat" or "cli",
      "output": "string"
    }
  `;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:3b', // Make sure this matches your model
        prompt: prompt,
        format: 'json',
        stream: false
      })
    });

    const data = await response.json();
    const parsedJson = JSON.parse(data.response);
    
    const intentType = parsedJson.type;
    const aiOutput = parsedJson.output;

    // --- SCENARIO A: Normal Chat ---
    if (intentType === 'chat') {
      return bot.sendMessage(chatId, aiOutput);
    }

    // --- SCENARIO B: System Action (CLI) ---
    if (intentType === 'cli') {
      const generatedCommand = aiOutput;
      const commandId = Date.now().toString();
      pendingCommands.set(commandId, generatedCommand);

      const options = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Run Command', callback_data: `run_${commandId}` },
              { text: '❌ Cancel', callback_data: `cancel_${commandId}` }
            ]
          ]
        }
      };

      bot.sendMessage(chatId, `💻 <b>Generated Command:</b>\n<pre>${generatedCommand}</pre>\n\nDo you want me to execute this on the server?`, options);
    }

  } catch (error) {
    console.error('LLM Translation Error:', error);
    bot.sendMessage(chatId, '❌ Failed to connect to Ollama or parse the intent.');
  }
});


// ==========================================
// HANDLER: Execution Approval (Button Clicks)
// ==========================================
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data; 
  const chatId = msg.chat.id;

  if (data.startsWith('cancel_')) {
    const cmdId = data.replace('cancel_', '');
    pendingCommands.delete(cmdId); 
    return bot.editMessageText('🚫 <i>Command cancelled by user.</i>', { chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML' });
  }

  if (data.startsWith('run_')) {
    const cmdId = data.replace('run_', '');
    const commandToRun = pendingCommands.get(cmdId);

    if (!commandToRun) {
      return bot.answerCallbackQuery(callbackQuery.id, { text: 'Command expired or already run.', show_alert: true });
    }

    bot.editMessageText(`⚙️ <b>Executing:</b> <pre>${commandToRun}</pre>\n<i>Please wait...</i>`, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML' });

    try {
      const { stdout, stderr } = await exec(commandToRun);
      
      let output = stdout.trim() || stderr.trim() || "(Command executed successfully with no text output)";

      if (output.length > 3500) {
        output = output.substring(0, 3500) + '\n\n... [TRUNCATED]';
      }

      const safeOutput = output.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

      bot.editMessageText(`✅ <b>Execution Complete:</b>\n<pre>${commandToRun}</pre>\n\n<b>Output:</b>\n<pre>${safeOutput}</pre>`, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML' });
      
    } catch (error) {
      const errorText = error.stderr || error.message || "Unknown error";
      const safeError = errorText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      bot.editMessageText(`❌ <b>Execution Failed:</b>\n<pre>${commandToRun}</pre>\n\n<b>Error:</b>\n<pre>${safeError}</pre>`, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML' });
    }

    pendingCommands.delete(cmdId);
  }
});
