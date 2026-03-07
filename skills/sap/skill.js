// File: skills/sap/skill.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

module.exports = {
    name: "sap",
    execute: async (parsedJson, context) => {
        const output = parsedJson.output;
        const action = parsedJson.action || "gui";
        
        const winIp = process.env.WINDOWS_HOST;
        const winUser = process.env.WINDOWS_USER;
        const sapSys = process.env.SAP_SYSTEM || "NPL";
        const sapClient = process.env.SAP_CLIENT || "001";
        const sapUser = process.env.SAP_USER;
        const sapPass = process.env.SAP_PASSWORD;

        if (action === "rfc") {
            return `🛰️ <b>SAP RFC Mode Triggered</b>\n<b>Target:</b> ${sapSys} Client ${sapClient}\n<b>Request:</b> <i>${output}</i>\n\n⚠️ <i>Headless data retrieval is currently in simulation mode.</i>`;
        }

        const missing = [];
        if (!winIp) missing.push("WINDOWS_HOST");
        if (!winUser) missing.push("WINDOWS_USER");
        if (!sapUser) missing.push("SAP_USER");
        if (!sapPass) missing.push("SAP_PASSWORD");

        if (missing.length > 0) throw new Error(`Missing in .env: <b>${missing.join(', ')}</b>`);

        const tcode = output.toUpperCase();
        const payload = `${sapSys}|${sapClient}|${sapUser}|${sapPass}|${tcode}`;

        await execPromise(`ssh ${winUser}@${winIp} 'echo "${payload}" > C:\\SAP_Bots\\payload.txt'`);
        await execPromise(`ssh ${winUser}@${winIp} 'schtasks /run /tn "LaunchSAP_NPL"'`);

        return `🚀 <b>SAP GUI Invoked (Remote Windows)</b>\n<b>System:</b> ${sapSys}\n<b>T-Code:</b> <code>${tcode}</code>\n\n<i>Visible window opened on monitor.</i>`;
    }
};