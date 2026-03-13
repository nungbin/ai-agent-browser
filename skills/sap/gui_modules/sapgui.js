const socketManager = require('../../../helpers/socketManager');
const logger = require('../../../helpers/logger');

// Ensure server is running (safe to call multiple times)
socketManager.initSocketServer();

module.exports = async (parsed, context) => {
    const chatId = context.chatId;
    const bot = context.bot;

    const tcode = (parsed.tcode || 'SU01').toUpperCase();
    const targetUser = (parsed.target_user || parsed.username || 'TEST1').toUpperCase();
    const programName = (parsed.program_name || 'ZHELLO_WORLD').toUpperCase();
    
    const initialPassword = `Init${Math.floor(Math.random() * 9000) + 1000}!`;

    if (!socketManager.isWindowsConnected()) {
        return await bot.sendMessage(chatId, "⚠️ **Offline:** The Surface Pro robot is not currently connected to the Linux Brain.", { parse_mode: 'Markdown' });
    }

    const targetDisplay = tcode === 'SE38' ? programName : targetUser;
    let logText = `🤖 **SAP GUI Robot Initiated**\nTarget: \`${targetDisplay}\` via \`${tcode}\`\n\n\`\`\`text\n> Waking up Windows...`;
    
    const statusMessage = await bot.sendMessage(chatId, logText + "\n\`\`\`", { parse_mode: 'Markdown' });
    const messageId = statusMessage.message_id;

    const updateTelegramConsole = async (newText) => {
        logText += `\n> ${newText}`;
        try {
            await bot.editMessageText(logText + "\n\`\`\`", { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' });
        } catch (e) { /* Ignore rate-limit errors */ }
    };

    const payload = {
        username: process.env.SAP_USER,
        password: process.env.SAP_PASSWORD,
        tcode: tcode,
        target_user: targetUser,
        target_pass: initialPassword,
        program_name: programName // 🌟 NEW: Send the program name!
    };

    try {
        await updateTelegramConsole(`Payload sent to Surface Pro. Executing RPA for ${tcode}...`);
        
        const result = await socketManager.executeSapTask(payload, async (statusMsg) => {
            logger.info(`[SURFACE PRO]: ${statusMsg}`);
            await updateTelegramConsole(statusMsg);
        });

        if (result.status === "Success") {
            if (tcode === 'SE38') {
                await bot.sendMessage(chatId, `🎉 **Task Completed!**\n\n📜 **Program:** \`${result.program}\` was successfully created and activated!`, { parse_mode: 'Markdown' });
            } else {
                await bot.sendMessage(chatId, `🎉 **Task Completed!**\n\n👤 **User:** \`${result.user}\`\n🔑 **Password:** \`${result.password}\``, { parse_mode: 'Markdown' });
            }
        } else {
            await bot.sendMessage(chatId, `❌ **Task Failed:** The VBScript encountered an error. Check the terminal logs above.`, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        logger.error(error);
        await bot.sendMessage(chatId, `⚠️ **System Error:** ${error.message}`);
    }
};