// File: regression_testing/test_router.js
require('dotenv').config({ path: '../.env' });
const fs = require('fs').promises;
const path = require('path');

const OLLAMA_IP = process.env.OLLAMA_IP || '127.0.0.1';
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
const OLLAMA_URL = `http://${OLLAMA_IP}:11434/api/generate`;

// 🧪 COMPREHENSIVE TEST SCENARIOS
const testCases = [
    { prompt: "get me news", expectedIntent: "news" },
    { prompt: "what is the weather in London", expectedIntent: "weather" },
    { prompt: "Check ST22 in SAP", expectedIntent: "sap", expectedAction: "gui" },
    { prompt: "query the latest sales orders in SAP", expectedIntent: "sap", expectedAction: "rfc" },
    { prompt: "run pwd", expectedIntent: "cli", expectedOutput: "pwd" },
    { prompt: "run pld", expectedIntent: "cli", expectedOutput: "pwd" }, // STT Typo Auto-Correction Test
    { prompt: "P WD", expectedIntent: "cli", expectedOutput: "pwd" },    // STT Typo Auto-Correction Test
    { prompt: "write a c program hello.c which prints hello world", expectedIntent: "write_file", expectedFilename: "hello.c" },
    { prompt: "read the latest row from my google sheet", expectedIntent: "sheets" },
    { prompt: "go to google.com and scrape the headlines", expectedIntent: "browser" },
    { prompt: "how are you doing today?", expectedIntent: "chat" }
];

async function loadDynamicPrompt() {
    let dynamicPromptAdditions = "";
    const skillsDir = path.join(__dirname, '..', 'skills');
    try {
        const folders = await fs.readdir(skillsDir);
        for (const folder of folders) {
            try {
                const mdContent = await fs.readFile(path.join(skillsDir, folder, 'skill.md'), 'utf8');
                dynamicPromptAdditions += `\n${mdContent.trim()}\n`;
            } catch (e) { }
        }
    } catch(e) { }
    
    const promptTemplate = await fs.readFile(path.join(__dirname, '..', 'prompts', 'system_prompt.txt'), 'utf8');
    return promptTemplate.replace(/\{\{DYNAMIC_SKILLS\}\}/g, dynamicPromptAdditions);
}

async function testOllama() {
    console.log(`\n🧪 Starting Router Regression Test against ${CORE_MODEL}\n`);
    let basePrompt = await loadDynamicPrompt();
    let passed = 0;
    
    for (const test of testCases) {
        process.stdout.write(`Testing: "${test.prompt}"... `);
        
        // Simulating the Persona injection from bot.js
        const finalPrompt = basePrompt
            .replace(/\{\{BOT_PERSONA\}\}/g, 'You are an advanced AI assistant.')
            .replace(/\{\{BOT_NAME\}\}/g, 'Veronica')
            .replace(/\{\{USER_NAME\}\}/g, 'Tester')
            .replace(/\{\{CONVERSATION_HISTORY\}\}/g, 'No prior context.')
            .replace(/\{\{USER_MESSAGE\}\}/g, test.prompt);

        try {
            const res = await fetch(OLLAMA_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: CORE_MODEL, prompt: finalPrompt, stream: false, format: 'json' })
            });
            const data = await res.json();
            let cleanStr = (data.response || "").replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
            cleanStr = cleanStr.substring(cleanStr.indexOf('{'), cleanStr.lastIndexOf('}') + 1);
            
            const parsed = JSON.parse(cleanStr);
            let isPass = true;
            let errorMsg = "";

            if (parsed.intent !== test.expectedIntent) {
                isPass = false;
                errorMsg = `Wrong Intent (Got: ${parsed.intent})`;
            } else if (test.expectedAction && parsed.action !== test.expectedAction) {
                isPass = false;
                errorMsg = `Wrong Action (Got: ${parsed.action})`;
            } else if (test.expectedFilename && parsed.filename !== test.expectedFilename) {
                isPass = false;
                errorMsg = `Wrong Filename (Got: ${parsed.filename})`;
            } else if (test.expectedOutput && parsed.output !== test.expectedOutput) {
                isPass = false;
                errorMsg = `Wrong Output/Command (Got: ${parsed.output})`;
            }
            
            if (isPass) {
                console.log(`✅ PASS`);
                passed++;
            } else {
                console.log(`❌ FAIL -> ${errorMsg}`);
            }
        } catch (error) { 
            console.log(`❌ FAIL -> JSON Parse or Timeout Error`); 
        }
    }
    console.log(`\n🏁 Test Complete: ${passed}/${testCases.length} Passed.\n`);
}

testOllama();
