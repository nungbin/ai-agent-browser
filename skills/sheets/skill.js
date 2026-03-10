// File: skills/sheets/skill.js
const logger = require('../../helpers/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
    name: "sheets",
    execute: async (parsed, context) => {
        const payload = typeof parsed.output === 'object' && parsed.output !== null ? parsed.output : parsed;
        
        let targetAlias = 'unknown';

        // 1. Determine the target sheet
        if (payload.action === 'button_click') {
            // Data format: sheets|add_grocery|Store|Item|Qty
            const parts = payload.raw_data.split('|');
            if (parts[1].includes('grocery')) targetAlias = 'grocery';
        } else {
            targetAlias = (payload.target || 'grocery').toLowerCase();
        }

        // 2. Safely route to the sub-module
        const modulePath = path.join(__dirname, 'modules', `${targetAlias}.js`);
        
        if (!fs.existsSync(modulePath)) {
            logger.warn(`⚠️ User requested unknown sheet: ${targetAlias}`);
            return await context.bot.sendMessage(context.chatId, `❌ I don't have a configuration module for the '${targetAlias}' sheet yet.`);
        }

        // 3. Execute the module!
        const sheetLogic = require(modulePath);
        await sheetLogic(payload, context);
        
        return null; // Return null so bot.js knows we handled the messaging ourselves
    }
};