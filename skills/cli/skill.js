// File: skills/cli/skill.js
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// FIX: Start in the folder where bot.js is executed, not the user's HOME
let currentDir = process.cwd(); 

const runCommand = async (command) => {
    if (command.startsWith('cd ')) {
        const dir = command.replace('cd ', '').trim();
        const testCmd = `cd "${dir}" && pwd`;
        const { stdout } = await execPromise(testCmd, { cwd: currentDir });
        currentDir = stdout.trim();
        return `Changed directory to: ${currentDir}`;
    }
    const { stdout, stderr } = await execPromise(command, { cwd: currentDir, timeout: 15000 });
    let output = stdout || stderr || "Command executed successfully with no output.";
    return output.substring(0, 3000); 
};

module.exports = {
    name: "cli",
    runCommand, 
    execute: async (parsedJson, context) => {
        const cmd = parsedJson.output;
        const isSafe = context.state.safeCommands.some(s => cmd.trim().startsWith(s));
        
        if (isSafe) {
            return `✅ <b>Result:</b>\n<pre>${await runCommand(cmd)}</pre>`;
        } else {
            const cid = Date.now().toString();
            context.state.pendingCommands.set(cid, cmd);
            context.bot.sendMessage(context.chatId, `💻 <b>Confirm Command:</b>\n<pre>${cmd}</pre>`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: 'Run', callback_data: `run_${cid}` }, { text: 'Cancel', callback_data: 'cancel' }]] }
            });
            return null; 
        }
    }
};