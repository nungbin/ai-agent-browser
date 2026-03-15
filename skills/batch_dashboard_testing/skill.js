const { google } = require('googleapis');
const logger = require('../../helpers/logger');
const path = require('path');

module.exports = {
    name: "batch_dashboard_testing",
    execute: async (parsed, context) => {
        const chatId = context.chatId;
        const socketManager = context.socketManager; 
        
        if (!socketManager.isWindowsConnected()) {
            return "❌ <b>Connection Error:</b> The Surface Pro is not connected.";
        }

        // ONE message, edited repeatedly (Like SU01)
        let statusMsg = await context.bot.sendMessage(chatId, "📊 <b>Initializing Batch RPA...</b>", { parse_mode: 'HTML' });

        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: path.join(__dirname, '../../google-credentials.json'),
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            const sheets = google.sheets({ version: 'v4', auth });
            const spreadsheetId = process.env.SHEET_ID_BATCH_DASHBOARD_TESTING;
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'BATCH_DASHBOARD_TESTING!A2:C50', 
            });

            const rows = response.data.values;
            if (!rows) return "⚠️ Spreadsheet is empty.";

            const pendingTasks = [];
            rows.forEach((row, index) => {
                if (row[0] && (!row[2] || row[2].trim() !== 'Done')) {
                    pendingTasks.push({ year: row[0], jobTitle: row[1], rowNumber: index + 2 });
                }
            });

            if (pendingTasks.length === 0) {
                await context.bot.editMessageText("✅ <b>Queue Cleared:</b> Nothing pending.", { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
                return;
            }

            const payload = { type: "BATCH_DASHBOARD_TESTING", url: process.env.DASHBOARD_URL, tasks: pendingTasks };

            // Start the task and listen for updates
            const taskResult = await socketManager.executeSapTask(payload, async (updateMsg) => {
                // Add a small delay to prevent Telegram "Too Many Requests" errors
                await new Promise(r => setTimeout(r, 500));
                context.bot.editMessageText(`⚙️ <b>Batch Progress:</b>\n<i>${updateMsg}</i>`, { 
                    chat_id: chatId, 
                    message_id: statusMsg.message_id, 
                    parse_mode: 'HTML' 
                }).catch(() => {});
            });

            if (taskResult && taskResult.status === "Success") {
                for (const task of pendingTasks) {
                    await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: `BATCH_DASHBOARD_TESTING!C${task.rowNumber}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [['Done']] }
                    });
                }
                await context.bot.editMessageText(`✅ <b>Batch Success!</b>\nUpdated ${pendingTasks.length} records.`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            } else {
                await context.bot.editMessageText(`❌ <b>Batch Failed:</b> ${taskResult.error || 'Check logs.'}`, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
            }

        } catch (error) {
            logger.error("RPA_BRAIN_ERROR", error.message);
            await context.bot.editMessageText(`❌ <b>System Error:</b> ${error.message}`, { chat_id: chatId, message_id: statusMsg.message_id });
        }
    }
};