// File: skills/weather/skill.js
const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({ family: 4 });

module.exports = {
    name: "weather",
    execute: async (parsedJson) => {
        const city = parsedJson.output;
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`;
        const geoResponse = await axios.get(geoUrl, { timeout: 10000, httpsAgent });
        if (!geoResponse.data.results) return `❌ Location not found.`;
        
        const loc = geoResponse.data.results[0];
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,weather_code`;
        const res = await axios.get(weatherUrl, { timeout: 10000, httpsAgent });
        
        return `🌤️ <b>Weather in ${loc.name}:</b>\nTemp: ${res.data.current.temperature_2m}°C\nFeels Like: ${res.data.current.apparent_temperature}°C`;
    }
};