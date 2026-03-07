// File: skills/write_file/skill.js
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: "write_file",
    execute: async (parsedJson, context) => {
        const filename = parsedJson.filename || 'snippet.txt';
        const filePath = path.join(context.state.SANDBOX_DIR, filename);
        let content = parsedJson.output;
        
        // Remove markdown artifacts
        if (content.includes('```')) {
            const m = content.match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
            if (m) content = m[1].trim();
        } else if (filename.endsWith('.c') && content.includes('#include')) {
            content = content.substring(content.indexOf('#include'));
        }
        
        await fs.writeFile(filePath, content, 'utf8');
        return `💾 <b>File Created:</b> <code>sandbox/${filename}</code>\n<pre>${content.substring(0, 1000)}${content.length > 1000 ? '\n...[TRUNCATED]' : ''}</pre>`;
    }
};