const socketManager = require('../../../helpers/socketManager');
const logger = require('../../../helpers/logger');

socketManager.initSocketServer();

module.exports = async (parsed, context) => {
    const chatId = context.chatId;
    const bot = context.bot;

    const tcode = String(parsed.tcode || parsed.TCode || 'SU01').toUpperCase().trim();
    const targetUser = String(parsed.target_user || parsed.username || 'TEST1').toUpperCase().trim();
    
    // ======================================================================
    // 🌟 THE CATCH-ALL NAME NET 🌟
    let aiNameFallback = parsed.structure_name || parsed.structureName || parsed.program_name || parsed.programName || parsed.name || '';
    
    let programName = String(parsed.program_name || aiNameFallback).toUpperCase().trim();
    let structureName = String(parsed.structure_name || aiNameFallback).toUpperCase().trim();

    const enforceSAPNamespace = (name, defaultName) => {
        if (!name || name === 'UNDEFINED' || name === 'NULL' || name === 'UNKNOWN') return defaultName;
        name = name.replace(/[^A-Z0-9_]/g, ''); 
        if (!name.startsWith('Z') && !name.startsWith('Y')) name = 'Z' + name;
        return name.substring(0, 16); 
    };

    programName = enforceSAPNamespace(programName, 'ZHELLO_WORLD');
    structureName = enforceSAPNamespace(structureName, 'ZSTR_TEST1');
    // ======================================================================

    const initialPassword = `Init${Math.floor(Math.random() * 9000) + 1000}!`;

    if (!socketManager.isWindowsConnected()) {
        return await bot.sendMessage(chatId, "⚠️ **Offline:** The Surface Pro robot is not currently connected.", { parse_mode: 'Markdown' });
    }

    let vbsFileToRun = 'surgeon.vbs';
    if (tcode === 'SE38') vbsFileToRun = 'se38_creator.vbs';
    if (tcode === 'SE11') vbsFileToRun = 'se11_creator.vbs';

    let targetDisplay = targetUser;
    if (tcode === 'SE38') targetDisplay = programName;
    if (tcode === 'SE11') targetDisplay = structureName;

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
        vbs_file: vbsFileToRun,
        target_user: targetUser,
        target_pass: initialPassword,
        program_name: programName,
        struct_name: structureName
    };

    try {
        await updateTelegramConsole(`Payload sent to Surface Pro. Executing RPA for ${tcode}...`);
        
        const result = await socketManager.executeSapTask(payload, async (statusMsg) => {
            logger.info(`[SURFACE PRO]: ${statusMsg}`);
            await updateTelegramConsole(statusMsg);
        });

        // 🛡️ FIXED: Using local variables (programName, structureName, targetUser, initialPassword) 
        // instead of looking inside the 'result' object!
        if (result.status === "Success") {
            if (tcode === 'SE38') {
                await bot.sendMessage(chatId, `🎉 **Task Completed!**\n\n📜 **Program:** \`${programName}\` was successfully created and activated!`, { parse_mode: 'Markdown' });
            } else if (tcode === 'SE11') {
                await bot.sendMessage(chatId, `🎉 **Task Completed!**\n\n🗄️ **Structure:** \`${structureName}\` was successfully created and activated!`, { parse_mode: 'Markdown' });
            } else {
                await bot.sendMessage(chatId, `🎉 **Task Completed!**\n\n👤 **User:** \`${targetUser}\`\n🔑 **Password:** \`${initialPassword}\``, { parse_mode: 'Markdown' });
            }
        } else {
            await bot.sendMessage(chatId, `❌ **Task Failed:** The VBScript encountered an error.`, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        logger.error(error);
        await bot.sendMessage(chatId, `⚠️ **System Error:** ${error.message}`);
    }
};