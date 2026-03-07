// File: agents/voiceAgent.js
const gTTS = require('gtts');
const path = require('path');
const fs = require('fs');

/**
 * Converts text into a spoken audio file (MP3)
 * @param {string} text - The text you want the bot to say
 * @returns {Promise<string>} - The file path to the generated audio
 */
function generateSpeech(text) {
    return new Promise((resolve, reject) => {
        try {
            // Remove markdown and emojis so the TTS engine doesn't read them out loud
            const cleanText = text.replace(/[*_#`]/g, '').replace(/[\u{1F600}-\u{1F6FF}]/gu, '');
            
            const gtts = new gTTS(cleanText, 'en');
            
            // Save to the sandbox directory
            const fileName = `voice_reply_${Date.now()}.mp3`;
            const filePath = path.join(__dirname, '..', 'sandbox', fileName);
            
            gtts.save(filePath, function (err, result) {
                if (err) return reject(err);
                resolve(filePath);
            });
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = { generateSpeech };