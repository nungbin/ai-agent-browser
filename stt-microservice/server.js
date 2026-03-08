// File: stt-microservice/server.js (Backup)
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { whisper } = require('whisper-node');

const app = express();
const port = 3000;
const upload = multer({ dest: 'uploads/' });

app.post('/transcribe', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
    const inputPath = req.file.path;
    const wavPath = `${inputPath}.wav`;

    console.log(`🎤 Received audio file. Converting to 16kHz WAV...`);

    try {
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath).toFormat('wav').audioFrequency(16000).audioChannels(1)
                .on('end', resolve).on('error', reject).save(wavPath);
        });
        
        console.log(`🧠 Transcribing with CPU Whisper (small.en model)...`);
        const transcript = await whisper(wavPath, { modelName: 'small.en' });
        const fullText = transcript.map(t => t.speech).join(' ').trim();
        
        console.log(`✅ Result: "${fullText}"`);
        res.json({ text: fullText });
    } catch (error) {
        console.error("❌ Transcription error:", error);
        res.status(500).json({ error: error.message });
    } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    }
});

app.listen(port, () => console.log(`🎙️ STT CPU Microservice running on port ${port}`));
