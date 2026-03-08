const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let currentDir = process.cwd(); 

const runCommand = async (command) => {
    if (command.startsWith('cd ')) {
        const dir = command.replace('cd ', '').trim();
        try {
            const testCmd = `cd "${dir}" && pwd`;
            const { stdout } = await execPromise(testCmd, { cwd: currentDir });
            currentDir = stdout.trim();
            return `Changed directory to: ${currentDir}`;
        } catch (err) {
            return `cd: ${dir}: No such file or directory`;
        }
    }
    
    try {
        const { stdout, stderr } = await execPromise(command, { cwd: currentDir, timeout: 15000 });
        let output = stdout || stderr || "Command executed successfully with no output.";
        return output.substring(0, 3000); 
    } catch (err) {
        let errOutput = err.stderr || err.stdout || err.message;
        return `[Terminal Error]\n${errOutput}`.substring(0, 3000);
    }
};

module.exports = {
    name: "cli",
    runCommand, 
    execute: async (parsedJson, context) => {
        const cmd = parsedJson.output;
        
        if (!cmd) throw new Error("The AI failed to generate the bash command.");

        const isSafe = context.state.safeCommands.some(s => cmd.trim().startsWith(s));
        
        const safeCmd = context.escapeHTML ? context.escapeHTML(cmd) : cmd.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        if (isSafe) {
            const resultText = await runCommand(cmd);
            // FIX: Ensure the output is formatted properly and clearly shows the result
            return `💻 <b>Command:</b> <code>${safeCmd}</code>\n✅ <b>Result:</b>\n<pre>${context.escapeHTML ? context.escapeHTML(resultText) : resultText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        } else {
            const cid = Date.now().toString();
            context.state.pendingCommands.set(cid, cmd);
            context.bot.sendMessage(context.chatId, `💻 <b>Confirm Command:</b>\n<pre>${safeCmd}</pre>`, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: 'Run', callback_data: `run_${cid}` }, { text: 'Cancel', callback_data: 'cancel' }]] }
            });
            // FIX: Explicitly tell bot.js that we are handling the output asynchronously via buttons
            return null; 
        }
    }
};
