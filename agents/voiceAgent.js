const axios = require('axios');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');

async function processVoiceNote(fileUrl, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await axios({ url: fileUrl, method: 'GET', responseType: 'stream' });
      const tempInput = './temp_voice.oga';
      const writer = fs.createWriteStream(tempInput);
      
      response.data.pipe(writer);
      
      writer.on('finish', () => {
        ffmpeg(tempInput)
          .toFormat('wav')
          .on('error', (err) => reject(err))
          .on('end', () => {
            fs.unlinkSync(tempInput); 
            resolve(`✅ Voice note converted to ${outputPath}. Ready for local Whisper transcription!`);
          })
          .save(outputPath);
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { processVoiceNote };