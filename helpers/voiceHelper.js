// File: helpers/voiceHelper.js
const gTTS = require('gtts');
const path = require('path');

exports.generateSpeech = (text, sandboxDir) => {
    return new Promise((resolve, reject) => {
        try {
            const cleanText = text.replace(/[*_#`]/g, '').replace(/[\u{1F600}-\u{1F6FF}]/gu, '');
            const gtts = new gTTS(cleanText, 'en');
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