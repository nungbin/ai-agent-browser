// File: regression_testing/test_router.js
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const OLLAMA_URL = `http://${process.env.OLLAMA_IP || '127.0.0.1'}:11434/api/generate`;
const CORE_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:4b';

// ==========================================
// 1. THE TEST SUITE
// ==========================================
const tests = [
    {
        name: "CLI Execution",
        input: "run ls -al",
        expectedIntent: "cli",
        requiredKeys: ["output"]
    },
    {
        name: "CLI Compile",
        input: "compile hello.c",
        expectedIntent: "cli",
        requiredKeys: ["output"]
    },
    {
        name: "File Writing (Explicit)",
        input: "write a python script named test.py that prints hi",
        expectedIntent: "write_file",
        requiredKeys: ["filename", "output"]
    },
    {
        name: "File Writing (Implicit 1)",
        input: "write a program hello.c which prints hello world",
        expectedIntent: "write_file",
        requiredKeys: ["filename", "output"]
    },
    {
        name: "File Writing (Implicit 2)",
        input: "write a c program hello.c which prints hello world",
        expectedIntent: "write_file",
        requiredKeys: ["filename", "output"]
    },
    {
        name: "Weather without City",
        input: "what's the weather",
        expectedIntent: "clarify",
        requiredKeys: ["output"]
    },
    {
        name: "Weather with City",
        input: "what is the weather in Edmonton",
        expectedIntent: "weather",
        requiredKeys: ["output"]
    },
    {
        name: "SAP GUI Routing",
        input: "check SAP for ST22 dumps",
        expectedIntent: "sap",
        requiredKeys: ["output"]
    },
    {
        name: "Cron Scheduling",
        input: "check the weather in tokyo every morning at 8 am",
        expectedIntent: "schedule",
        requiredKeys: ["cron", "output"]
    }
];

// ==========================================
// 2. MOCK ROUTER PROMPT
// ==========================================
async function testLLM(userText) {
    const promptPath = path.join(__dirname, '../data/system_prompt.txt');
    let promptTemplate;
    
    try {
        promptTemplate = await fs.readFile(promptPath, 'utf8');
    } catch (e) {
        throw new Error(`Could not find system_prompt.txt at ${promptPath}. Please create it first!`);
    }

    const routerPrompt = promptTemplate
        .replace('{{CONVERSATION_HISTORY}}', 'No prior conversation.')
        .replace('{{USER_MESSAGE}}', userText);

    const res = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: CORE_MODEL,
            prompt: routerPrompt,
            format: 'json',
            stream: false
        })
    });

    const data = await res.json();
    let cleanStr = data.response.replace(/```json/gi, '').replace(/```/g, '').trim();
    const firstBrace = cleanStr.indexOf('{');
    const lastBrace = cleanStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
    
    return JSON.parse(cleanStr);
}

// ==========================================
// 3. TEST RUNNER
// ==========================================
async function runTests() {
    console.log(`🧪 Starting AI Regression Tests on model: [${CORE_MODEL}]...\n`);
    let passed = 0;

    for (const test of tests) {
        process.stdout.write(`Testing: ${test.name.padEnd(25)} `);
        try {
            const result = await testLLM(test.input);
            
            // Check Intent
            if (result.intent !== test.expectedIntent) {
                console.log(`❌ FAILED (Expected intent '${test.expectedIntent}', got '${result.intent}')`);
                continue;
            }

            // Check Required Keys
            let keysValid = true;
            for (const key of test.requiredKeys) {
                if (!result[key]) {
                    console.log(`❌ FAILED (Missing required key: '${key}')`);
                    console.log(`   LLM Output:`, result);
                    keysValid = false;
                    break;
                }
            }
            if (!keysValid) continue;

            console.log(`✅ PASSED`);
            passed++;
        } catch (e) {
            console.log(`❌ ERROR (${e.message})`);
        }
    }

    console.log(`\n📊 Test Summary: ${passed}/${tests.length} Passed.`);
    if (passed === tests.length) {
        console.log(`🚀 All tests passed! It is safe to deploy changes.`);
    } else {
        console.log(`⚠️ Warning: Prompt regression detected. Fix prompt before deploying.`);
    }
}

runTests();