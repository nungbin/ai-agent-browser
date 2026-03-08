const fs = require('fs').promises;
const path = require('path');

module.exports = {
    name: "write_file",
    execute: async (parsedJson, context) => {
        let filename = parsedJson.filename;
        let content = parsedJson.output;
        
        // SELF-HEALING: If the AI hallucinates and nests JSON inside the "output" field
        if (typeof content === 'string' && content.trim().startsWith('{') && content.includes('"filename"')) {
            try {
                const nested = JSON.parse(content.trim());
                filename = nested.filename || filename;
                // It might call it 'content' or 'output' inside the nested JSON
                content = nested.content || nested.output || content; 
            } catch (e) {
                // If it fails to parse, just treat it as raw text
            }
        }

        // 1. Fallback and Security
        filename = filename || `snippet_${Date.now()}.txt`;
        const safeFileName = path.basename(filename);
        const filePath = path.join(context.state.SANDBOX_DIR, safeFileName);
        
        // 2. Remove markdown artifacts or conversational text mixed with C code
        if (typeof content === 'string') {
            if (content.includes('```')) {
                const m = content.match(/```[a-zA-Z]*\n?([\s\S]*?)```/);
                if (m) content = m[1].trim();
            } else if (safeFileName.endsWith('.c') && content.includes('#include')) {
                content = content.substring(content.indexOf('#include'));
            }
        }
        
        // 3. Write the file safely
        await fs.writeFile(filePath, content, 'utf8');
        
        // 4. Escape HTML for Telegram (<stdio.h> fix)
        const escapedContent = context.escapeHTML 
            ? context.escapeHTML(content) 
            : content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return `💾 <b>File Created:</b> <code>sandbox/${safeFileName}</code>\n<pre>${escapedContent.substring(0, 1000)}${escapedContent.length > 1000 ? '\n...[TRUNCATED]' : ''}</pre>`;
    }
};
