// File: skills/sap/skill.js
const fs = require('fs');
const path = require('path');

module.exports = {
    name: "sap",
    execute: async (parsed, context) => {
        const chatId = context.chatId;

        console.log("=== 🔍 RAW SAP JSON FROM AI ===", JSON.stringify(parsed, null, 2));

        // 🛡️ BULLET-PROOF PARSING (Checks both the root level AND inside the 'output' object)
        const payload = typeof parsed.output === 'object' && parsed.output !== null ? parsed.output : parsed;
        
        const action = String(payload.action || payload.Action || "").toLowerCase().trim();
        const tcode = String(payload.tcode || payload.TCode || "").toUpperCase().trim();
        const task = String(payload.task || payload.Task || "unknown").toLowerCase().trim();

        try {
            if (action === 'gui') {
                await context.bot.sendMessage(chatId, `🖥️ Detected TCode *${tcode}*. Initializing Remote SAP GUI...`, { parse_mode: "Markdown" });
                // TODO: GUI Logic
                
            } else if (action === 'rfc') {
                if (task === 'unknown' || !task) {
                    await context.bot.sendMessage(chatId, `⚠️ Unrecognized RFC task.`);
                    return null;
                }
                
                const modulePath = path.join(__dirname, 'rfc_modules', `${task}.js`);
                if (!fs.existsSync(modulePath)) {
                    await context.bot.sendMessage(chatId, `🛠️ The RFC module for *${task}* is not built yet!`, { parse_mode: "Markdown" });
                    return null;
                }

                await context.bot.sendMessage(chatId, `🔌 Connecting via **SAP RFC** to execute: *${task}*...`, { parse_mode: "Markdown" });
                
                const rfc = require('node-rfc'); 
                const client = new rfc.Client({
                    ashost: process.env.SAP_HOST || '192.168.1.251',
                    sysnr: '00',
                    client: process.env.SAP_CLIENT || '001',
                    user: process.env.SAP_USER,
                    passwd: process.env.SAP_PASSWORD
                });

                await client.open();
                const rfcLogic = require(modulePath);
                await rfcLogic(client, parsed, context);
                await client.close();

            } else if (action === 'rest') {
                if (task === 'unknown' || !task) return null;
                
                const modulePath = path.join(__dirname, 'rest_modules', `${task}.js`);
                if (!fs.existsSync(modulePath)) return null;

                await context.bot.sendMessage(chatId, `🌐 Connecting via **SAP REST/OData** to execute: *${task}*...`, { parse_mode: "Markdown" });
                
                const restLogic = require(modulePath);
                await restLogic(parsed, context); 
            } else {
                await context.bot.sendMessage(chatId, `⚠️ AI Confusion! It chose SAP, but set action to: "${action}"`);
            }
            
            return null; 

        } catch (error) {
            console.error("SAP Skill Error:", error);
            await context.bot.sendMessage(chatId, `❌ *SAP Skill Failed:*\n\`${error.message}\``, { parse_mode: "Markdown" });
            return null;
        }
    }
};
