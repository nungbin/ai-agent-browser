// File: skills/sap/rfc_modules/shortdumps.js

module.exports = async (client, parsed, context) => {
    const chatId = context.chatId;
    
    // 1. DATES (Timezone Safe)
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1); 

    const formatToSAP = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    };

    // 2. CALL RFC
    const dumpResult = await client.call('Z_GET_LATEST_DUMPS', {
        IV_DATE_FROM: formatToSAP(yesterday),
        IV_DATE_TO: formatToSAP(today)
    });

    const dumps = dumpResult.ET_DUMPS;
    if (!dumps || dumps.length === 0) {
        return await context.bot.sendMessage(chatId, `✅ System is healthy! No shortdumps found.`);
    }

    // 3. HARDWARE-OPTIMIZED AI ANALYSIS
    const latestDump = dumps[dumps.length - 1];
    const uname = (latestDump.UNAME || "UNKNOWN").trim();
    
    await context.bot.sendMessage(chatId, `⚠️ Found a shortdump from user <b>${uname}</b>. Analyzing root cause (GTX 1060 Optimized)...`, { parse_mode: "HTML" });

    const dumpText = latestDump.DUMP_TEXT || JSON.stringify(latestDump);
    const OLLAMA_URL = `http://${process.env.OLLAMA_IP || '127.0.0.1'}:11434/api/generate`;
    const aiModel = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
    
    // AGGRESSIVE PROMPT: Forbid step-by-step thinking so 4B models don't get lost in C++ traces
    const analysisPrompt = `You are a strict SAP Basis AI. 
CRITICAL RULES: 
1. DO NOT output any internal thoughts, thinking processes, or step-by-step analysis. 
2. Skip directly to the final answer. 
3. Read the dump below and explain the root cause of the crash in exactly 2 simple sentences.

--- DUMP DATA ---
${dumpText.substring(0, 1500)}`; 
    
    console.log(`🤖 Sending SAP memory to Ollama (${aiModel}) on GTX 1060...`);

    const requestBody = { 
        model: aiModel, 
        prompt: analysisPrompt, 
        stream: false,
        options: {
            num_predict: 1024, 
            temperature: 0.1  
        }
    };

    let cleanAnalysis = "Analysis failed.";

    try {
        const res = await fetch(OLLAMA_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        if (!res.ok) {
            console.error(`❌ HTTP Error from Ollama: ${res.status} ${res.statusText}`);
            cleanAnalysis = `Analysis failed. Ollama HTTP Error: ${res.status}`;
        } else {
            const aiData = await res.json();
            
            console.log("=== 🔍 RAW OLLAMA AI RESPONSE ===", JSON.stringify(aiData, null, 2));

            if (aiData && typeof aiData.response === 'string') {
                cleanAnalysis = aiData.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                
                if (cleanAnalysis === '') {
                    console.log("⚠️ AI returned blank text after stripping tags. Salvaging from 'thinking' field...");
                    if (aiData.thinking) {
                        cleanAnalysis = `<i>[AI hit limit while thinking. Showing partial thoughts]</i>\n${aiData.thinking.trim()}`;
                    } else {
                        cleanAnalysis = "AI generated an empty response.";
                    }
                }
            } else {
                console.error("❌ Unexpected JSON format from Ollama!");
                cleanAnalysis = "Analysis failed. AI returned unexpected JSON.";
            }
        }
    } catch (error) {
        console.error("❌ Network/Fetch Error to Ollama:", error);
        cleanAnalysis = `Analysis failed. Connection to Ollama failed: ${error.message}`;
    }

    let safeAnalysis = cleanAnalysis.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // SAFETY NET: Custom Truncation Message
    const MAX_TELEGRAM_LENGTH = 3800;
    if (safeAnalysis.length > MAX_TELEGRAM_LENGTH) {
        console.log(`⚠️ Output was ${safeAnalysis.length} chars. Truncating to prevent Telegram crash.`);
        safeAnalysis = safeAnalysis.substring(0, MAX_TELEGRAM_LENGTH) + "\n\n<i>... [Truncated] 📝 Please check the bot's terminal log to read the full analysis!</i>";
    }

    await context.bot.sendMessage(chatId, `🚨 <b>SAP Dump Analysis:</b>\n\n${safeAnalysis}`, { parse_mode: "HTML" });
};
