const axios = require('axios');
const https = require('https');

// Force IPv4 routing to bypass LXC container IPv6 connection drops
const httpsAgent = new https.Agent({ family: 4 });

// WMO Weather interpretation codes
function getWeatherDescription(code) {
  const weatherCodes = {
    0: 'Clear sky ☀️',
    1: 'Mainly clear 🌤️', 2: 'Partly cloudy ⛅', 3: 'Overcast ☁️',
    45: 'Fog 🌫️', 48: 'Depositing rime fog 🌫️',
    51: 'Light drizzle 🌧️', 53: 'Moderate drizzle 🌧️', 55: 'Dense drizzle 🌧️',
    56: 'Light freezing drizzle 🌧️❄️', 57: 'Dense freezing drizzle 🌧️❄️',
    61: 'Slight rain 🌧️', 63: 'Moderate rain 🌧️', 65: 'Heavy rain 🌧️',
    66: 'Light freezing rain 🌧️❄️', 67: 'Heavy freezing rain 🌧️❄️',
    71: 'Slight snow ❄️', 73: 'Moderate snow ❄️', 75: 'Heavy snow ❄️',
    77: 'Snow grains ❄️',
    80: 'Slight rain showers 🌧️', 81: 'Moderate rain showers 🌧️', 82: 'Violent rain showers 🌧️',
    85: 'Slight snow showers ❄️', 86: 'Heavy snow showers ❄️',
    95: 'Thunderstorm ⛈️', 96: 'Thunderstorm with slight hail ⛈️', 99: 'Thunderstorm with heavy hail ⛈️'
  };
  return weatherCodes[code] || 'Unknown ☁️';
}

async function getWeather(city) {
  try {
    // 1. Geocoding API: Turn city name into Latitude/Longitude
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`;
    
    // Inject the HTTPS Agent to force IPv4
    const geoResponse = await axios.get(geoUrl, { timeout: 10000, httpsAgent });

    if (!geoResponse.data.results || geoResponse.data.results.length === 0) {
        return `❌ Could not find location coordinates for "${city}".`;
    }

    const location = geoResponse.data.results[0];
    const lat = location.latitude;
    const lon = location.longitude;
    const locationName = `${location.name}, ${location.country}`; // e.g., "Edmonton, Canada"

    // 2. Weather API: Fetch the actual weather for those coordinates
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code`;
    
    // Inject the HTTPS Agent to force IPv4
    const weatherResponse = await axios.get(weatherUrl, { timeout: 10000, httpsAgent });

    const current = weatherResponse.data.current;
    const desc = getWeatherDescription(current.weather_code);

    return `🌤️ <b>Weather in ${locationName}:</b>
Condition: ${desc}
Temp: ${current.temperature_2m}°C
Feels Like: ${current.apparent_temperature}°C
Humidity: ${current.relative_humidity_2m}%`;

  } catch (error) {
    console.error(`[Weather Agent Error]: ${error.message}`);
    return `❌ Could not fetch weather data for ${city}.\n<i>Diagnostic: ${error.message}</i>`;
  }
}

module.exports = { getWeather };