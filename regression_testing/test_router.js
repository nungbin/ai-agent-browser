// File: regression_testing/test_router.js
require('dotenv').config({ path: '../.env' });
const fs = require('fs').promises;
const path = require('path');

const OLLAMA_IP = process.env.OLLAMA_IP || '127.0.0.1';
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
const OLLAMA_URL = `http://${OLLAMA_IP}:11434/api/generate`;

const testCases = [
    { prompt: "get me news", expectedIntent: "news" },
    { prompt: "what is the weather in London", expectedIntent: "weather" },
    { prompt: "Check ST22 in SAP", expectedIntent: "sap" },
    { prompt: "run pwd", expectedIntent: "cli" },
    { prompt: "write a python script named hello.py that prints hello world", expectedIntent: "write_file", expectedFilename: "hello.py" },
    { prompt: "read the latest row from my google sheet", expectedIntent: "sheets" },
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
    return promptTemplate.replace('{{DYNAMIC_SKILLS}}', dynamicPromptAdditions);
}

async function testOllama() {
    console.log(`\n🧪 Starting Router Regression Test against ${CORE_MODEL}\n`);
    let basePrompt = await loadDynamicPrompt();
    let passed = 0;
    
    for (const test of testCases) {
        process.stdout.write(`Testing: "${test.prompt}"... `);
        const finalPrompt = basePrompt
            .replace('{{BOT_PERSONA}}', 'You are an AI.')
            .replace('{{BOT_NAME}}', 'TestBot')
            .replace('{{USER_NAME}}', 'Tester')
            .replace('{{CONVERSATION_HISTORY}}', 'No prior context.')
            .replace('{{USER_MESSAGE}}', test.prompt);

        try {
            const res = await fetch(OLLAMA_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: CORE_MODEL, prompt: finalPrompt, stream: false, format: 'json' })
            });
            const data = await res.json();
            let cleanStr = (data.response || "").replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
            cleanStr = cleanStr.substring(cleanStr.indexOf('{'), cleanStr.lastIndexOf('}') + 1);
            const parsed = JSON.parse(cleanStr);
            
            if (parsed.intent === test.expectedIntent) {
                if (test.expectedFilename && parsed.filename !== test.expectedFilename) console.log(`❌ FAIL (Bad Filename)`);
                else { console.log(`✅ PASS`); passed++; }
            } else console.log(`❌ FAIL (Got: ${parsed.intent})`);
        } catch (error) { console.log(`❌ FAIL (${error.message})`); }
    }
    console.log(`\n🏁 Test Complete: ${passed}/${testCases.length} Passed.\n`);
}
testOllama();
