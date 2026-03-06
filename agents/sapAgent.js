// File: agents/sapAgent.js
require('dotenv').config();
const { exec } = require('child_process');
const axios = require('axios');
// const noderfc = require('node-rfc'); 

// === PULL CREDENTIALS FROM .ENV ===
const { 
    WINDOWS_IP, 
    WINDOWS_USER, 
    SAP_SYSTEM_NAME, 
    SAP_CLIENT, 
    SAP_USER, 
    SAP_PASS 
} = process.env;

const SAP_ROUTING_TABLE = {
    "st22": {
        method: "GUI_SCRIPTING",
        scriptPath: "C:\\sap_scripts\\sap_gui_scraper.py",
        pythonPath: "python" 
    },
    "health_check": {
        method: "GUI_SCRIPTING",
        scriptPath: "C:\\sap_scripts\\sap_gui_scraper.py",
        pythonPath: "python"
    },
    "get_users": {
        method: "RFC",
        bapiName: "BAPI_USER_GETLIST"
    }
};

async function querySap(taskName) {
    const route = SAP_ROUTING_TABLE[taskName.toLowerCase()];

    if (!route) throw new Error(`I don't have a configured route for SAP task: "${taskName}"`);
    console.log(`[SAP Agent] Routing task '${taskName}' via ${route.method}...`);

    switch (route.method) {
        case "GUI_SCRIPTING":
            return await runGuiScriptOverSsh(route, taskName);
        case "RFC":
            return await runRfcCall(route);
        default:
            throw new Error(`Unknown routing method: ${route.method}`);
    }
}

async function runGuiScriptOverSsh(route, taskName) {
    return new Promise((resolve, reject) => {
        // Cold Start Injection: Passing variables straight from the .env into the Windows Python script
        const sshCommand = `ssh -o StrictHostKeyChecking=no ${WINDOWS_USER}@${WINDOWS_IP} "${route.pythonPath} ${route.scriptPath} ${taskName} \\"${SAP_SYSTEM_NAME}\\" ${SAP_CLIENT} ${SAP_USER} \\"${SAP_PASS}\\""`;

        exec(sshCommand, { timeout: 45000 }, (error, stdout, stderr) => {
            if (error) return reject(new Error(`SSH GUI Execution Failed: ${stderr || error.message}`));
            if (stdout.includes("ERROR:")) return reject(new Error(stdout.trim()));
            resolve(`🖥️ **SAP GUI Script Execution:**\n<pre>${stdout.trim()}</pre>`);
        });
    });
}

async function runRfcCall(route) {
    return `🔌 **SAP RFC Execution:**\nSuccessfully called ${route.bapiName} (Mocked Data).`;
}

module.exports = { querySap };