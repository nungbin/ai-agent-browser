// File: regression_testing/test_router.js
require('dotenv').config({ path: '../.env' });
const fs = require('fs').promises;
const path = require('path');

const OLLAMA_IP = process.env.OLLAMA_IP || '127.0.0.1';
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';
const OLLAMA_URL = `http://${OLLAMA_IP}:11434/api/generate`;

// Define the tests
const testCases = [
    { prompt: "get me news", expectedIntent: "news" },
    { prompt: "what is the weather in London", expectedIntent: "weather" },
    { prompt: "Check ST22 in SAP", expectedIntent: "sap" },
    { prompt: "run pwd", expectedIntent: "cli" },
    { prompt: "write a python script that prints hello world", expectedIntent: "write_file" },
    { prompt: "read the latest row from my google sheet", expectedIntent: "sheets" },
    { prompt: "how are you doing today?", expectedIntent: "chat" }
];

async function loadDynamicPrompt() {
    console.log("Loading dynamic skills from ../skills...");
    let dynamicPromptAdditions = "";
    const skillsDir = path.join(__dirname, '..', 'skills');
    
    try {
        const folders = await fs.readdir(skillsDir);
        for (const folder of folders) {
            const mdPath = path.join(skillsDir, folder, 'skill.md');
            try {
                const mdContent = await fs.readFile(mdPath, 'utf8');
                dynamicPromptAdditions += `\n${mdContent.trim()}\n`;
            } catch (e) {
                // Ignore folders without skill.md
            }
        }
    } catch(e) {
        console.error("Failed to read skills directory:", e);
    }
    
    const basePromptPath = path.join(__dirname, '..', 'prompts', 'system_prompt.txt');
    const promptTemplate = await fs.readFile(basePromptPath, 'utf8');
    
    return promptTemplate.replace('{{DYNAMIC_SKILLS}}', dynamicPromptAdditions);
}

async function testOllama() {
    console.log(`\n🧪 Starting Router Regression Test against ${CORE_MODEL}\n`);
    
    let basePrompt;
    try {
        basePrompt = await loadDynamicPrompt();
    } catch (error) {
        console.error("❌ Failed to build prompt:", error);
        return;
    }

    let passed = 0;
    
    for (const test of testCases) {
        process.stdout.write(`Testing: "${test.prompt}"... `);
        
        // Inject conversation history (empty) and user message
        const finalPrompt = basePrompt
            .replace(/\{\{BOT_PERSONA\}\}/g, 'You are an advanced AI assistant.')
            .replace(/\{\{BOT_NAME\}\}/g, 'Veronica')
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
                    format: 'json'
                })
            });
            
            const data = await res.json();
            let rawStr = data.response || data.thinking || "";
            
            // Clean JSON
            let cleanStr = rawStr.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```json|```/gi, '').trim();
            const firstBrace = cleanStr.indexOf('{');
            const lastBrace = cleanStr.lastIndexOf('}');
            if (firstBrace === -1 || lastBrace === -1) throw new Error("Invalid JSON");
            
            cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(cleanStr);
            
            if (parsed.intent === test.expectedIntent) {
                console.log(`✅ PASS (Intent: ${parsed.intent})`);
                passed++;
            } else {
                console.log(`❌ FAIL (Expected: ${test.expectedIntent}, Got: ${parsed.intent})`);
                console.log(`   Output JSON: ${JSON.stringify(parsed)}`);
            }
            
        } catch (error) {
            console.log(`❌ FAIL (Error: ${error.message})`);
        }
    }
    
    console.log(`\n🏁 Test Complete: ${passed}/${testCases.length} Passed.\n`);
}

testOllama();