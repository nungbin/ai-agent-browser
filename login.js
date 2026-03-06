const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  console.log('Launching REAL Google Chrome with Stealth...');
  
  const browser = await puppeteer.launch({
    headless: false, 
    userDataDir: './auth-profile', 
    executablePath: '/usr/bin/google-chrome', // <-- THIS IS THE MAGIC BULLET
    ignoreDefaultArgs: ['--enable-automation'], // <-- Hides the automation banner
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  
  await page.goto('https://accounts.google.com');
  
  console.log("Browser is open! Try logging in manually now.");
  console.log("Once you are logged in, close the browser window.");
})();
