// File: skills/sap/rfc_modules/slg1.js
const logger = require('../../../helpers/logger');

module.exports = async (client, parsed, context) => {
    const chatId = context.chatId;
    
    // 1. DATES & TIMES
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1); 

    const formatToSAPDate = (dt) => {
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    };

    const payload = typeof parsed.output === 'object' && parsed.output !== null ? parsed.output : parsed;
    
    const dateFrom = payload.date_from || formatToSAPDate(yesterday);
    const dateTo   = payload.date_to   || formatToSAPDate(today);
    const timeFrom = payload.time_from || '000000';
    const timeTo   = payload.time_to   || '235959';
    const obj      = payload.object    || payload.OBJECT || '';
    const subobj   = payload.subobject || payload.SUBOBJECT || '';

    let scanMsg = `🔌 Scanning SAP SLG1 Logs...`;
    if (obj) scanMsg += ` (Object: <b>${obj}</b>)`;
    else scanMsg += ` (Scanning ALL Objects)`;
    
    await context.bot.sendMessage(chatId, scanMsg, { parse_mode: "HTML" });

    // 2. CALL RFC
    const rfcParams = {
        IV_DATE_FROM: dateFrom,
        IV_DATE_TO: dateTo,
        IV_TIME_FROM: timeFrom,
        IV_TIME_TO: timeTo,
        IV_ONLY_ERRORS: 'X' 
    };

    if (obj) rfcParams.IV_OBJECT = obj.toUpperCase();
    if (subobj) rfcParams.IV_SUBOBJECT = subobj.toUpperCase();

    const logResult = await client.call('Z_GET_SLG1_LOGS', rfcParams);
    const logs = logResult.ET_LOGS;

    if (!logs || logs.length === 0) {
        return await context.bot.sendMessage(chatId, `✅ SLG1 is clean! No application errors found.`);
    }

    const latestLog = logs[logs.length - 1];
    const recentError = `[${latestLog.OBJECT}/${latestLog.SUBOBJECT}] Time: ${latestLog.LOGTIME} | Type ${latestLog.MSGTY}: ${latestLog.MSGTEXT}`;
    
    await context.bot.sendMessage(chatId, `⚠️ Found ${logs.length} SLG1 errors. Analyzing the most recent one (GTX 1060 Optimized)...`, { parse_mode: "HTML" });

    const OLLAMA_URL = `http://${process.env.OLLAMA_IP || '127.0.0.1'}:11434/api/generate`;
    const aiModel = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
    
    // 3. 🚀 CHATML INJECTION
    // We physically inject the model's native tokens. 
    // We provide your exact favorite sentence as the "Assistant's" past behavior!
    const chatMLPrompt = `<|im_start|>system
You are an elite SAP Basis API. Your ONLY purpose is to summarize SAP errors into exactly two concise sentences (Business impact, then technical cause). You are physically incapable of using <think> tags.<|im_end|>
<|im_start|>user
SAP ERROR: [ZAGENT/TEST] Time: 062640 | Type W: AI Integration Test: Node-RFC Memory usage exceeded 85% limit.<|im_end|>
<|im_start|>assistant
The automated AI integration test process is failing due to insufficient system resources. Technically, this occurs because the Remote Function Call (RFC) node has exceeded its configured memory usage threshold of 85%.<|im_end|>
<|im_start|>user
SAP ERROR: ${recentError}<|im_end|>
<|im_start|>assistant
`; 
    
    let cleanAnalysis = "Analysis failed.";

    try {
        logger.info(`🤖 Sending single SLG1 error to Ollama using ChatML Injection...`);
        const res = await fetch(OLLAMA_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                model: aiModel, 
                prompt: chatMLPrompt, 
                raw: true,         // CRITICAL: Tells Ollama not to mess with our ChatML tags!
                stream: false,
                options: { 
                    num_predict: 150,  // Keep it low to force it to stop talking after 2 sentences
                    temperature: 0.1   
                }
            })
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const aiData = await res.json();

        if (aiData && typeof aiData.response === 'string') {
            // Because of ChatML injection, it shouldn't generate <think> tags at all anymore
            cleanAnalysis = aiData.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            
            if (cleanAnalysis === '') {
                cleanAnalysis = "AI generated an empty response after ChatML injection.";
                logger.error("AI returned an empty response string.");
            } else {
                logger.info(`✅ Successfully generated concise SLG1 analysis.`);
            }
        }
    } catch (error) {
        logger.error(`❌ Ollama Fetch Error: ${error.message}`);
        cleanAnalysis = `Connection to Ollama failed: ${error.message}`;
    }

    let safeAnalysis = cleanAnalysis.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    await context.bot.sendMessage(chatId, `🚨 <b>Latest Error Analysis:</b>\n\n${safeAnalysis}`, { parse_mode: "HTML" });
};