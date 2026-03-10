// File: skills/sap/rfc_modules/shortdumps.js
const logger = require('../../../helpers/logger');

module.exports = async (client, parsed, context) => {
    const chatId = context.chatId;
    
    // 1. TIMEZONE-SAFE DATES
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1); 

    const formatToSAPDate = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    };

    const dateFrom = formatToSAPDate(yesterday);
    const dateTo   = formatToSAPDate(today);
    
    await context.bot.sendMessage(chatId, `🔌 Scanning SAP ST22 Shortdumps...`, { parse_mode: "HTML" });

    // 2. CALL CUSTOM ABAP RFC
    const dumpResult = await client.call('Z_GET_LATEST_DUMPS', {
        IV_DATE_FROM: dateFrom,
        IV_DATE_TO: dateTo
    });

    const dumps = dumpResult.ET_DUMPS;
    if (!dumps || dumps.length === 0) {
        return await context.bot.sendMessage(chatId, `✅ System is healthy! No shortdumps found in SAP between ${dateFrom} and ${dateTo}.`);
    }

    // 3. AI ANALYSIS ON THE LATEST DUMP
    const latestDump = dumps[dumps.length - 1];
    await context.bot.sendMessage(chatId, `⚠️ Found a shortdump from user <b>${latestDump.UNAME}</b> on <b>${latestDump.DATUM}</b>. Analyzing root cause (GTX 1060 Optimized)...`, { parse_mode: "HTML" });

    // Fallback just in case DUMP_TEXT is empty
    const dumpText = latestDump.DUMP_TEXT || JSON.stringify(latestDump);

    const OLLAMA_URL = `http://${process.env.OLLAMA_IP || '127.0.0.1'}:11434/api/generate`;
    const aiModel = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
    
    // 3. FEW-SHOT PROMPTING FOR ST22
    // We provide a fake example so the AI blindly follows the pattern instead of trying to "think" about C++.
    const analysisPrompt = `Summarize the raw SAP ABAP shortdump in exactly two sentences. Explain what program crashed and the technical reason why.

Example 1:
SAP ERROR DUMP: Runtime Errors: COMPUTE_INT_ZERODIVIDE. ABAP Program: Z_CALCULATE_TAX. The termination occurred in line 45.
SUMMARY: The custom ABAP program Z_CALCULATE_TAX crashed during execution. This occurred due to a division by zero error at line 45.

Example 2:
SAP ERROR DUMP: ${dumpText.substring(0, 1500)}
SUMMARY:`; 
    
    let cleanAnalysis = "Analysis failed.";

    try {
        logger.info(`🤖 Sending ST22 dump to Ollama (${aiModel})...`);
        const res = await fetch(OLLAMA_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                model: aiModel, 
                prompt: analysisPrompt, 
                stream: false,
                options: { 
                    num_predict: 500, // We can lower this back down safely now
                    temperature: 0.1   
                }
            })
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const aiData = await res.json();

        if (aiData && typeof aiData.response === 'string') {
            cleanAnalysis = aiData.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            
            // Failsafe if it STILL completely fills the token limit with thoughts
            if (cleanAnalysis === '') {
                const thoughtMatch = aiData.response.match(/<think>([\s\S]*?)<\/think>/i);
                if (thoughtMatch) {
                    cleanAnalysis = `<i>[AI hit limit. Partial analysis:]</i>\n${thoughtMatch[1].trim()}`;
                    logger.info(`⚠️ WARNING: AI token limit hit for ST22. Partial thoughts extracted.`);
                } else if (aiData.thinking) {
                    cleanAnalysis = `<i>[AI hit limit.]</i>\n${aiData.thinking.trim()}`;
                    logger.info(`⚠️ WARNING: AI token limit hit for ST22. Thinking extracted.`);
                } else {
                    cleanAnalysis = "AI generated an empty response.";
                    logger.error("AI returned an empty response string for ST22.");
                }
            } else {
                logger.info(`✅ Successfully generated ST22 analysis.`);
            }
        }
    } catch (error) {
        logger.error(`❌ Ollama Fetch Error (ST22): ${error.message}`);
        cleanAnalysis = `Connection to Ollama failed: ${error.message}`;
    }

    // 4. TELEGRAM SAFETY ESCAPING
    let safeAnalysis = cleanAnalysis.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const MAX_TELEGRAM_LENGTH = 3800;
    if (safeAnalysis.length > MAX_TELEGRAM_LENGTH) {
        safeAnalysis = safeAnalysis.substring(0, MAX_TELEGRAM_LENGTH) + "\n\n<i>... [Truncated] 📝 Check terminal log for full analysis!</i>";
        logger.info(`⚠️ WARNING: Truncated Telegram ST22 message because it exceeded ${MAX_TELEGRAM_LENGTH} characters.`);
    }

    await context.bot.sendMessage(chatId, `🚨 <b>ST22 Dump Analysis:</b>\n\n${safeAnalysis}`, { parse_mode: "HTML" });
};