// File: agents/sapAgent.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Routes SAP requests to either GUI (T-Code) or RFC (Data)
 * @param {string} output - The T-Code or Search Query
 * @param {string} action - "gui" or "rfc"
 */
async function querySap(output, action = "gui") {
    const winIp = process.env.WINDOWS_HOST;
    const winUser = process.env.WINDOWS_USER;
    const sapSys = process.env.SAP_SYSTEM || "NPL";
    const sapClient = process.env.SAP_CLIENT || "001";
    const sapUser = process.env.SAP_USER;
    const sapPass = process.env.SAP_PASSWORD;

    if (action === "rfc") {
        console.log(`[SAP-RFC] Headless query for: ${output}`);
        return `🛰️ <b>SAP RFC Mode Triggered</b>\n` +
               `<b>Target:</b> ${sapSys} Client ${sapClient}\n` +
               `<b>Request:</b> <i>${output}</i>\n\n` +
               `⚠️ <i>Note: Headless data retrieval (RFC) is currently in simulation mode. No GUI will open.</i>`;
    }

    // --- GUI Logic (T-Code) ---
    // SMART ERROR CHECKING
    const missingVars = [];
    if (!winIp) missingVars.push("WINDOWS_HOST");
    if (!winUser) missingVars.push("WINDOWS_USER");
    if (!sapUser) missingVars.push("SAP_USER");
    if (!sapPass) missingVars.push("SAP_PASSWORD");

    if (missingVars.length > 0) {
        throw new Error(`Missing the following variables in your .env file: <b>${missingVars.join(', ')}</b>`);
    }

    try {
        const tcode = output.toUpperCase();
        const payload = `${sapSys}|${sapClient}|${sapUser}|${sapPass}|${tcode}`;

        // Drop Payload
        const dropPayloadCmd = `ssh ${winUser}@${winIp} 'echo "${payload}" > C:\\SAP_Bots\\payload.txt'`;
        console.log(`[SAP] Executing: ${dropPayloadCmd}`);
        await execPromise(dropPayloadCmd);

        // Trigger Task
        const triggerTaskCmd = `ssh ${winUser}@${winIp} 'schtasks /run /tn "LaunchSAP_NPL"'`;
        console.log(`[SAP] Executing: ${triggerTaskCmd}`);
        await execPromise(triggerTaskCmd);

        return `🚀 <b>SAP GUI Invoked (Remote Windows)</b>\n` +
               `<b>System:</b> ${sapSys} (${sapClient})\n` +
               `<b>T-Code:</b> <code>${tcode}</code>\n\n` +
               `<i>Visible window opened on Windows monitor.</i>`;
    } catch (error) {
        throw new Error(`GUI Invocation Failed: ${error.message}`);
    }
}

module.exports = { querySap };