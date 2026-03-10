// File: skills/sheets/modules/grocery.js
const { google } = require('googleapis');
const logger = require('../../../helpers/logger');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function getSheetsClient() {
    const keyFilePath = path.join(process.cwd(), 'google-credentials.json');
    if (!fs.existsSync(keyFilePath)) throw new Error("google-credentials.json is missing from the root directory.");
    
    const auth = new google.auth.GoogleAuth({
        keyFile: keyFilePath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return google.sheets({ version: 'v4', auth });
}

module.exports = async (parsed, context) => {
    const chatId = context.chatId;
    const action = (parsed.action || 'search').toLowerCase();
    
    const spreadsheetId = process.env.SHEET_ID_GROCERY;
    if (!spreadsheetId) return await context.bot.sendMessage(chatId, "❌ Setup Error: SHEET_ID_GROCERY is missing from the .env file.");

    const sheets = await getSheetsClient();

    // ==========================================
    // SCENARIO 1: TELEGRAM BUTTON WAS TAPPED!
    // ==========================================
    if (action === 'button_click') {
        const parts = parsed.raw_data.split('|');
        if (parts[1] !== 'add_grocery') return; 
        
        const store = parts[2];
        const item = parts[3];
        const qty = parts[4] || '1';

        const idRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A:A' });
        const existingIds = idRes.data.values ? idRes.data.values.map(row => row[0]) : [];
        
        let newId;
        do {
            newId = crypto.randomBytes(4).toString('hex');
        } while (existingIds.includes(newId));

        const timestamp = new Date().toLocaleString('en-US'); 
        const createdBy = "bot@telegram.com";
        
        const newRow = [newId, store, item, "", qty, "", timestamp, "NO", createdBy, ""];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'A:J',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [newRow] }
        });

        logger.info(`✅ Added ${qty}x ${item} (${store}) to Grocery Sheet. ID: ${newId}`);

        if (context.messageId) {
            return await context.bot.editMessageText(`✅ <b>Added:</b> ${qty}x ${item} [${store}]\n<i>ID: ${newId}</i>`, {
                chat_id: chatId,
                message_id: context.messageId,
                parse_mode: 'HTML'
            });
        }
        return;
    }

    // ==========================================
    // SCENARIO 2: AI REQUESTS TO "ADD"
    // ==========================================
    if (action === 'add') {
        // 🌟 FIX: Check multiple keys in case Qwen 4B hallucinates the key name
        const item = parsed.item || parsed.search_term || parsed.name || parsed.query;
        let qty = parsed.quantity || 1;
        let store = parsed.store;

        if (!item) {
            // Log the actual payload so we can debug if Qwen goes crazy again!
            logger.error("⚠️ AI Failed to extract item. Raw payload:", parsed);
            return await context.bot.sendMessage(chatId, "⚠️ I understood you want to add something, but I couldn't extract the item name.");
        }

        if (!store) {
            logger.info(`⏳ Awaiting dynamic store selection for: ${item}`);
            
            const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'B:B' });
            const allStores = res.data.values ? res.data.values.map(r => r[0]).filter(Boolean) : [];
            
            let uniqueStores = [...new Set(allStores)].filter(s => s.toLowerCase() !== 'store').sort();
            if (uniqueStores.length === 0) uniqueStores = ['Costco', 'Superstore', 'T&T']; 

            const buttons = [];
            let currentRow = [];
            
            const safeItem = item.length > 20 ? item.substring(0, 20) : item;

            uniqueStores.forEach(s => {
                const safeStore = s.length > 15 ? s.substring(0, 15) : s;
                currentRow.push({ text: s, callback_data: `sheets|add_grocery|${safeStore}|${safeItem}|${qty}` });
                
                if (currentRow.length === 2) {
                    buttons.push(currentRow);
                    currentRow = [];
                }
            });
            
            if (currentRow.length > 0) {
                buttons.push(currentRow);
            }

            // 🌟 THE VERONICA PERSONA MAGIC 🌟
            // Because bot.js passed `usePersona: true` into the context, we can make her speak!
            const replyPrefix = context.usePersona 
                ? `👱‍♀️ You got it! Let me pull up the store list for you.\n\n` 
                : ``;

            return await context.bot.sendMessage(chatId, `${replyPrefix}🛒 Where should we buy <b>${item}</b>?`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons }
            });
        }
        
        const fakeParsed = { output: { action: 'button_click', raw_data: `sheets|add_grocery|${store}|${item}|${qty}` } };
        return await module.exports(fakeParsed, context);
    }

    // ==========================================
    // SCENARIO 3: AI REQUESTS TO "SEARCH"
    // ==========================================
    if (action === 'search' || action === 'read') {
        await context.bot.sendMessage(chatId, `📊 Scanning the active Grocery list...`);
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'A:J' });
        const rows = res.data.values;
        if (!rows || rows.length < 2) return await context.bot.sendMessage(chatId, `ℹ️ The grocery sheet is completely empty.`);

        const headers = rows[0].map(h => h.toLowerCase().trim());
        const storeIdx = headers.indexOf('store');
        const itemIdx = headers.indexOf('item');
        const qtyIdx = headers.indexOf('quantity');
        const pickedIdx = headers.indexOf('picked/removed');

        let activeItems = rows.slice(1).filter(r => (r[pickedIdx] ? r[pickedIdx].toUpperCase().trim() : 'YES') === 'NO');

        if (parsed.store) activeItems = activeItems.filter(r => r[storeIdx] && r[storeIdx].toLowerCase().includes(parsed.store.toLowerCase()));
        
        const searchTerm = parsed.search_term || parsed.item || parsed.query;
        if (searchTerm) activeItems = activeItems.filter(r => r[itemIdx] && r[itemIdx].toLowerCase().includes(searchTerm.toLowerCase()));

        if (activeItems.length === 0) return await context.bot.sendMessage(chatId, `✅ No active items found matching your criteria.`);

        let reply = `🛒 <b>GROCERY LIST (${activeItems.length}):</b>\n\n`;
        activeItems.forEach(r => {
            reply += `• <b>${r[itemIdx] || 'Item'}</b> (Qty: ${r[qtyIdx] || 1}) - [${r[storeIdx] || 'Unknown'}]\n`;
        });

        await context.bot.sendMessage(chatId, reply, { parse_mode: 'HTML' });
    }
};