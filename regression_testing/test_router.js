require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

console.log("=========================================");
console.log("🧪 AI ROUTER REGRESSION TESTER v4.0");
console.log("=========================================\n");

const OLLAMA_IP = process.env.OLLAMA_IP || '127.0.0.1';
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
const OLLAMA_URL = `http://${OLLAMA_IP}:11434/api/generate`;

// 🧪 COMPREHENSIVE TEST SCENARIOS
const testCases = [
    { prompt: "get me news", expectedIntent: "news" },
    { prompt: "what is the weather in London", expectedIntent: "weather" },
    { prompt: "Check ST22 in SAP", expectedIntent: "sap", expectedAction: "gui" },
    { prompt: "query the latest sales orders in SAP", expectedIntent: "sap", expectedAction: "rfc" },
    { prompt: "can you connect to SAP via RFC and get me the latest shortdumps?", expectedIntent: "sap", expectedAction: "rfc" },
    { 
        prompt: "Check the SLG1 logs for object ZAGENT subobject TEST", 
        expectedIntent: "sap", 
        expectedAction: "rfc",
        validateOutput: (parsed) => {
            const payload = parsed.output || parsed;
            return payload.task === 'slg1' && payload.object === 'ZAGENT' && payload.subobject === 'TEST';
        }
    },
    { prompt: "run pwd", expectedIntent: "cli", expectedOutput: "pwd" },
    { prompt: "run pld", expectedIntent: "cli", expectedOutput: "pwd" }, 
    { prompt: "P WD", expectedIntent: "cli", expectedOutput: "pwd" },    
    { prompt: "write a c program hello.c which prints hello world", expectedIntent: "write_file", expectedFilename: "hello.c" },
    { prompt: "read the latest row from my google sheet", expectedIntent: "sheets" },
    { prompt: "go to google.com and scrape the headlines", expectedIntent: "browser" },
    { prompt: "how are you doing today?", expectedIntent: "chat" }
];

async function loadDynamicPrompt() {
    let dynamicPromptAdditions = "";
    const skillsDir = path.join(__dirname, 'skills');
    
    try {
        const folders = await fs.readdir(skillsDir);
        for (const folder of folders) {
            try {
                const mdContent = await fs.readFile(path.join(skillsDir, folder, 'skill.md'), 'utf8');
                dynamicPromptAdditions += `\n${mdContent.trim()}\n`;
            } catch (e) { }
        }
    } catch(e) { }
    
    const promptPath = path.join(__dirname, 'prompts', 'system_prompt.txt');
    const promptTemplate = await fs.readFile(promptPath, 'utf8');
    return promptTemplate.replace(/\{\{DYNAMIC_SKILLS\}\}/g, dynamicPromptAdditions);
}

async function testOllama() {
    console.log(`🤖 Pinging Ollama (${CORE_MODEL}) at ${OLLAMA_URL}...\n`);
    let basePrompt;
    
    try {
        basePrompt = await loadDynamicPrompt();
    } catch (e) {
        console.error("❌ ERROR: Failed to load system prompt. Make sure prompts/system_prompt.txt exists!");
        process.exit(1);
    }
    
    let passed = 0;
    
    for (let i = 0; i < testCases.length; i++) {
        const test = testCases[i];
        process.stdout.write(`[Test ${i + 1}/${testCases.length}] Testing: "${test.prompt}"... `);
        
        const finalPrompt = basePrompt
            .replace(/\{\{BOT_PERSONA\}\}/g, 'You are an advanced AI assistant.')
            .replace(/\{\{BOT_NAME\}\}/g, 'Veronica')
            .replace(/\{\{USER_NAME\}\}/g, 'Tester')
            .replace(/\{\{CONVERSATION_HISTORY\}\}/g, 'No prior context.')
            .replace(/\{\{USER_MESSAGE\}\}/g, test.prompt);

        try {
            const res = await fetch(OLLAMA_URL, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    model: CORE_MODEL, 
                    prompt: finalPrompt, 
                    stream: false, 
                    format: 'json',
                    options: { temperature: 0.1 } 
                })
            });
            
            const data = await res.json();
            let cleanStr = (data.response || "").replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
            cleanStr = cleanStr.substring(cleanStr.indexOf('{'), cleanStr.lastIndexOf('}') + 1);
            
            const parsed = JSON.parse(cleanStr);
            let isPass = true;
            let errorMsg = "";

            const action = parsed.action || (parsed.output && parsed.output.action);
            const filename = parsed.filename || (parsed.output && parsed.output.filename);
            const outputStr = typeof parsed.output === 'string' ? parsed.output : undefined;

            if (parsed.intent !== test.expectedIntent) {
                isPass = false;
                errorMsg = `Wrong Intent (Got: ${parsed.intent})`;
            } else if (test.expectedAction && action !== test.expectedAction) {
                isPass = false;
                errorMsg = `Wrong Action (Got: ${action})`;
            } else if (test.expectedFilename && filename !== test.expectedFilename) {
                isPass = false;
                errorMsg = `Wrong Filename (Got: ${filename})`;
            } else if (test.expectedOutput && outputStr !== test.expectedOutput) {
                isPass = false;
                errorMsg = `Wrong Output/Command (Got: ${outputStr})`;
            } else if (test.validateOutput && !test.validateOutput(parsed)) {
                isPass = false;
                errorMsg = `Output validation failed for nested variables (e.g. SLG1 object/subobject)!`;
            }
            
            if (isPass) {
                console.log(`✅ PASS`);
                passed++;
            } else {
                console.log(`❌ FAIL -> ${errorMsg}`);
                console.log(`\n   Raw JSON: ${JSON.stringify(parsed)}`);
            }
        } catch (error) { 
            console.log(`❌ FAIL -> JSON Parse or Timeout Error (${error.message})`); 
        }
    }
    
    console.log(`\n🎯 REGRESSION TEST COMPLETE: ${passed}/${testCases.length} Passed.`);
    if (passed === testCases.length) {
        console.log("🚀 The Brain is 100% healthy. Ready for production!");
    } else {
        console.log("⚠️ WARNING: The AI System Prompt might need tweaking!");
    }
}

testOllama();