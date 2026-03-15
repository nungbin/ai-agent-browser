const path = require('path');
// 🛡️ Look for .env in the parent directory
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function runTest() {
    console.log("🔍 Starting ABAP Agent Systems Check (Subfolder Mode)...\n");

    console.log("1️⃣ Checking Environment Variables...");
    if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in .env");
    if (!process.env.SAP_HOST) throw new Error("Missing SAP_HOST in .env");
    console.log("   ✅ Variables found.");

    console.log("\n2️⃣ Loading MCP SDK...");
    // Use path.resolve to find node_modules in the parent folder
    const sdkPath = path.resolve(__dirname, '../node_modules/@modelcontextprotocol/sdk');
    const mcpSdk = await import(`${sdkPath}/dist/esm/client/index.js`);
    const mcpStdio = await import(`${sdkPath}/dist/esm/client/stdio.js`);
    console.log("   ✅ SDK loaded from parent node_modules.");

    console.log("\n3️⃣ Booting MCP ADT Server & Connecting to SAP...");
    
    const sapUrl = `http://${process.env.SAP_HOST}:8000`;
    console.log(`   -> Target SAP URL: ${sapUrl}`);

    // 🛡️ Ensure we point to the local bin in the parent folder
    const localBin = path.resolve(__dirname, '../node_modules/@mcp-abap-adt/core/bin/mcp-abap-adt.js');
    const commandLine = `node ${localBin}`;

    console.log(`   -> Executing: ${commandLine}`);

    const transport = new mcpStdio.StdioClientTransport({
        command: "node",
        args: [localBin],
        env: {
            ...process.env, 
            SAP_SYSTEM_URL: sapUrl,
            SAP_USER: process.env.SAP_USER,
            SAP_PASSWORD: process.env.SAP_PASSWORD,
            SAP_CLIENT: process.env.SAP_CLIENT || '001'
        }
    });

    const client = new mcpSdk.Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    
    try {
        console.log("   -> Attempting connection...");
        await client.connect(transport);
        console.log("   ✅ Connected to MCP Server.");
    } catch (connErr) {
        console.error("\n❌ CONNECTION ERROR:");
        console.error(`   > ${connErr.message}`);
        throw connErr;
    }

    console.log("\n4️⃣ Fetching Available ADT Tools from SAP...");
    const tools = await client.listTools();
    console.log(`   ✅ Success! Found ${tools.tools.length} ADT Tools.`);

    console.log("\n5️⃣ Testing Gemini 1.5 API Connection...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "I am testing my API connection. Please reply with exactly one word: 'READY'." }] }]
        })
    });
    
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "ERROR";
    console.log(`   ✅ Gemini says: ${reply}`);

    console.log("\n🎉 ALL SYSTEMS GO!");
    
    await transport.close();
    process.exit(0);
}

runTest().catch(err => {
    console.error("\n❌ TEST FAILED.");
    console.error(`   Reason: ${err.message}`);
    process.exit(1);
});