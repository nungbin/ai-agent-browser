const path = require('path');
const logger = require('../../helpers/logger');
const fs = require('fs');

global.activeAbapTasks = global.activeAbapTasks || new Set();

module.exports = {
    name: "abap_developer",
    execute: async (parsed, context) => {
        const chatId = context.chatId;
        const taskKey = `${chatId}`;
        if (global.activeAbapTasks.has(taskKey)) return; 
        global.activeAbapTasks.add(taskKey);

        const bot = context.bot;
        const payload = typeof parsed.output === 'object' && parsed.output !== null ? parsed.output : parsed;
        const userPrompt = payload.prompt || "Write a simple 'Hello World' ABAP class.";

        let transport;
        let statusMessage;
        const tempAuthFile = path.resolve(__dirname, `.mcp_auth_${Date.now()}.env`);

        const updateLog = async (newText) => {
            if (!statusMessage) return;
            try {
                const currentText = (statusMessage.text || "").replace("```text", "").replace("```", "").trim();
                const updated = `${currentText}\n> ${newText}`;
                await bot.editMessageText(`🤖 **ABAP Agent (Single-Pass)**\n\n\`\`\`text\n${updated}\n\`\`\``, { 
                    chat_id: chatId, 
                    message_id: statusMessage.message_id, 
                    parse_mode: 'Markdown' 
                });
            } catch (e) {} 
        };

        try {
            if (!process.env.GEMINI_API_KEY) {
                return await bot.sendMessage(chatId, "⚠️ Missing `GEMINI_API_KEY` in .env");
            }

            statusMessage = await bot.sendMessage(chatId, "🤖 **ABAP Agent Initializing...**\n\`\`\`text\n> Booting MCP Bridge...\n\`\`\`", { parse_mode: 'Markdown' });

            const sdkPath = path.resolve(__dirname, '../../node_modules/@modelcontextprotocol/sdk');
            const mcpSdk = await import(`${sdkPath}/dist/esm/client/index.js`);
            const mcpStdio = await import(`${sdkPath}/dist/esm/client/stdio.js`);
            const localBin = path.resolve(__dirname, '../../node_modules/@mcp-abap-adt/core/bin/mcp-abap-adt.js');
            
            const sapUrl = `http://${process.env.SAP_HOST}:8000`;
            const authContent = `SAP_SYSTEM_URL=${sapUrl}\nSAP_USER=${process.env.SAP_USER}\nSAP_PASSWORD=${process.env.SAP_PASSWORD}\nSAP_CLIENT=${process.env.SAP_CLIENT || '001'}\n`;
            fs.writeFileSync(tempAuthFile, authContent, 'utf8');

            transport = new mcpStdio.StdioClientTransport({
                command: "node",
                args: [localBin, `--env-path=${tempAuthFile}`], 
                env: process.env
            });

            const client = new mcpSdk.Client({ name: "veronica-agent", version: "1.0.0" }, { capabilities: {} });
            await client.connect(transport);
            await updateLog("Connected to SAP.");

            const systemPrompt = `You are a Senior ABAP Architect. 
Goal: ${userPrompt}

Available Tools:
1. adt_create_structure(name, package, description, content)
2. adt_activate_objects(name)

Respond in STRICT JSON format with a list of steps to execute.
Example:
{
  "steps": [
    { "tool": "adt_create_structure", "args": { "name": "ZTEST", "package": "$TMP", "description": "desc", "content": "raw_code" } },
    { "tool": "adt_activate_objects", "args": { "name": "ZTEST" } }
  ]
}`;

            await updateLog("Generating Execution Plan (1/1 API Calls)...");

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: systemPrompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const plan = JSON.parse(data.candidates[0].content.parts[0].text);
            await updateLog(`Plan Received: ${plan.steps.length} actions.`);

            for (const step of plan.steps) {
                await updateLog(`Executing ${step.tool}...`);
                try {
                    const result = await client.callTool({ name: step.tool, arguments: step.args });
                    await updateLog(`✅ Success: ${step.tool}`);
                } catch (toolErr) {
                    await updateLog(`⚠️ SAP Error: ${toolErr.message}`);
                }
            }

            await bot.sendMessage(chatId, "🎉 **ABAP Task Complete!**\nYour structure should now be visible in SAP.");

        } catch (error) {
            if (statusMessage) await bot.sendMessage(chatId, `❌ **Fatal Error:** ${error.message}`);
            logger.error("ABAP_AGENT_CRASH", error);
        } finally {
            if (transport) await transport.close();
            global.activeAbapTasks.delete(taskKey);
            if (fs.existsSync(tempAuthFile)) fs.unlinkSync(tempAuthFile);
        }
    }
};