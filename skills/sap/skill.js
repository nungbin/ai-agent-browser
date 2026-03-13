const fs = require('fs');
const path = require('path');

module.exports = {
    name: "sap",
    execute: async (parsed, context) => {
        const chatId = context.chatId;

        console.log("=== 🔍 RAW SAP JSON FROM AI ===", JSON.stringify(parsed, null, 2));

        // 🛡️ BULLET-PROOF PARSING
        const payload = typeof parsed.output === 'object' && parsed.output !== null ? parsed.output : parsed;
        
        // ==========================================
        // 🛡️ KEY NORMALIZATION GUARDRAIL 
        // Small models often hallucinate JSON keys. We aggressively check 
        // for variations to ensure the downstream modules get what they expect.
        // ==========================================
        payload.structure_name = payload.structure_name || payload.structureName || payload.structure || payload.name || "";
        payload.program_name = payload.program_name || payload.programName || payload.program || payload.name || "";
        payload.target_user = payload.target_user || payload.targetUser || payload.user || payload.username || "";
        // ==========================================

        let action = String(payload.action || payload.Action || "").toLowerCase().trim();
        let tcode = String(payload.tcode || payload.TCode || "").toUpperCase().trim();
        let task = String(payload.task || payload.Task || "").toLowerCase().trim();

        // ==========================================
        // 🌟 DYNAMIC AUTO-DISCOVERY ROUTING
        // ==========================================
        const targetCommand = (task || tcode).toLowerCase();
        const rfcPath = path.join(__dirname, 'rfc_modules', `${targetCommand}.js`);
        
        if (action === 'gui' && targetCommand && fs.existsSync(rfcPath)) {
            console.log(`[Auto-Discovery] Headless RFC module found for '${targetCommand}'. Overriding GUI...`);
            action = 'rfc';
            task = targetCommand;
        }

        // ==========================================
        // 🛡️ THE MISSING GUARDRAIL FIX 🛡️
        // If the AI forgets to say "action": "gui", we catch ALL T-Codes here!
        // ==========================================
        if (!action || action === 'unknown') {
            if (tcode === 'SU01' || tcode === 'SE38' || tcode === 'SE11') {
                action = 'gui';
            } else if (task === 'slg1' || task === 'st22' || task === 'shortdumps') {
                action = 'rfc';
            } else {
                action = fs.existsSync(rfcPath) ? 'rfc' : 'gui'; // Ultimate fallback
            }
        }
        // ==========================================

        try {
            if (action === 'gui') {
                const modulePath = path.join(__dirname, 'gui_modules', 'sapgui.js');
                
                if (!fs.existsSync(modulePath)) {
                    await context.bot.sendMessage(chatId, `🛠️ The GUI module for Windows RPA is not built yet!`, { parse_mode: "Markdown" });
                    return null;
                }

                const sapguiLogic = require(modulePath);
                await sapguiLogic(payload, context);
                
            } else if (action === 'rfc') {
                if (!task || task === 'unknown') {
                    await context.bot.sendMessage(chatId, `⚠️ Unrecognized RFC task.`);
                    return null;
                }
                
                if (!fs.existsSync(rfcPath)) {
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
                const rfcLogic = require(rfcPath);
                await rfcLogic(client, parsed, context);
                await client.close();

            } else if (action === 'rest') {
                if (!task || task === 'unknown') return null;
                
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