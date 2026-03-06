// File: agents/newsAgent.js
async function fetchNews() {
  try {
    // 1. Fetch the IDs of the current top 5 stories on Hacker News
    const topStoriesUrl = 'https://hacker-news.firebaseio.com/v0/topstories.json';
    const response = await fetch(topStoriesUrl);
    const storyIds = await response.json();
    
    // Grab just the first 5 IDs to keep the message clean
    const top5Ids = storyIds.slice(0, 5);
    
    let newsMessage = `📰 <b>Top Tech News Right Now:</b>\n\n`;

    // 2. Fetch the actual title and link for each story ID
    for (let i = 0; i < top5Ids.length; i++) {
      const storyUrl = `https://hacker-news.firebaseio.com/v0/item/${top5Ids[i]}.json`;
      const storyRes = await fetch(storyUrl);
      const story = await storyRes.json();
      
      // 3. Format as a clickable HTML link for Telegram
      // Format: <a href="URL">Title</a>
      if (story.url) {
        newsMessage += `🔹 <a href="${story.url}">${story.title}</a>\n\n`;
      } else {
        // Fallback for text-only posts (like "Ask HN")
        const hnLink = `https://news.ycombinator.com/item?id=${story.id}`;
        newsMessage += `🔹 <a href="${hnLink}">${story.title}</a>\n\n`;
      }
    }

    return newsMessage;

  } catch (error) {
    console.error(`[News Agent Error]: ${error.message}`);
    return `❌ Could not fetch the news right now.`;
  }
}

module.exports = { fetchNews };