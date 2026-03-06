const { exec } = require('child_process');

async function runCommand(command) {
    return new Promise((resolve, reject) => {
        // Run the command with a 15-second timeout to prevent infinite hangs
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            let combinedOutput = '';

            // 1. Capture the normal output
            if (stdout) {
                combinedOutput += stdout;
            }

            // 2. Capture the error warnings (this is what you missed!)
            if (stderr) {
                combinedOutput += `\n[STDERR Warning/Error]:\n${stderr}`;
            }

            // 3. Handle the actual crash/failure
            if (error) {
                if (!combinedOutput.trim()) {
                    combinedOutput = error.message;
                }
                // Reject the promise so bot.js catches it as a red ❌ failure
                return reject(new Error(combinedOutput.trim() || "Command failed silently."));
            }

            // 4. Handle commands that succeed but return completely blank text (like 'touch file.txt')
            resolve(combinedOutput.trim() || "✅ Command executed successfully (No output returned).");
        });
    });
}

module.exports = { runCommand };