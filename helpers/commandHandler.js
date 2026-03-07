// File: helpers/commandHandler.js
const fs = require('fs').promises;
const path = require('path');
const cronHelper = require('./cronHelper');
const { runCommand } = require('../skills/cli/skill'); // Reuse CLI logic for approvals

exports.register = (bot, state) => {
    
    bot.onText(/\/start|\/help/, (msg) => {
        const helpText = `🤖 <b>Agentic AI Online (Modular V2):</b>
/files - List Sandbox files
/read [file] - Read Sandbox file
/clear - Wipe memory context
/safe - View auto-execute CLI list
/allow [cmd] - Add to auto-execute
/deny [cmd] - Remove from auto-execute
/jobs - View scheduled tasks
/removejob [id] - Delete a task`;
        bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' });
    });

    bot.onText(/\/clear/, (msg) => {
        state.chatMemory.delete(msg.chat.id.toString());
        fs.writeFile(state.MEMORY_FILE, JSON.stringify(Object.fromEntries(state.chatMemory), null, 2)).catch(()=>{});
        bot.sendMessage(msg.chat.id, '🧹 <b>Memory Cleared!</b>', { parse_mode: 'HTML' });
    });

    bot.onText(/\/safe$/, (msg) => bot.sendMessage(msg.chat.id, `🛡️ <b>Safe List:</b>\n<pre>${state.safeCommands.join('\n')}</pre>`, { parse_mode: 'HTML' }));

    bot.onText(/\/allow (.+)/, async (msg, match) => {
        const cmd = match[1].trim();
        if (!state.safeCommands.includes(cmd)) {
            state.safeCommands.push(cmd);
            await fs.writeFile(state.SAFE_FILE, JSON.stringify(state.safeCommands, null, 2));
            bot.sendMessage(msg.chat.id, `✅ <b>Added:</b> <code>${cmd}</code>`, { parse_mode: 'HTML' });
        }
    });

    bot.onText(/\/deny (.+)/, async (msg, match) => {
        const cmd = match[1].trim();
        state.safeCommands = state.safeCommands.filter(c => c !== cmd);
        await fs.writeFile(state.SAFE_FILE, JSON.stringify(state.safeCommands, null, 2));
        bot.sendMessage(msg.chat.id, `🚫 <b>Removed:</b> <code>${cmd}</code>`, { parse_mode: 'HTML' });
    });

    bot.onText(/\/jobs/, (msg) => bot.sendMessage(msg.chat.id, cronHelper.listJobs(), { parse_mode: 'HTML' }));
    
    bot.onText(/\/removejob (.+)/, async (msg, match) => {
        bot.sendMessage(msg.chat.id, await cronHelper.removeJob(match[1].trim()), { parse_mode: 'HTML' });
    });

    bot.onText(/\/files/, async (msg) => {
        try {
            const all = await fs.readdir(state.SANDBOX_DIR);
            const files = all.filter(f => !f.startsWith('.'));
            bot.sendMessage(msg.chat.id, `📂 <b>Sandbox:</b>\n<pre>${files.join('\n') || 'Empty'}</pre>`, { parse_mode: 'HTML' });
        } catch (e) { bot.sendMessage(msg.chat.id, '❌ Error reading sandbox.'); }
    });

    bot.onText(/\/read (.+)/, async (msg, match) => {
        const file = match[1].trim();
        if (file.includes('..') || file.includes('/')) return;
        try {
            const data = await fs.readFile(path.join(state.SANDBOX_DIR, file), 'utf8');
            bot.sendMessage(msg.chat.id, `📄 <b>sandbox/${file}:</b>\n<pre>${data.substring(0, 3500)}</pre>`, { parse_mode: 'HTML' });
        } catch (e) { bot.sendMessage(msg.chat.id, '❌ File not found.'); }
    });

    // Handle CLI Confirmation Buttons
    bot.on('callback_query', async (q) => {
        const { message: { chat: { id: chatId }, message_id: mid }, data } = q;
        if (data === 'cancel') return bot.editMessageText('🚫 Cancelled.', { chat_id: chatId, message_id: mid });
        if (data.startsWith('run_')) {
            const cmd = state.pendingCommands.get(data.split('_')[1]);
            if (!cmd) return;
            bot.editMessageText(`⚙️ Executing...`, { chat_id: chatId, message_id: mid });
            try {
                const res = await runCommand(cmd);
                bot.editMessageText(`✅ <b>Complete:</b>\n<pre>${res}</pre>`, { chat_id: chatId, message_id: mid, parse_mode: 'HTML' });
            } catch (e) {
                bot.editMessageText(`❌ <b>Failed:</b>\n<pre>${e.message}</pre>`, { chat_id: chatId, message_id: mid, parse_mode: 'HTML' });
            }
        }
    });
};