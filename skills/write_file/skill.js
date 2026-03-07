// File: skills/write_file/skill.js
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: "write_file",
    execute: async (parsedJson, context) => {
        const content = parsedJson.output;
        
        if (!content) {
            throw new Error("The AI failed to generate the file content.");
        }

        // 1. Grab the filename from the AI, or generate a random one if it forgets
        let rawFileName = parsedJson.filename || `snippet_${Date.now()}.txt`;
        
        // 2. SECURITY: Force the filename to be just the file name (no directory traversal attacks)
        let safeFileName = path.basename(rawFileName);
        
        // 3. Construct the absolute path inside the Sandbox
        const filePath = path.join(context.state.SANDBOX_DIR, safeFileName);
        
        // 4. Clean up the output if the AI wrapped it in markdown code blocks
        let cleanContent = content;
        if (cleanContent.startsWith('```')) {
            const lines = cleanContent.split('\n');
            lines.shift(); // Remove the top ```python
            if (lines[lines.length - 1].startsWith('```')) lines.pop(); // Remove bottom ```
            cleanContent = lines.join('\n');
        }

        // 5. Write the file
        await fs.writeFile(filePath, cleanContent, 'utf8');
        
        return `✅ <b>File Created:</b> <code>sandbox/${safeFileName}</code>\n<pre>${cleanContent.substring(0, 500)}${cleanContent.length > 500 ? '...' : ''}</pre>`;
    }
};
