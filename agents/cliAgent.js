const util = require('util');
const exec = util.promisify(require('child_process').exec);

async function runCommand(command) {
  try {
    const { stdout, stderr } = await exec(command);
    let out = stdout.trim() || stderr.trim() || "(Success: No output returned)";
    
    // Truncate if it's too long for Telegram
    if (out.length > 3500) {
      out = out.substring(0, 3500) + '\n...[TRUNCATED DUE TO LENGTH]';
    }
    
    // Escape HTML to prevent Telegram 400 Bad Request errors
    return out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  } catch (err) {
    const errorText = err.stderr || err.message;
    return `Error:\n${errorText}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

module.exports = { runCommand };