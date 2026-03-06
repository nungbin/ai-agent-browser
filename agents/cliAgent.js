// File: agents/cliAgent.js
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 🧠 This variable tracks your persistent terminal location!
// It starts in the root directory where bot.js is running.
let currentCwd = process.cwd();

async function runCommand(command) {
    return new Promise((resolve, reject) => {
        const cleanCmd = command.trim();

        // ==========================================
        // 1. INTERCEPT 'cd' COMMANDS
        // ==========================================
        // Check if the command is exactly a cd command (e.g., 'cd sandbox', 'cd ..', 'cd')
        const cdMatch = cleanCmd.match(/^cd(?:\s+(.+))?$/);
        
        if (cdMatch) {
            let targetDir = cdMatch[1] || os.homedir(); // Default to home if just typing 'cd'
            
            // Strip any surrounding quotes (e.g., cd "my folder" -> my folder)
            targetDir = targetDir.replace(/^["']|["']$/g, '').trim();

            // Handle the Linux '~' home shortcut
            if (targetDir.startsWith('~')) {
                targetDir = path.join(os.homedir(), targetDir.slice(1));
            }

            // Resolve the new path relative to our CURRENT tracked directory
            const newCwd = path.resolve(currentCwd, targetDir);

            try {
                const stat = fs.statSync(newCwd);
                if (stat.isDirectory()) {
                    currentCwd = newCwd; // Update the persistent memory!
                    return resolve(`📂 Directory changed to:\n<pre>${currentCwd}</pre>`);
                } else {
                    return reject(new Error(`cd: ${targetDir}: Not a directory`));
                }
            } catch (err) {
                return reject(new Error(`cd: ${targetDir}: No such file or directory`));
            }
        }

        // ==========================================
        // 2. RUN NORMAL COMMANDS IN THE TRACKED CWD
        // ==========================================
        // Notice the `{ cwd: currentCwd }` option injected below!
        exec(command, { cwd: currentCwd, timeout: 15000 }, (error, stdout, stderr) => {
            let combinedOutput = '';

            if (stdout) combinedOutput += stdout;
            if (stderr) combinedOutput += `\n[STDERR Warning/Error]:\n${stderr}`;

            if (error) {
                if (!combinedOutput.trim()) combinedOutput = error.message;
                return reject(new Error(combinedOutput.trim() || "Command failed silently."));
            }

            resolve(combinedOutput.trim() || "✅ Command executed successfully (No output returned).");
        });
    });
}

module.exports = { runCommand };