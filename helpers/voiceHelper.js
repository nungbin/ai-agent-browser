const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger');

exports.generateSpeech = (text, sandboxDir) => {
    return new Promise((resolve, reject) => {
        try {
            const cleanText = text.replace(/[*_#`]/g, '').replace(/[\u{1F600}-\u{1F6FF}]/gu, '');
            
            // Read accent from .env, default to British ('en-uk') 
            let accent = process.env.VOICE_ACCENT || 'en-uk'; 
            
            // Auto-correct if en-gb is accidentally used
            if (accent.toLowerCase() === 'en-gb') accent = 'en-uk';
            
            const gtts = new gTTS(cleanText, accent);
            const filePath = path.join(sandboxDir, `voice_reply_${Date.now()}.mp3`);
            
            gtts.save(filePath, function (err) {
                if (err) return reject(err);
                resolve(filePath);
            });
        } catch (error) {
            reject(error);
        }
    });
};

exports.transcribeAudio = async (fileLink, sttServerUrl, sandboxDir) => {
    const tempFilePath = path.join(sandboxDir, `voice_in_${Date.now()}.ogg`);
    try {
        const writer = fs.createWriteStream(tempFilePath);
        const response = await axios({ url: fileLink, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        const formData = new FormData();
        formData.append('audio', fs.createReadStream(tempFilePath));
        
        const sttResponse = await axios.post(sttServerUrl, formData, {
            headers: formData.getHeaders(),
            timeout: 30000
        });
        
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        return sttResponse.data.text;
    } catch (err) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        throw new Error(`Microservice failed: ${err.message}`);
    }
};
