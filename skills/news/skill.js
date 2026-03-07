// File: skills/news/skill.js
const axios = require('axios');
const https = require('https');
const httpsAgent = new https.Agent({ family: 4 });

module.exports = {
    name: "news",
    execute: async (parsedJson) => {
        // We use the public Hacker News API for zero-auth, high-quality tech news
        try {
            const topStoriesUrl = 'https://hacker-news.firebaseio.com/v0/topstories.json';
            const res = await axios.get(topStoriesUrl, { timeout: 10000, httpsAgent });
            
            // Get the top 5 story IDs
            const top5Ids = res.data.slice(0, 5);
            let newsMessage = "📰 <b>Latest Tech News:</b>\n\n";

            // Fetch details for each story
            for (const id of top5Ids) {
                const storyUrl = `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
                const storyRes = await axios.get(storyUrl, { timeout: 5000, httpsAgent });
                const title = storyRes.data.title;
                const url = storyRes.data.url || `https://news.ycombinator.com/item?id=${id}`;
                
                newsMessage += `🔹 <a href="${url}">${title}</a>\n`;
            }

            return newsMessage;
        } catch (error) {
            return `❌ <b>News Error:</b> Failed to fetch news. ${error.message}`;
        }
    }
};