// File: helpers/commandHandler.js
const fs = require('fs').promises;
const cronHelper = require('./cronHelper'); // Import the cron helper!

exports.register = (bot, state) => {
    
    // 1. THE MAIN MENU
    bot.onText(/^\/start/, (msg) => {
        const welcomeMessage = `
🤖 <b>Agentic Bot Online (Modular V2)</b>

<b>Core Commands:</b>
/clear - Wipe conversation memory
/persona - Toggle AI Personality (On/Off)

<b>Security & Tools:</b>
/safe - View auto-execute commands
/addsafe [cmd] - Add a new safe command
/delsafe [cmd] - Remove a safe command
/list - Show running pending tasks
/kill [id] - Cancel a pending task

<b>Scheduling:</b>
/jobs - View active scheduled cron jobs
/deljob [id] - Delete a scheduled job
`;
        bot.sendMessage(msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
    });

    // 2. MEMORY MANAGEMENT
    bot.onText(/^\/clear/, (msg) => {
        state.chatMemory.set(msg.chat.id.toString(), []);
        bot.sendMessage(msg.chat.id, "🧹 Conversation history cleared.");
    });

    // 3. PERSONA TOGGLE
    bot.onText(/^\/persona/, (msg) => {
        state.personaEnabled = state.personaEnabled === false ? true : false;
        const status = state.personaEnabled ? "🟢 ON (Veronica is listening)" : "🔴 OFF (Silent CLI Mode)";
        bot.sendMessage(msg.chat.id, `🎭 Persona mode is now ${status}.`);
    });

    // 4. SAFE COMMANDS LIST
    bot.onText(/^\/safe$/, (msg) => {
        if (state.safeCommands.length === 0) {
            return bot.sendMessage(msg.chat.id, "🛡️ No safe commands configured.");
        }
        bot.sendMessage(msg.chat.id, `🛡️ <b>Safe CLI Commands:</b>\n<pre>${state.safeCommands.join('\n')}</pre>`, { parse_mode: 'HTML' });
    });

    // 5. ADD SAFE COMMAND
    bot.onText(/^\/addsafe (.+)/, async (msg, match) => {
        const newCmd = match[1].trim();
        if (!state.safeCommands.includes(newCmd)) {
            state.safeCommands.push(newCmd);
            await fs.writeFile(state.SAFE_FILE, JSON.stringify(state.safeCommands, null, 2)).catch(()=>{});
            bot.sendMessage(msg.chat.id, `✅ Added <code>${newCmd}</code> to safe list.`, { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(msg.chat.id, `⚠️ <code>${newCmd}</code> is already in the safe list.`, { parse_mode: 'HTML' });
        }
    });

    // 6. DELETE SAFE COMMAND
    bot.onText(/^\/delsafe (.+)/, async (msg, match) => {
        const cmdToRemove = match[1].trim();
        const initialLength = state.safeCommands.length;
        state.safeCommands = state.safeCommands.filter(cmd => cmd !== cmdToRemove);
        
        if (state.safeCommands.length < initialLength) {
            await fs.writeFile(state.SAFE_FILE, JSON.stringify(state.safeCommands, null, 2)).catch(()=>{});
            bot.sendMessage(msg.chat.id, `🗑️ Removed <code>${cmdToRemove}</code> from safe list.`, { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(msg.chat.id, `⚠️ <code>${cmdToRemove}</code> not found in safe list.`, { parse_mode: 'HTML' });
        }
    });

    // 7. PENDING COMMANDS LIST
    bot.onText(/^\/list/, (msg) => {
        if (state.pendingCommands.size === 0) {
            return bot.sendMessage(msg.chat.id, "📭 No pending commands waiting for approval.");
        }
        let listStr = "⏳ <b>Pending Commands:</b>\n\n";
        for (const [id, cmd] of state.pendingCommands.entries()) {
            listStr += `<b>ID:</b> <code>${id}</code>\n<b>Cmd:</b> <pre>${cmd}</pre>\n\n`;
        }
        bot.sendMessage(msg.chat.id, listStr, { parse_mode: 'HTML' });
    });

    // 8. KILL PENDING COMMAND
    bot.onText(/^\/kill (.+)/, (msg, match) => {
        const killId = match[1].trim();
        if (state.pendingCommands.has(killId)) {
            state.pendingCommands.delete(killId);
            bot.sendMessage(msg.chat.id, `🛑 Pending command <code>${killId}</code> cancelled.`, { parse_mode: 'HTML' });
        } else {
            bot.sendMessage(msg.chat.id, `⚠️ No pending command found with ID <code>${killId}</code>.`, { parse_mode: 'HTML' });
        }
    });

    // 9. SCHEDULED CRON JOBS LIST
    bot.onText(/^\/jobs/, (msg) => {
        bot.sendMessage(msg.chat.id, cronHelper.listJobs(), { parse_mode: 'HTML' });
    });

    // 10. DELETE SCHEDULED CRON JOB
    bot.onText(/^\/deljob (.+)/, (msg, match) => {
        const jobId = match[1].trim();
        bot.sendMessage(msg.chat.id, cronHelper.removeJob(jobId), { parse_mode: 'HTML' });
    });
};