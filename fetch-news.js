const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs'); // Node's built-in file system module

puppeteer.use(StealthPlugin());

(async () => {
  console.log('Launching background browser...');
  
  // Launching in headless mode since we don't need to see it working
  const browser = await puppeteer.launch({
    headless: true, 
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();
  
  // Define our source
  const targetUrl = 'https://news.ycombinator.com/';
  const sourceSite = 'Hacker News (YCombinator)';

  console.log(`Navigating to ${sourceSite}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  console.log('Extracting top 5 articles...');
  
  // Run JavaScript inside the webpage to scrape the DOM
  const articles = await page.evaluate(() => {
    // Grab all the headline link elements
    const rows = document.querySelectorAll('.titleline > a');
    const topNews = [];
    
    // Loop through the first 5
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      topNews.push({
        title: rows[i].innerText,
        link: rows[i].href
      });
    }
    return topNews;
  });

  await browser.close();

  // --- OUTPUT 1: Terminal Log ---
  console.log(`\n======================================`);
  console.log(` TOP 5 NEWS FROM: ${sourceSite}`);
  console.log(`======================================\n`);
  
  articles.forEach((article, index) => {
    console.log(`${index + 1}. ${article.title}`);
    console.log(`   Link: ${article.link}\n`); // Clickable in most modern SSH terminals
  });

  // --- OUTPUT 2: Clickable HTML File ---
  // We dynamically generate an HTML file so you have a permanent, styled, clickable list
  let htmlContent = `
    <html>
      <head>
        <title>Top News</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
        <h2 style="color: #333;">Top 5 News from: <strong>${sourceSite}</strong></h2>
        <hr>
        <ul style="line-height: 1.8;">
  `;

  articles.forEach(article => {
    htmlContent += `
      <li style="margin-bottom: 15px;">
        <a href="${article.link}" target="_blank" style="text-decoration: none; color: #1a0dab; font-size: 18px; font-weight: bold;">
          ${article.title}
        </a>
      </li>
    `;
  });

  htmlContent += `</ul></body></html>`;

  // Save the HTML to your hard drive
  fs.writeFileSync('top-news.html', htmlContent);
  console.log('✅ Success! An HTML file named "top-news.html" has been generated in your folder.');

})();
